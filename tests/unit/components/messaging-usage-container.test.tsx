/** Exercises the actual early usage container and shared controls through owned browser ports. @module messaging-usage-container-tests */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Activity, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { AppUIProvider } from "@/components/providers/app-providers/app-ui-provider";
import { MessagingUsageContainer } from "@/app/(platform)/[slug]/academia/admissions/messaging/messaging-usage-container";
import type { MessagingUsagePageState } from "@/src/modules/messaging/application/results/messaging-usage-page-state";
import type { MessagingUsageBrowserClient } from "@/src/modules/messaging/application/ports/messaging-usage-browser-client";
import type { MessagingUsageReauthenticationClient } from "@/src/modules/messaging/application/ports/messaging-usage-reauthentication-client";
import { readMessagingUsageIntent, writeMessagingUsageIntent } from "@/lib/messaging/messaging-usage-intent";
import { AdmissionSettingsPage } from "@/components/academy-admissions/admission-settings-page";

const slug = "synthetic-academy", viewerId = "synthetic-leader", tribeId = "83ecbfaf-0e7c-4afb-aefc-62b62800d367", operationId = "297d47c2-5419-4c3d-a339-e8b7970275ca";
const router = { back: vi.fn(), bfcacheId: "usage-container-test", forward: vi.fn(), prefetch: vi.fn(), push: vi.fn(), refresh: vi.fn(), replace: vi.fn() } satisfies AppRouterInstance;
/** Native router context and the real UI provider remain in use. */
function Providers({ children }: { children: ReactNode }) { return <AppRouterContext.Provider value={router}><AppUIProvider>{children}</AppUIProvider></AppRouterContext.Provider>; }
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
  const reauthentication = { create: vi.fn<MessagingUsageReauthenticationClient["create"]>(async () => ({ status: "ready", href: "/auth/reauthenticate?intentId=297d47c2-5419-4c3d-a339-e8b7970275ca" })) };
  return { state, policy, client, reauthentication, node: <MessagingUsageContainer initialState={state} client={client} reauthentication={reauthentication} /> };
}
/** Confirmation is always a fresh interaction, distinct from stored confirmed:true. */
async function confirm() { const checkbox = screen.getByRole("checkbox", { name: /Revisé los países/ }); await waitFor(() => expect(checkbox).not.toBeDisabled()); fireEvent.click(checkbox); }
beforeEach(() => { window.sessionStorage.clear(); vi.clearAllMocks(); });

