/** Exercises the actual guided usage container and shared controls through owned browser ports. @module messaging-usage-container-tests */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SidebarInset, SidebarProvider, ThemedToaster } from "@golfo/ui";
import { Activity, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { AppUIProvider } from "@/components/providers/app-providers/app-ui-provider";
import { MessagingUsageContainer } from "@/app/(platform)/[slug]/academia/admissions/messaging/messaging-usage-container";
import type { MessagingUsagePageState } from "@/src/modules/messaging/application/results/messaging-usage-page-state";
import type { MessagingUsageBrowserClient } from "@/src/modules/messaging/application/ports/messaging-usage-browser-client";
import { readMessagingUsageIntent, writeMessagingUsageIntent } from "@/lib/messaging/messaging-usage-intent";
import { AdmissionSettingsPage } from "@/components/academy-admissions/admission-settings-page";
import { AdmissionWorkspaceRoute } from "@/tests/support/admission-workspace-route";
import { changeGuidedStep } from "@/tests/support/guided-steps";
import { MESSAGING_ERROR_CODE, MESSAGING_ERROR_MESSAGE } from "@/src/modules/messaging/constants/messaging-errors";
import { buildSignInRedirectUrl } from "@/lib/auth/sign-in-redirect";
import { SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";

const slug = "synthetic-academy", viewerId = "synthetic-leader", tribeId = "83ecbfaf-0e7c-4afb-aefc-62b62800d367", operationId = "297d47c2-5419-4c3d-a339-e8b7970275ca";
const savedText = "Los países y cupos quedaron guardados.", partialText = "La configuración se creó con los valores iniciales, pero todavía falta guardar lo que elegiste.";
const router = { back: vi.fn(), bfcacheId: "usage-container-test", forward: vi.fn(), prefetch: vi.fn(), push: vi.fn(), refresh: vi.fn(), replace: vi.fn() } satisfies AppRouterInstance;
type InitializeResult = Awaited<ReturnType<MessagingUsageBrowserClient["initialize"]>>;
type UpdateResult = Awaited<ReturnType<MessagingUsageBrowserClient["update"]>>;
/** Native router context and the real UI provider remain in use. */
function Providers({ children }: { children: ReactNode }) { return <AppRouterContext.Provider value={router}><AppUIProvider><SidebarProvider><SidebarInset>{children}</SidebarInset></SidebarProvider></AppUIProvider></AppRouterContext.Provider>; }
/** Supplies only current application state and feature-owned asynchronous outcomes. */
function fixture(configured = true) {
  const policy = { version: 3, allowedCountries: ["AR"], verificationDailyLimit: 100, notificationDailyLimit: 200, platformMaximums: { verificationDailyLimit: 1000, notificationDailyLimit: 5000 }, consumption: { verificationToday: 2, notificationToday: 1 } };
  const state: Extract<MessagingUsagePageState, { kind: "ready" }> = { kind: "ready", slug, tribeId, viewerId, renderedAt: "2026-10-07T12:00:00Z", usage: configured ? { state: "configured", policy } : { state: "not_configured", policy: null }, countryChoices: [{ value: "AR", label: "Argentina" }, { value: "US", label: "Estados Unidos" }] };
  const client = {
    viewer: vi.fn<MessagingUsageBrowserClient["viewer"]>(async () => ({ status: "ready", value: { id: viewerId } })),
    read: vi.fn<MessagingUsageBrowserClient["read"]>(async () => ({ status: "ready", value: { state: "configured", policy } })),
    operation: vi.fn<MessagingUsageBrowserClient["operation"]>(async () => ({ status: "failed", code: "resource_unavailable", message: "La operación no está disponible.", uncertain: false })),
    initialize: vi.fn<MessagingUsageBrowserClient["initialize"]>(async (_slug, input) => ({ status: "ready", value: { state: "completed", operationId: input.operationId, replayed: false, result: { ...policy, version: 1, allowedCountries: [] } } })),
    update: vi.fn<MessagingUsageBrowserClient["update"]>(async (_slug, input) => ({ status: "ready", value: { state: "completed", operationId: input.operationId, replayed: false, result: { ...policy, version: input.expectedVersion + 1, allowedCountries: input.allowedCountries, verificationDailyLimit: input.verificationDailyLimit, notificationDailyLimit: input.notificationDailyLimit } } })),
  };
  return { state, policy, client, node: <MessagingUsageContainer initialState={state} client={client} /> };
}
/** Opens the guided steps of a saved configuration once the current state is confirmed. */
async function openSteps() {
  const button = await screen.findByRole("button", { name: "Cambiar países y cupos" });
  await waitFor(() => expect(button).toBeEnabled()); fireEvent.click(button);
}
/** Moves to the next step through the shared Continue control. */
async function next() {
  const button = screen.getByRole("button", { name: /Continuar/ });
  await waitFor(() => expect(button).toBeEnabled()); await changeGuidedStep(button);
}
/** Returns to the previous step through the shared Back control. */
async function back() { await changeGuidedStep(screen.getByRole("button", { name: /Atrás/ })); }
/** Walks from the countries step to the review step, typing the given quotas on the way. */
async function reviewWith(quotas: { verification?: string; notification?: string } = {}) {
  await screen.findByRole("navigation", { name: "Paso 1 de 4" });
  await next();
  const codes = await screen.findByRole("spinbutton", { name: "Códigos por día" });
  if (quotas.verification !== undefined) fireEvent.change(codes, { target: { value: quotas.verification } });
  await next();
  const notices = await screen.findByRole("spinbutton", { name: "Avisos por día" });
  if (quotas.notification !== undefined) fireEvent.change(notices, { target: { value: quotas.notification } });
  await next();
  await screen.findByRole("checkbox", { name: /Revisé los países/ });
}
/** Confirmation is always a fresh interaction, distinct from stored confirmed:true. */
async function confirm() { const checkbox = screen.getByRole("checkbox", { name: /Revisé los países/ }); await waitFor(() => expect(checkbox).not.toBeDisabled()); fireEvent.click(checkbox); }
/** Runs the final action of the review step. */
function save() { fireEvent.click(screen.getByRole("button", { name: /Guardar países y cupos/ })); }
/** Opens a saved configuration, changes the daily codes, confirms and saves. */
async function saveVerificationChange(verification: string) { await openSteps(); await reviewWith({ verification }); await confirm(); save(); }
/** @returns A promise and its resolver, to observe in-flight states. */
function deferred<Value>() { let resolve!: (value: Value) => void; const promise = new Promise<Value>((complete) => { resolve = complete; }); return { promise, resolve }; }
beforeEach(() => { window.sessionStorage.clear(); vi.clearAllMocks(); });

describe("guided usage route workflow", () => {
  it("should create the configuration and then save the chosen values, announcing each sub-step and success only at the end", async () => {
    const data = fixture(false), creating = deferred<InitializeResult>(), saving = deferred<UpdateResult>();
    data.client.initialize.mockImplementationOnce(() => creating.promise); data.client.update.mockImplementationOnce(() => saving.promise);
    render(data.node, { wrapper: Providers });
    expect(screen.queryByRole("button", { name: "Cambiar países y cupos" })).not.toBeInTheDocument();
    await reviewWith({ verification: "50", notification: "1" });
    expect(screen.getByText(/Es un cupo muy bajo: con 1 aviso por día/)).toBeInTheDocument();
    await confirm(); save();
    await waitFor(() => expect(data.client.initialize).toHaveBeenCalledOnce());
    expect(screen.getByText("Creando la configuración…")).toHaveAttribute("role", "status");
    expect(screen.getByRole("button", { name: /Guardar países y cupos/ })).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByText(savedText)).not.toBeInTheDocument();
    const initialization = data.client.initialize.mock.calls[0][1];
    expect(initialization).toEqual({ operationId: expect.any(String), confirmed: true });
    await act(async () => { creating.resolve({ status: "ready", value: { state: "completed", operationId: initialization.operationId, replayed: false, result: { ...data.policy, version: 1, allowedCountries: [] } } }); });
    await waitFor(() => expect(data.client.update).toHaveBeenCalledOnce());
    expect(screen.getByText("Guardando tus países y cupos…")).toHaveAttribute("role", "status");
    expect(screen.queryByText(savedText)).not.toBeInTheDocument();
    const update = data.client.update.mock.calls[0][1];
    expect(update).toMatchObject({ expectedVersion: 1, confirmed: true, allowedCountries: [], verificationDailyLimit: 50, notificationDailyLimit: 1 });
    expect(update.operationId).not.toBe(initialization.operationId);
    await act(async () => { saving.resolve({ status: "ready", value: { state: "completed", operationId: update.operationId, replayed: false, result: { ...data.policy, version: 2, allowedCountries: [], verificationDailyLimit: 50, notificationDailyLimit: 1 } } }); });
    await waitFor(() => expect(screen.getByText(savedText)).toHaveAttribute("role", "status"));
    expect(screen.getByText("Configuración actual: versión 2. Máximos de la plataforma: 1000 códigos y 5000 avisos por día.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cambiar países y cupos" })).toBeInTheDocument();
    expect(readMessagingUsageIntent(viewerId, slug)).toBeNull(); expect(router.refresh).not.toHaveBeenCalled();
  });

  it("should save with a single creation when the chosen values are the server defaults", async () => {
    const data = fixture(false); data.client.initialize.mockImplementationOnce(async (_slug, input) => ({ status: "ready", value: { state: "completed", operationId: input.operationId, replayed: false, result: { ...data.policy, version: 1, allowedCountries: [] } } }));
    render(data.node, { wrapper: Providers });
    await reviewWith(); await confirm(); save();
    await waitFor(() => expect(screen.getByText(savedText)).toBeInTheDocument());
    expect(data.client.initialize).toHaveBeenCalledOnce(); expect(data.client.update).not.toHaveBeenCalled();
  });

  it("should say the configuration exists with defaults when the second write fails and retry it with a new operation", async () => {
    const data = fixture(false); data.client.update.mockResolvedValueOnce({ status: "failed", code: "dependency_unavailable", message: "No pudimos guardar el uso.", uncertain: false });
    render(data.node, { wrapper: Providers });
    await reviewWith({ notification: "0" }); await confirm(); save();
    const alert = await screen.findByRole("alert", {}, { timeout: 3000 });
    await waitFor(() => expect(alert).toHaveTextContent(partialText));
    expect(alert).toHaveTextContent("No pudimos guardar el uso.");
    expect(screen.queryByText(savedText)).not.toBeInTheDocument();
    expect(screen.getByText("Configuración actual: versión 1. Máximos de la plataforma: 1000 códigos y 5000 avisos por día.")).toBeInTheDocument();
    expect(readMessagingUsageIntent(viewerId, slug)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar guardado" }));
    await waitFor(() => expect(screen.getByText(savedText)).toBeInTheDocument());
    expect(data.client.initialize).toHaveBeenCalledOnce(); expect(data.client.update).toHaveBeenCalledTimes(2);
    expect(data.client.update.mock.calls[1][1]).toMatchObject({ expectedVersion: 1, notificationDailyLimit: 0 });
    expect(data.client.update.mock.calls[1][1].operationId).not.toBe(data.client.update.mock.calls[0][1].operationId);
  });

  it("should keep an uncertain second write as the original operation and retry it only with its own identity", async () => {
    const data = fixture(false); data.client.update.mockResolvedValueOnce({ status: "failed", code: "dependency_unavailable", message: "No pudimos confirmar el guardado.", uncertain: true });
    render(data.node, { wrapper: Providers });
    await reviewWith({ verification: "40" }); await confirm(); save();
    await waitFor(() => expect(screen.getByRole("button", { name: "Consultar operación original" })).toBeInTheDocument());
    expect(screen.getByRole("alert")).toHaveTextContent(partialText);
    expect(screen.queryByRole("button", { name: "Reintentar guardado" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Guardar países y cupos/ })).toBeDisabled();
    const original = readMessagingUsageIntent(viewerId, slug); expect(original?.type).toBe("update_messaging_usage");
    data.client.read.mockResolvedValueOnce({ status: "ready", value: { state: "configured", policy: { ...data.policy, version: 1, allowedCountries: [] } } });
    fireEvent.click(screen.getByRole("button", { name: "Consultar operación original" }));
    fireEvent.click(await screen.findByRole("checkbox", { name: /Confirmo reintentar el guardado/ }));
    fireEvent.click(screen.getByRole("button", { name: "Reintentar operación original" }));
    await waitFor(() => expect(screen.getByText(savedText)).toBeInTheDocument());
    expect(data.client.update).toHaveBeenCalledTimes(2); expect(data.client.update.mock.calls[1][1]).toEqual(original!.input);
    expect(data.client.initialize).toHaveBeenCalledOnce();
  });

  it("should summarize the saved configuration and open the steps with the current values", async () => {
    const data = fixture(); render(data.node, { wrapper: Providers });
    expect(screen.getByText("Argentina")).toBeInTheDocument();
    expect(screen.getAllByRole("group", { name: /Códigos de hoy/ })[0]).toBeInTheDocument();
    expect(screen.getByText(/2 códigos y 1 avisos consumidos hoy/)).toBeInTheDocument();
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    await openSteps(); await next();
    expect(await screen.findByRole("spinbutton", { name: "Códigos por día" })).toHaveValue(100);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Cambiar países y cupos" })).toBeInTheDocument());
    expect(data.client.update).not.toHaveBeenCalled(); expect(data.client.read).not.toHaveBeenCalled();
  });

  it("should explain a quota increase and require a new explicit increase confirmation before writing", async () => {
    const data = fixture(); render(data.node, { wrapper: Providers });
    await openSteps(); await reviewWith({ verification: "150" });
    expect(screen.getByText("De 100 a 150")).toBeInTheDocument();
    const increase = screen.getByRole("checkbox", { name: /confirmo el aumento indicado/ });
    expect(increase).not.toBeChecked(); expect(screen.getByRole("button", { name: /Guardar países y cupos/ })).toBeDisabled();
    fireEvent.click(increase); save();
    await waitFor(() => expect(data.client.update).toHaveBeenCalledOnce());
    expect(data.client.update.mock.calls[0][1]).toMatchObject({ expectedVersion: 3, verificationDailyLimit: 150, confirmed: true });
    await waitFor(() => expect(screen.getByText(savedText)).toBeInTheDocument());
    expect(screen.getByText(/2 códigos y 1 avisos consumidos hoy/)).toBeInTheDocument();
    expect(data.client.initialize).not.toHaveBeenCalled(); expect(router.refresh).not.toHaveBeenCalled();
  });

  it("should keep the confirmation while moving between steps and clear it only when a value changes", async () => {
    const data = fixture(); render(data.node, { wrapper: Providers });
    await openSteps(); await reviewWith({ notification: "300" }); await confirm();
    await back();
    await screen.findByRole("spinbutton", { name: "Avisos por día" });
    await next(); expect(await screen.findByRole("checkbox", { name: /Revisé los países/ })).toBeChecked();
    await back();
    fireEvent.change(await screen.findByRole("spinbutton", { name: "Avisos por día" }), { target: { value: "0" } });
    expect(screen.getByText("Con 0 no se envía ningún aviso por correo o SMS.")).toBeInTheDocument();
    await next(); expect(await screen.findByRole("checkbox", { name: /Revisé los países/ })).not.toBeChecked();
    expect(data.client.update).not.toHaveBeenCalled(); expect(data.client.read).not.toHaveBeenCalled();
  });

  it("should not continue past an invalid quota", async () => {
    const data = fixture(false); render(data.node, { wrapper: Providers });
    await screen.findByRole("navigation", { name: "Paso 1 de 4" }); await next();
    fireEvent.change(await screen.findByRole("spinbutton", { name: "Códigos por día" }), { target: { value: "" } });
    expect(screen.getByRole("button", { name: /Continuar/ })).toBeDisabled();
    expect(screen.getByText("Ingresá un número entero entre 0 y 1000.")).toBeInTheDocument();
    expect(data.client.initialize).not.toHaveBeenCalled();
  });

  it("should hide the previous private policy when an explicit current read denies the same account", async () => {
    const data = fixture();
    data.client.update.mockResolvedValueOnce({ status: "failed", code: "usage_policy_conflict", message: "Los cupos cambiaron. Consultá el uso actual.", uncertain: false });
    render(data.node, { wrapper: Providers });
    await saveVerificationChange("120");
    await waitFor(() => expect(screen.getByRole("button", { name: "Consultar uso actual" })).toBeInTheDocument());
    data.client.read.mockResolvedValueOnce({ status: "failed", code: "permission_denied", message: "No tenés permiso para consultar el uso.", uncertain: false });
    fireEvent.click(screen.getByRole("button", { name: "Consultar uso actual" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("No tenés permiso"));
    expect(screen.queryByRole("spinbutton", { name: "Códigos por día" })).not.toBeInTheDocument();
    expect(screen.queryByText("Argentina")).not.toBeInTheDocument();
    expect(data.client.initialize).not.toHaveBeenCalled();
  });

  it("should hide private usage when original-operation recovery denies current authority", async () => {
    const data = fixture();
    writeMessagingUsageIntent(viewerId, slug, { type: "initialize_messaging_usage", input: { operationId, confirmed: true } });
    data.client.operation.mockResolvedValueOnce({ status: "failed", code: "permission_denied", message: "No tenés permiso para recuperar esta operación.", uncertain: false });
    render(data.node, { wrapper: Providers });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("No tenés permiso"));
    expect(screen.queryByRole("button", { name: "Cambiar países y cupos" })).not.toBeInTheDocument();
    expect(data.client.update).not.toHaveBeenCalled();
  });

  it("should withhold the old private policy after a mutation reports lost current authority", async () => {
    const data = fixture();
    data.client.update.mockResolvedValueOnce({ status: "failed", code: "permission_denied", message: "No tenés permiso para modificar el uso.", uncertain: false });
    render(data.node, { wrapper: Providers });
    await saveVerificationChange("120");
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("No tenés permiso"));
    expect(screen.queryByRole("spinbutton", { name: "Códigos por día" })).not.toBeInTheDocument();
    expect(screen.queryByText(/2 códigos y 1 avisos consumidos hoy/)).not.toBeInTheDocument();
    expect(readMessagingUsageIntent(viewerId, slug)?.input.operationId).toBe(data.client.update.mock.calls[0][1].operationId);
  });

  it("should ignore a late aborted usage read after a newer current version and counters are displayed", async () => {
    const data = fixture();
    render(data.node, { wrapper: Providers });
    await screen.findByRole("button", { name: "Cambiar países y cupos" });
    let completeOld!: (value: Awaited<ReturnType<MessagingUsageBrowserClient["read"]>>) => void;
    data.client.read.mockImplementationOnce(() => new Promise((resolve) => { completeOld = resolve; }));
    await act(async () => { window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })); });
    await waitFor(() => expect(data.client.read).toHaveBeenCalledOnce());
    data.client.read.mockResolvedValueOnce({ status: "ready", value: { state: "configured", policy: { ...data.policy, version: 9, consumption: { verificationToday: 8, notificationToday: 5 } } } });
    await act(async () => { window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })); });
    await waitFor(() => expect(screen.getByText(/Configuración actual: versión 9/)).toBeInTheDocument());
    await act(async () => { completeOld({ status: "ready", value: { state: "configured", policy: { ...data.policy, version: 4 } } }); });
    expect(screen.getByText(/Configuración actual: versión 9/)).toBeInTheDocument();
    expect(screen.getByText(/8 códigos y 5 avisos consumidos hoy/)).toBeInTheDocument();
    expect(data.client.read.mock.calls[0][1].aborted).toBe(true);
    expect(data.client.update).not.toHaveBeenCalled(); expect(router.refresh).not.toHaveBeenCalled();
  });

  it("should not expose a superseded usage response when restoration starts after its viewer promise resolves", async () => {
    const data = fixture(); render(data.node, { wrapper: Providers }); await screen.findByRole("button", { name: "Cambiar países y cupos" });
    data.client.viewer.mockResolvedValueOnce({ status: "ready", value: { id: viewerId } });
    data.client.viewer.mockImplementationOnce(() => {
      const result = Promise.resolve({ status: "ready" as const, value: { id: viewerId } });
      void result.then(() => queueMicrotask(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }))));
      return result;
    });
    let complete!: (value: Awaited<ReturnType<MessagingUsageBrowserClient["read"]>>) => void;
    data.client.read.mockResolvedValueOnce({ status: "ready", value: { state: "configured", policy: { ...data.policy, version: 7 } } }).mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
    await act(async () => { window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })); });
    await waitFor(() => expect(data.client.read).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("status")).toHaveTextContent("Consultando la cuenta y el uso actual");
    expect(screen.queryByText(/Configuración actual: versión 7/)).not.toBeInTheDocument();
    await act(async () => { complete({ status: "ready", value: { state: "configured", policy: { ...data.policy, version: 9 } } }); });
    await waitFor(() => expect(screen.getByText(/Configuración actual: versión 9/)).toBeInTheDocument());
    expect(data.client.update).not.toHaveBeenCalled(); expect(router.refresh).not.toHaveBeenCalled();
  });

  it("should retain a single main landmark when a page-embedded account lookup fails", async () => {
    const data = fixture(); data.client.viewer.mockResolvedValue({ status: "failed", code: "dependency_unavailable", message: "No pudimos confirmar la cuenta actual.", uncertain: false });
    render(<AdmissionWorkspaceRoute pathname="/tribu/academia/admissions/messaging" slug="tribu"><AdmissionSettingsPage page="usage">{data.node}</AdmissionSettingsPage></AdmissionWorkspaceRoute>, { wrapper: Providers });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("No pudimos confirmar la cuenta actual"));
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "Países y cupos de mensajería", level: 1 })).toBeInTheDocument();
  });

  it("should use the SSR snapshot once and edit the draft without initializing or fetching again", async () => {
    const data = fixture(); render(data.node, { wrapper: Providers });
    await openSteps(); await next();
    fireEvent.change(await screen.findByRole("spinbutton", { name: "Códigos por día" }), { target: { value: "0" } });
    expect(data.client.read).not.toHaveBeenCalled(); expect(data.client.initialize).not.toHaveBeenCalled(); expect(data.client.update).not.toHaveBeenCalled();
  });

  it("should persist before a minimum-result write and preserve consumption without a route refresh", async () => {
    const data = fixture(); data.client.update.mockImplementationOnce(async (_slug, input) => {
      expect(readMessagingUsageIntent(viewerId, slug)).toEqual({ type: "update_messaging_usage", input });
      return { status: "ready", value: { state: "completed", operationId: input.operationId, replayed: false, result: { ...data.policy, version: 4, verificationDailyLimit: input.verificationDailyLimit } } };
    });
    render(data.node, { wrapper: Providers }); await saveVerificationChange("0");
    await waitFor(() => expect(screen.getByText(savedText)).toBeInTheDocument());
    expect(screen.getByText(/2 códigos y 1 avisos consumidos hoy/)).toBeInTheDocument();
    expect(readMessagingUsageIntent(viewerId, slug)).toBeNull(); expect(data.client.read).not.toHaveBeenCalled(); expect(router.refresh).not.toHaveBeenCalled();
  });

  it("should retain the draft after conflict and refresh only its current version before a newly confirmed command", async () => {
    const data = fixture(); data.client.update.mockResolvedValueOnce({ status: "failed", code: "usage_policy_conflict", message: "Los países o cupos cambiaron. Revisalos y volvé a confirmar.", uncertain: false }); data.client.read.mockResolvedValueOnce({ status: "ready", value: { state: "configured", policy: { ...data.policy, version: 7 } } });
    render(data.node, { wrapper: Providers }); await saveVerificationChange("0");
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Los países o cupos cambiaron"));
    fireEvent.click(screen.getByRole("button", { name: "Consultar uso actual" }));
    await waitFor(() => expect(screen.getByRole("checkbox", { name: /Revisé los países/ })).not.toBeDisabled());
    expect(screen.getByText("De 100 a 0")).toBeInTheDocument(); expect(screen.getByRole("checkbox", { name: /Revisé los países/ })).not.toBeChecked();
    await confirm(); save();
    await waitFor(() => expect(data.client.update).toHaveBeenCalledTimes(2));
    expect(data.client.update.mock.calls[1][1].expectedVersion).toBe(7);
    expect(data.client.update.mock.calls[1][1].operationId).not.toBe(data.client.update.mock.calls[0][1].operationId);
  });

  it("should recover the original result before reading current state and never replace a newer version with replay", async () => {
    const data = fixture(); writeMessagingUsageIntent(viewerId, slug, { type: "update_messaging_usage", input: { operationId, expectedVersion: 1, confirmed: true, allowedCountries: ["US"], verificationDailyLimit: 0, notificationDailyLimit: 200 } });
    data.client.operation.mockResolvedValueOnce({ status: "ready", value: { type: "update_messaging_usage", state: "completed", operationId, replayed: true, result: { ...data.policy, version: 2 } } });
    data.client.read.mockResolvedValueOnce({ status: "ready", value: { state: "configured", policy: { ...data.policy, version: 9 } } });
    render(data.node, { wrapper: Providers });
    await waitFor(() => expect(screen.getByText("El resultado original quedó confirmado. Revisá el uso actual antes de continuar.")).toBeInTheDocument());
    expect(data.client.operation.mock.invocationCallOrder[0]).toBeLessThan(data.client.read.mock.invocationCallOrder[0]);
    expect(screen.getByText(/Configuración actual: versión 9/)).toBeInTheDocument();
    await saveVerificationChange("10");
    await waitFor(() => expect(data.client.update).toHaveBeenCalledOnce()); expect(data.client.update.mock.calls[0][1].expectedVersion).toBe(9);
  });

  it("should reopen the review of a restored unfinished update above the original-operation recovery", async () => {
    const data = fixture(); writeMessagingUsageIntent(viewerId, slug, { type: "update_messaging_usage", input: { operationId, expectedVersion: 3, confirmed: true, allowedCountries: ["US"], verificationDailyLimit: 0, notificationDailyLimit: 200 } });
    render(data.node, { wrapper: Providers });
    await waitFor(() => expect(screen.getByRole("checkbox", { name: /Confirmo reintentar el guardado/ })).toBeInTheDocument());
    expect(screen.getByText("De 100 a 0")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Guardar países y cupos/ })).toBeDisabled();
    expect(data.client.update).not.toHaveBeenCalled();
  });

  it("should recheck native identity after unfinished recovery and hide the previous account's private form", async () => {
    const data = fixture(); writeMessagingUsageIntent(viewerId, slug, { type: "initialize_messaging_usage", input: { operationId, confirmed: true } });
    let complete!: (value: Awaited<ReturnType<MessagingUsageBrowserClient["operation"]>>) => void;
    data.client.operation.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
    render(data.node, { wrapper: Providers }); await waitFor(() => expect(data.client.operation).toHaveBeenCalledOnce());
    data.client.viewer.mockResolvedValue({ status: "ready", value: { id: "another-leader" } }); complete({ status: "ready", value: { type: "initialize_messaging_usage", state: "started", operationId } });
    await waitFor(() => expect(screen.getByText(/La cuenta cambió/)).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Cambiar países y cupos" })).not.toBeInTheDocument(); expect(data.client.update).not.toHaveBeenCalled();
  });

  it("should show a legacy session-change answer as a plain error, keep the original command and offer no Google control", async () => {
    const message = "Tu sesión cambió. Recargá la página e intentá de nuevo.";
    const data = fixture(); data.client.update.mockResolvedValueOnce({ status: "failed", code: "reauthentication_required", message, uncertain: false });
    render(data.node, { wrapper: Providers }); await saveVerificationChange("120");
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(message));
    expect(screen.queryByRole("button", { name: /Google/ })).not.toBeInTheDocument(); expect(screen.queryByRole("link", { name: /Google/ })).not.toBeInTheDocument();
    expect(readMessagingUsageIntent(viewerId, slug)).not.toBeNull(); expect(data.client.update).toHaveBeenCalledOnce(); expect(router.refresh).not.toHaveBeenCalled();
  });

  it("should retain an uncertain original write and only offer an identical retry after original absence and current read", async () => {
    const data = fixture(); data.client.update.mockResolvedValueOnce({ status: "failed", code: "dependency_unavailable", message: "No pudimos confirmar el guardado.", uncertain: true });
    render(data.node, { wrapper: Providers }); await saveVerificationChange("120");
    await waitFor(() => expect(screen.getByRole("button", { name: "Consultar operación original" })).toBeInTheDocument());
    const original = readMessagingUsageIntent(viewerId, slug); expect(original).not.toBeNull();
    expect(screen.getByRole("button", { name: /Guardar países y cupos/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Consultar operación original" }));
    await waitFor(() => expect(screen.getByRole("checkbox", { name: /Confirmo reintentar el guardado/ })).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Reintentar operación original" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /Confirmo reintentar el guardado/ })); fireEvent.click(screen.getByRole("button", { name: "Reintentar operación original" }));
    await waitFor(() => expect(data.client.update).toHaveBeenCalledTimes(2));
    expect(data.client.update.mock.calls[1][1]).toEqual(original!.input);
    expect(data.client.operation.mock.invocationCallOrder[0]).toBeLessThan(data.client.update.mock.invocationCallOrder[1]);
  });

  it("should withhold retry when current read fails and abort the active private read on unmount", async () => {
    const data = fixture(); writeMessagingUsageIntent(viewerId, slug, { type: "initialize_messaging_usage", input: { operationId, confirmed: true } });
    data.client.read.mockResolvedValueOnce({ status: "failed", code: "dependency_unavailable", message: "No pudimos consultar el uso actual.", uncertain: false });
    const view = render(data.node, { wrapper: Providers });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("No pudimos consultar"));
    expect(screen.queryByRole("checkbox", { name: /Confirmo reintentar el guardado/ })).not.toBeInTheDocument();
    expect(data.client.update).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Cambiar países y cupos" })).not.toBeInTheDocument();
    expect(readMessagingUsageIntent(viewerId, slug)).not.toBeNull();
    let signal: AbortSignal | null = null;
    data.client.read.mockImplementationOnce(async (_slug, requestSignal) => { signal = requestSignal; return new Promise(() => undefined); });
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await waitFor(() => expect(signal).not.toBeNull()); view.unmount(); expect(signal!.aborted).toBe(true);
  });

  it("should read current consumption on Activity restoration without duplicate initial fetching or an automatic write", async () => {
    const data = fixture(); const view = render(<Activity mode="visible">{data.node}</Activity>, { wrapper: Providers });
    await openSteps(); await reviewWith({ verification: "120" }); await confirm(); expect(data.client.read).not.toHaveBeenCalled();
    view.rerender(<Activity mode="hidden">{data.node}</Activity>);
    data.client.read.mockResolvedValueOnce({ status: "ready", value: { state: "configured", policy: { ...data.policy, consumption: { verificationToday: 5, notificationToday: 4 } } } });
    view.rerender(<Activity mode="visible">{data.node}</Activity>);
    await waitFor(() => expect(screen.getByText(/5 códigos y 4 avisos consumidos hoy/)).toBeInTheDocument());
    expect(data.client.read).toHaveBeenCalledOnce(); expect(data.client.update).not.toHaveBeenCalled();
    expect(screen.getByRole("checkbox", { name: /Revisé los países/ })).not.toBeChecked();
  });

  it("should hide private usage immediately after browser restoration and keep it hidden when native viewer lookup fails", async () => {
    const data = fixture(); render(data.node, { wrapper: Providers }); await screen.findByRole("button", { name: "Cambiar países y cupos" });
    data.client.viewer.mockResolvedValue({ status: "failed", code: "dependency_unavailable", message: "No pudimos confirmar la cuenta actual.", uncertain: false });
    await act(async () => { window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })); });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("No pudimos confirmar la cuenta actual"));
    expect(screen.queryByRole("button", { name: "Cambiar países y cupos" })).not.toBeInTheDocument();
    expect(screen.queryByText(/2 códigos y 1 avisos consumidos hoy/)).not.toBeInTheDocument();
    expect(data.client.update).not.toHaveBeenCalled();
  });

  it("should show a neutral status rather than an error while restored native identity is still being checked", async () => {
    const data = fixture(); render(data.node, { wrapper: Providers }); await screen.findByRole("button", { name: "Cambiar países y cupos" });
    let complete!: (value: Awaited<ReturnType<MessagingUsageBrowserClient["viewer"]>>) => void;
    data.client.viewer.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
    await act(async () => { window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })); });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Consultando la cuenta y el uso actual");
    await act(async () => { complete({ status: "ready", value: { id: viewerId } }); });
  });

  it("should offer signing in, and come back to this page with its way back to the rules, when the usage page was read without a session", () => {
    const pathname = "/tribu/academia/admissions/messaging", search = "return=policy-review", code = MESSAGING_ERROR_CODE.authenticationRequired;
    render(<SearchParamsContext.Provider value={new URLSearchParams(search)}><AdmissionWorkspaceRoute pathname={pathname} slug="tribu"><AdmissionSettingsPage page="usage"><MessagingUsageContainer initialState={{ kind: "unavailable", code, message: MESSAGING_ERROR_MESSAGE[code] }} client={fixture().client} /></AdmissionSettingsPage></AdmissionWorkspaceRoute></SearchParamsContext.Provider>, { wrapper: Providers });

    expect(screen.getByRole("alert")).toHaveTextContent(MESSAGING_ERROR_MESSAGE[code]);
    expect(screen.getByRole("link", { name: "Iniciar sesión" })).toHaveAttribute("href", buildSignInRedirectUrl(`${pathname}?${search}`));
    expect(screen.queryByRole("button", { name: "Reintentar" })).not.toBeInTheDocument();
  });

  it("should not offer a retry that cannot grant a denied permission", () => {
    const code = MESSAGING_ERROR_CODE.permissionDenied;
    render(<AdmissionWorkspaceRoute pathname="/tribu/academia/admissions/messaging" slug="tribu"><AdmissionSettingsPage page="usage"><MessagingUsageContainer initialState={{ kind: "unavailable", code, message: MESSAGING_ERROR_MESSAGE[code] }} client={fixture().client} /></AdmissionSettingsPage></AdmissionWorkspaceRoute>, { wrapper: Providers });

    expect(screen.getByRole("alert")).toHaveTextContent(MESSAGING_ERROR_MESSAGE[code]);
    expect(screen.queryByRole("button", { name: "Reintentar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Iniciar sesión" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ir al inicio" })).toBeInTheDocument();
  });

  it("should announce a saved configuration once, inline, with the real toaster mounted", async () => {
    const data = fixture(false); data.client.initialize.mockImplementationOnce(async (_slug, input) => ({ status: "ready", value: { state: "completed", operationId: input.operationId, replayed: false, result: { ...data.policy, version: 1, allowedCountries: [] } } }));
    render(<>{data.node}<ThemedToaster /></>, { wrapper: Providers });
    await reviewWith(); await confirm(); save();
    await waitFor(() => expect(screen.getByText(savedText)).toHaveAttribute("role", "status"));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 100)); });
    expect(screen.getAllByText(savedText)).toHaveLength(1);
  });
});