describe("early usage route workflow", () => {
  it("should retain a single main landmark when a page-embedded account lookup fails", async () => {
    const data = fixture(); data.client.viewer.mockResolvedValue({ status: "failed", code: "dependency_unavailable", message: "No pudimos confirmar la cuenta actual.", uncertain: false });
    render(<AdmissionSettingsPage title="Mensajería de la academia">{data.node}</AdmissionSettingsPage>, { wrapper: Providers });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("No pudimos confirmar la cuenta actual"));
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "Mensajería de la academia", level: 1 })).toBeInTheDocument();
  });
  it("should use the SSR snapshot once and clear confirmation after editing without initializing or fetching again", async () => {
    const data = fixture(); render(data.node, { wrapper: Providers }); await confirm();
    fireEvent.change(screen.getByRole("spinbutton", { name: "Códigos por día" }), { target: { value: "0" } });
    expect(screen.getByRole("checkbox", { name: /Revisé los países/ })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Guardar países y cupos" })).toBeDisabled();
    expect(data.client.read).not.toHaveBeenCalled(); expect(data.client.initialize).not.toHaveBeenCalled(); expect(data.client.update).not.toHaveBeenCalled();
  });
  it("should preserve a prepared draft when explicit initialization persists closed server defaults", async () => {
    const data = fixture(false); render(data.node, { wrapper: Providers }); await confirm();
    fireEvent.change(screen.getByRole("spinbutton", { name: "Códigos por día" }), { target: { value: "0" } }); await confirm();
    fireEvent.click(screen.getByRole("button", { name: "Iniciar configuración de uso" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Guardar países y cupos" })).toBeInTheDocument());
    expect(screen.getByRole("spinbutton", { name: "Códigos por día" })).toHaveValue(0);
    expect(screen.getByText(/Los países vacíos no habilitan/)).toBeInTheDocument();
    expect(data.client.initialize.mock.calls[0][1]).not.toHaveProperty("allowedCountries");
    expect(data.client.initialize.mock.calls[0][1]).not.toHaveProperty("expectedVersion");
    expect(data.client.update).not.toHaveBeenCalled(); expect(router.refresh).not.toHaveBeenCalled();
  });
  it("should persist before a minimum-result write and preserve consumption without a route refresh", async () => {
    const data = fixture(); data.client.update.mockImplementationOnce(async (_slug, input) => {
      expect(readMessagingUsageIntent(viewerId, slug)).toEqual({ type: "update_messaging_usage", input });
      return { status: "ready", value: { state: "completed", operationId: input.operationId, replayed: false, result: { ...data.policy, version: 4, verificationDailyLimit: input.verificationDailyLimit } } };
    });
    render(data.node, { wrapper: Providers }); await confirm();
    fireEvent.change(screen.getByRole("spinbutton", { name: "Códigos por día" }), { target: { value: "0" } }); await confirm(); fireEvent.click(screen.getByRole("button", { name: "Guardar países y cupos" }));
    await waitFor(() => expect(screen.getByText("Los países y cupos quedaron guardados.")).toBeInTheDocument());
    expect(screen.getByText(/2 códigos y 1 avisos consumidos hoy/)).toBeInTheDocument();
    expect(readMessagingUsageIntent(viewerId, slug)).toBeNull(); expect(data.client.read).not.toHaveBeenCalled(); expect(router.refresh).not.toHaveBeenCalled();
  });
  it("should retain the draft after conflict and refresh only its current version before a newly confirmed command", async () => {
    const data = fixture(); data.client.update.mockResolvedValueOnce({ status: "failed", code: "usage_policy_conflict", message: "Los países o cupos cambiaron. Revisalos y volvé a confirmar.", uncertain: false }); data.client.read.mockResolvedValueOnce({ status: "ready", value: { state: "configured", policy: { ...data.policy, version: 7 } } });
    render(data.node, { wrapper: Providers }); await confirm();
    fireEvent.change(screen.getByRole("spinbutton", { name: "Códigos por día" }), { target: { value: "0" } }); await confirm(); fireEvent.click(screen.getByRole("button", { name: "Guardar países y cupos" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Los países o cupos cambiaron"));
    fireEvent.click(screen.getByRole("button", { name: "Consultar uso actual" }));
    await waitFor(() => expect(screen.getByRole("checkbox", { name: /Revisé los países/ })).not.toBeDisabled());
    expect(screen.getByRole("spinbutton", { name: "Códigos por día" })).toHaveValue(0); expect(screen.getByRole("checkbox", { name: /Revisé los países/ })).not.toBeChecked();
    await confirm(); fireEvent.click(screen.getByRole("button", { name: "Guardar países y cupos" }));
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
    expect(screen.getByRole("button", { name: "Quitar Estados Unidos del borrador" })).toBeInTheDocument();
    await confirm(); fireEvent.click(screen.getByRole("button", { name: "Guardar países y cupos" }));
    await waitFor(() => expect(data.client.update).toHaveBeenCalledOnce()); expect(data.client.update.mock.calls[0][1].expectedVersion).toBe(9);
  });
  it("should recheck native identity after unfinished recovery and hide the previous account's private form", async () => {
    const data = fixture(); writeMessagingUsageIntent(viewerId, slug, { type: "initialize_messaging_usage", input: { operationId, confirmed: true } });
    let complete!: (value: Awaited<ReturnType<MessagingUsageBrowserClient["operation"]>>) => void;
    data.client.operation.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
    render(data.node, { wrapper: Providers }); await waitFor(() => expect(data.client.operation).toHaveBeenCalledOnce());
    data.client.viewer.mockResolvedValue({ status: "ready", value: { id: "another-leader" } }); complete({ status: "ready", value: { type: "initialize_messaging_usage", state: "started", operationId } });
    await waitFor(() => expect(screen.getByText(/La cuenta cambió/)).toBeInTheDocument());
    expect(screen.queryByRole("spinbutton", { name: "Códigos por día" })).not.toBeInTheDocument(); expect(data.client.update).not.toHaveBeenCalled();
  });
  it("should create exact reauthentication only on an explicit click and retain the original command for the return", async () => {
    const data = fixture(); data.client.update.mockResolvedValueOnce({ status: "failed", code: "reauthentication_required", message: "Volvé a autenticarte para confirmar esta operación sensible.", uncertain: false });
    render(data.node, { wrapper: Providers }); await confirm(); fireEvent.click(screen.getByRole("button", { name: "Guardar países y cupos" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Preparar confirmación con Google" })).toBeInTheDocument());
    expect(data.reauthentication.create).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole("button", { name: "Preparar confirmación con Google" }));
    await waitFor(() => expect(screen.getByRole("link", { name: "Continuar con la confirmación de Google" })).toBeInTheDocument());
    expect(data.reauthentication.create.mock.calls[0][0]).toEqual({ tribeId, resourceId: tribeId, operation: "update_messaging_usage", returnPath: `/${slug}/academia/admissions/messaging`, confirmed: true });
    expect(readMessagingUsageIntent(viewerId, slug)).not.toBeNull(); expect(data.client.update).toHaveBeenCalledOnce();
  });
  it("should initialize server defaults even when an editable quota draft is incomplete and keep that draft for correction", async () => {
    const data = fixture(false); render(data.node, { wrapper: Providers }); await confirm();
    fireEvent.change(screen.getByRole("spinbutton", { name: "Códigos por día" }), { target: { value: "" } }); await confirm();
    fireEvent.click(screen.getByRole("button", { name: "Iniciar configuración de uso" }));
    await waitFor(() => expect(data.client.initialize).toHaveBeenCalledOnce());
    expect(screen.getByRole("spinbutton", { name: "Códigos por día" })).toHaveValue(null);
    expect(data.client.update).not.toHaveBeenCalled();
  });
  it("should retain an uncertain original write and only offer an identical retry after original absence and current read", async () => {
    const data = fixture(); data.client.update.mockResolvedValueOnce({ status: "failed", code: "dependency_unavailable", message: "No pudimos confirmar el guardado.", uncertain: true });
    render(data.node, { wrapper: Providers }); await confirm(); fireEvent.click(screen.getByRole("button", { name: "Guardar países y cupos" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Consultar operación original" })).toBeInTheDocument());
    const original = readMessagingUsageIntent(viewerId, slug); expect(original).not.toBeNull();
    expect(screen.getByRole("button", { name: "Guardar países y cupos" })).toBeDisabled();
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
    let signal: AbortSignal | null = null;
    data.client.read.mockImplementationOnce(async (_slug, requestSignal) => { signal = requestSignal; return new Promise(() => undefined); });
    fireEvent.click(screen.getByRole("button", { name: "Consultar operación original" }));
    await waitFor(() => expect(signal).not.toBeNull()); view.unmount(); expect(signal!.aborted).toBe(true);
  });
  it("should read current consumption on Activity restoration without duplicate initial fetching or an automatic write", async () => {
    const data = fixture(); const view = render(<Activity mode="visible">{data.node}</Activity>, { wrapper: Providers });
    await confirm(); expect(data.client.read).not.toHaveBeenCalled();
    view.rerender(<Activity mode="hidden">{data.node}</Activity>);
    data.client.read.mockResolvedValueOnce({ status: "ready", value: { state: "configured", policy: { ...data.policy, consumption: { verificationToday: 5, notificationToday: 4 } } } });
    view.rerender(<Activity mode="visible">{data.node}</Activity>);
    await waitFor(() => expect(screen.getByText(/5 códigos y 4 avisos consumidos hoy/)).toBeInTheDocument());
    expect(data.client.read).toHaveBeenCalledOnce(); expect(data.client.update).not.toHaveBeenCalled();
    expect(screen.getByRole("checkbox", { name: /Revisé los países/ })).not.toBeChecked();
  });
  it("should hide private usage immediately after browser restoration and keep it hidden when native viewer lookup fails", async () => {
    const data = fixture(); render(data.node, { wrapper: Providers }); await confirm();
    data.client.viewer.mockResolvedValue({ status: "failed", code: "dependency_unavailable", message: "No pudimos confirmar la cuenta actual.", uncertain: false });
    await act(async () => { window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })); });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("No pudimos confirmar la cuenta actual"));
    expect(screen.queryByRole("spinbutton", { name: "Códigos por día" })).not.toBeInTheDocument();
    expect(screen.queryByText(/2 códigos y 1 avisos consumidos hoy/)).not.toBeInTheDocument();
    expect(data.client.update).not.toHaveBeenCalled();
  });
  it("should show a neutral status rather than an error while restored native identity is still being checked", async () => {
    const data = fixture(); render(data.node, { wrapper: Providers }); await confirm();
    let complete!: (value: Awaited<ReturnType<MessagingUsageBrowserClient["viewer"]>>) => void;
    data.client.viewer.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
    await act(async () => { window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })); });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Consultando la cuenta y el uso actual");
    await act(async () => { complete({ status: "ready", value: { id: viewerId } }); });
  });
});
