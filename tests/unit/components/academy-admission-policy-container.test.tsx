/** Exercises policy route state with real shared controls and doubles only of owned ports. @module academy-admission-policy-container-tests */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Activity, type ReactNode } from "react";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdmissionPolicyContainer } from "@/app/(platform)/[slug]/academia/admissions/settings/policy-container";
import { AppUIProvider } from "@/components/providers/app-providers/app-ui-provider";
import type { AdmissionPolicyBrowserClient } from "@/src/modules/academy-admissions/application/ports/admission-policy-browser-client";
import type { AdmissionPolicyPageState } from "@/src/modules/academy-admissions/application/results/admission-policy-page-state";
import { readAdmissionPolicyIntent, writeAdmissionPolicyIntent } from "@/lib/academy-admissions/admission-policy-intent";
import { createAdmissionPolicyDraft } from "@/src/modules/academy-admissions/application/commands/admission-policy-browser-intent";
import type { AdmissionPolicyReauthenticationClient } from "@/src/modules/academy-admissions/application/ports/admission-policy-reauthentication-client";

const tribeId = "83ecbfaf-0e7c-4afb-aefc-62b62800d367", viewerId = "synthetic-leader", slug = "synthetic-academy";
const router = { back: vi.fn(), bfcacheId: "policy-container-test", forward: vi.fn(), prefetch: vi.fn(), push: vi.fn(), refresh: vi.fn(), replace: vi.fn() } satisfies AppRouterInstance;
/** Uses the native framework router context and the actual shared UI provider. */
function Providers({ children }: { children: ReactNode }) { return <AppRouterContext.Provider value={router}><AppUIProvider>{children}</AppUIProvider></AppRouterContext.Provider>; }

/** Provides only current application DTOs and explicit own asynchronous port outcomes. */
function fixture() {
  const policy = { state: "draft" as const, controlActivated: false, policy: { id: tribeId, version: 3, verificationEpoch: 1, mode: "manual_review" as const, contactType: "email" as const, isOpen: false, allowCommonExceptions: false, requiresAdditionalVerification: false, phoneChannel: null, allowSmsAlternative: false, activatedAt: null, messagingConnectionId: null, messagingConnectionVersion: null, usage: null, requirements: [] }, usage: null, preparation: { state: "not_evaluated" as const, requirements: [] }, impact: { pendingRequestCount: 2, contactTypeLocked: false, historicalLinksProtected: false, warnings: [] } };
  const state: Extract<AdmissionPolicyPageState, { kind: "ready" }> = { kind: "ready", slug, tribeId, viewerId, renderedAt: "2026-10-07T09:00:00Z", policy };
  const client = {
    viewer: vi.fn<AdmissionPolicyBrowserClient["viewer"]>(async () => ({ status: "ready", value: { id: viewerId } })),
    readPolicy: vi.fn<AdmissionPolicyBrowserClient["readPolicy"]>(async () => ({ status: "ready", value: policy })),
    readPreflight: vi.fn<AdmissionPolicyBrowserClient["readPreflight"]>(async () => ({ status: "ready", value: { prepared: false, reasons: ["preflight_runtime_unavailable"], impact: { unknownCommercialMemberCount: 0, privilegedCommercialMemberCount: 0 } } })),
    operation: vi.fn<AdmissionPolicyBrowserClient["operation"]>(async () => ({ status: "failed", code: "resource_unavailable", message: "La operación no está disponible.", uncertain: false })),
    initializePolicy: vi.fn<AdmissionPolicyBrowserClient["initializePolicy"]>(),
    updatePolicy: vi.fn<AdmissionPolicyBrowserClient["updatePolicy"]>(async (_slug, input) => ({ status: "ready", value: { state: "completed", operationId: input.operationId, replayed: false, result: { policyId: tribeId, version: input.expectedVersion + 1, verificationEpoch: 2, activatedAt: null, controlActivated: false, changed: true } } })),
    activatePolicy: vi.fn<AdmissionPolicyBrowserClient["activatePolicy"]>(),
    pausePolicy: vi.fn<AdmissionPolicyBrowserClient["pausePolicy"]>(),
  };
  return { policy, state, client, node: <AdmissionPolicyContainer initialState={state} client={client} /> };
}

/** Confirmation is always a fresh UI action; persisted local intent cannot supply it. */
async function confirm() {
  const checkbox = screen.getByRole("checkbox", { name: /Revisé las reglas/ });
  await waitFor(() => expect(checkbox).not.toBeDisabled());
  fireEvent.click(checkbox);
}

beforeEach(() => { window.sessionStorage.clear(); vi.clearAllMocks(); });
describe("policy route workflow", () => {
  it("should detect an account change before interpreting a failed informational preflight", async () => {
    const data = fixture(); let complete!: (value: Awaited<ReturnType<AdmissionPolicyBrowserClient["readPreflight"]>>) => void;
    data.client.readPreflight.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
    render(data.node, { wrapper: Providers }); await confirm();
    fireEvent.click(screen.getByRole("button", { name: "Revisar requisitos de activación" }));
    await waitFor(() => expect(data.client.readPreflight).toHaveBeenCalledOnce());
    data.client.viewer.mockResolvedValue({ status: "ready", value: { id: "different-leader" } });
    await act(async () => { complete({ status: "failed", code: "dependency_unavailable", message: "No pudimos consultar los requisitos.", uncertain: false }); });
    await waitFor(() => expect(screen.getByText(/La cuenta cambió/)).toBeInTheDocument());
    expect(screen.queryByRole("checkbox", { name: "Comprobar el contacto con un código" })).not.toBeInTheDocument();
    expect(data.client.activatePolicy).not.toHaveBeenCalled();
  });
  it("should reload current pending impact on Activity restoration without duplicating the initial SSR read", async () => {
    const data = fixture(); const view = render(<Activity mode="visible">{data.node}</Activity>, { wrapper: Providers }); await confirm();
    expect(data.client.readPolicy).not.toHaveBeenCalled();
    view.rerender(<Activity mode="hidden">{data.node}</Activity>);
    data.client.readPolicy.mockResolvedValueOnce({ status: "ready", value: { ...data.policy, impact: { ...data.policy.impact, pendingRequestCount: 5 } } });
    view.rerender(<Activity mode="visible">{data.node}</Activity>);
    await waitFor(() => expect(screen.getByText(/5 solicitudes pendientes conservan/)).toBeInTheDocument());
    expect(data.client.readPolicy).toHaveBeenCalledOnce(); expect(data.client.updatePolicy).not.toHaveBeenCalled();
  });
  it("should hide private policy draft when a restored browser cannot confirm its current account", async () => {
    const data = fixture(); render(data.node, { wrapper: Providers }); await confirm();
    data.client.viewer.mockResolvedValue({ status: "failed", code: "dependency_unavailable", message: "No pudimos confirmar la cuenta actual.", uncertain: false });
    await act(async () => { window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })); });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("No pudimos confirmar la cuenta actual"));
    expect(screen.queryByRole("checkbox", { name: "Comprobar el contacto con un código" })).not.toBeInTheDocument();
    expect(data.client.updatePolicy).not.toHaveBeenCalled();
  });
  it("should use initial SSR policy without duplicate reads and clear confirmation when the draft changes", async () => {
    const data = fixture(); render(data.node, { wrapper: Providers });
    await confirm();
    expect(data.client.readPolicy).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox", { name: "Comprobar el contacto con un código" }));
    expect(screen.getByRole("checkbox", { name: /Revisé las reglas/ })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Guardar borrador" })).toBeDisabled();
    expect(data.client.updatePolicy).not.toHaveBeenCalled();
  });

  it("should persist before the exact write and reconcile its minimum result without refreshing the route", async () => {
    const data = fixture();
    data.client.updatePolicy.mockImplementationOnce(async (_slug, input) => {
      expect(readAdmissionPolicyIntent(viewerId, slug)).toEqual({ type: "update_admission_policy", input });
      return { status: "ready", value: { state: "completed", operationId: input.operationId, replayed: false, result: { policyId: tribeId, version: 4, verificationEpoch: 2, activatedAt: null, controlActivated: false, changed: true } } };
    });
    render(data.node, { wrapper: Providers }); await confirm();
    fireEvent.click(screen.getByRole("checkbox", { name: "Comprobar el contacto con un código" })); await confirm();
    fireEvent.click(screen.getByRole("button", { name: "Guardar borrador" }));
    await waitFor(() => expect(screen.getByText("La configuración quedó guardada.")).toBeInTheDocument());
    expect(data.client.updatePolicy).toHaveBeenCalledOnce();
    expect(data.client.updatePolicy.mock.calls[0][1]).toMatchObject({ expectedVersion: 3, requiresAdditionalVerification: true });
    expect(data.client.readPolicy).not.toHaveBeenCalled();
    expect(router.refresh).not.toHaveBeenCalled();
    expect(readAdmissionPolicyIntent(viewerId, slug)).toBeNull();
  });

  it("should retain the edited draft through conflict and explicit current read, then require a new confirmation", async () => {
    const data = fixture();
    data.client.updatePolicy.mockResolvedValueOnce({ status: "failed", code: "policy_conflict", message: "La configuración cambió. Revisala y volvé a confirmar.", uncertain: false });
    data.client.readPolicy.mockResolvedValueOnce({ status: "ready", value: { ...data.policy, policy: { ...data.policy.policy, version: 5 } } });
    render(data.node, { wrapper: Providers }); await confirm();
    fireEvent.click(screen.getByRole("checkbox", { name: "Comprobar el contacto con un código" })); await confirm();
    fireEvent.click(screen.getByRole("button", { name: "Guardar borrador" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("La configuración cambió"));
    fireEvent.click(screen.getByRole("button", { name: "Consultar configuración actual" }));
    await waitFor(() => expect(data.client.readPolicy).toHaveBeenCalledOnce());
    expect(screen.getByRole("checkbox", { name: "Comprobar el contacto con un código" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Revisé las reglas/ })).not.toBeChecked();
    await confirm(); fireEvent.click(screen.getByRole("button", { name: "Guardar borrador" }));
    await waitFor(() => expect(data.client.updatePolicy).toHaveBeenCalledTimes(2));
    expect(data.client.updatePolicy.mock.calls[1][1].expectedVersion).toBe(5);
    expect(data.client.updatePolicy.mock.calls[1][1].operationId).not.toBe(data.client.updatePolicy.mock.calls[0][1].operationId);
  });

  it("should recover a restored original result before reading current policy and never replace current version with historical replay", async () => {
    const data = fixture(), operationId = "297d47c2-5419-4c3d-a339-e8b7970275ca";
    writeAdmissionPolicyIntent(viewerId, slug, { type: "update_admission_policy", input: { operationId, confirmed: true, expectedVersion: 2, ...createAdmissionPolicyDraft(data.policy), requiresAdditionalVerification: true } });
    data.client.operation.mockResolvedValueOnce({ status: "ready", value: { type: "update_admission_policy", state: "completed", operationId, replayed: true, result: { policyId: tribeId, version: 3, verificationEpoch: 2, activatedAt: null, controlActivated: false, changed: true } } });
    data.client.readPolicy.mockResolvedValueOnce({ status: "ready", value: { ...data.policy, policy: { ...data.policy.policy, version: 8 } } });
    render(data.node, { wrapper: Providers });
    await waitFor(() => expect(screen.getByText("El resultado original quedó confirmado. Revisá la configuración actual antes de continuar.")).toBeInTheDocument());
    expect(data.client.operation).toHaveBeenCalledWith(slug, operationId, expect.any(AbortSignal));
    expect(data.client.operation.mock.invocationCallOrder[0]).toBeLessThan(data.client.readPolicy.mock.invocationCallOrder[0]);
    expect(data.client.updatePolicy).not.toHaveBeenCalled();
    expect(screen.getByRole("checkbox", { name: "Comprobar el contacto con un código" })).toBeChecked();
    await confirm(); fireEvent.click(screen.getByRole("button", { name: "Guardar borrador" }));
    await waitFor(() => expect(data.client.updatePolicy).toHaveBeenCalledOnce());
    expect(data.client.updatePolicy.mock.calls[0][1].expectedVersion).toBe(8);
  });

  it("should close mutation controls on a changed viewer without reading another account's stored intention", async () => {
    const data = fixture(); data.client.viewer.mockResolvedValue({ status: "ready", value: { id: "different-leader" } });
    render(data.node, { wrapper: Providers });
    await waitFor(() => expect(screen.getByText(/La cuenta cambió/)).toBeInTheDocument());
    expect(data.client.readPolicy).not.toHaveBeenCalled();
    expect(data.client.operation).not.toHaveBeenCalled();
    expect(data.client.updatePolicy).not.toHaveBeenCalled();
  });

  it("should retain an uncertain write, read its original identity and retry only with fresh confirmation and the identical payload", async () => {
    const data = fixture();
    data.client.updatePolicy.mockResolvedValueOnce({ status: "failed", code: "dependency_unavailable", message: "No pudimos confirmar el guardado.", uncertain: true });
    render(data.node, { wrapper: Providers }); await confirm();
    fireEvent.click(screen.getByRole("button", { name: "Guardar borrador" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Consultar operación original" })).toBeInTheDocument());
    const original = readAdmissionPolicyIntent(viewerId, slug);
    expect(original).not.toBeNull();
    expect(screen.getByRole("button", { name: "Guardar borrador" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Consultar operación original" }));
    await waitFor(() => expect(screen.getByRole("checkbox", { name: /Confirmo reintentar/ })).toBeInTheDocument());
    expect(data.client.updatePolicy).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Reintentar operación original" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /Confirmo reintentar/ }));
    fireEvent.click(screen.getByRole("button", { name: "Reintentar operación original" }));
    await waitFor(() => expect(data.client.updatePolicy).toHaveBeenCalledTimes(2));
    expect(data.client.updatePolicy.mock.calls[1][1]).toEqual(original!.input);
    expect(data.client.operation.mock.invocationCallOrder[0]).toBeLessThan(data.client.updatePolicy.mock.invocationCallOrder[1]);
  });

  it("should retain local intent and close new writes for a foreign recovery namespace", async () => {
    const data = fixture(), operationId = "297d47c2-5419-4c3d-a339-e8b7970275ca";
    writeAdmissionPolicyIntent(viewerId, slug, { type: "update_admission_policy", input: { operationId, confirmed: true, expectedVersion: 2, ...createAdmissionPolicyDraft(data.policy) } });
    data.client.operation.mockResolvedValueOnce({ status: "ready", value: { type: "pause_admission_policy", state: "completed", operationId, replayed: true, result: { policyId: tribeId, version: 3, verificationEpoch: 1, activatedAt: null, controlActivated: false, changed: true } } });
    render(data.node, { wrapper: Providers });
    await waitFor(() => expect(screen.getByRole("button", { name: "Consultar operación original" })).toBeInTheDocument());
    expect(readAdmissionPolicyIntent(viewerId, slug)).not.toBeNull();
    expect(screen.getByRole("button", { name: "Guardar borrador" })).toBeDisabled();
    expect(data.client.readPolicy).not.toHaveBeenCalled();
    expect(data.client.updatePolicy).not.toHaveBeenCalled();
  });

  it("should invalidate informational activation readiness when a previously saved draft is edited", async () => {
    const data = fixture();
    data.client.readPreflight.mockResolvedValueOnce({ status: "ready", value: { prepared: true, reasons: [], impact: { unknownCommercialMemberCount: 0, privilegedCommercialMemberCount: 0 } } });
    render(data.node, { wrapper: Providers }); await confirm();
    fireEvent.click(screen.getByRole("button", { name: "Revisar requisitos de activación" }));
    await waitFor(() => expect(screen.getByText(/Los requisitos consultados están preparados/)).toBeInTheDocument());
    await confirm(); expect(screen.getByRole("button", { name: "Activar control de admisión" })).not.toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "Comprobar el contacto con un código" }));
    expect(screen.getByRole("button", { name: "Activar control de admisión" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: /Revisé las reglas/ })).not.toBeChecked();
    expect(data.client.activatePolicy).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Revisar requisitos de activación" }));
    await waitFor(() => expect(screen.getByText(/Guardá el borrador y volvé a revisar/)).toBeInTheDocument());
    expect(data.client.readPreflight).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Activar control de admisión" })).toBeDisabled();
  });

  it("should create action-scoped reauthentication only on an explicit click while retaining the original draft and without refreshing or resending", async () => {
    const data = fixture(), href = "/auth/reauthenticate?intentId=297d47c2-5419-4c3d-a339-e8b7970275ca";
    const recency = { create: vi.fn<AdmissionPolicyReauthenticationClient["create"]>(async () => ({ status: "ready", href })) };
    data.client.updatePolicy.mockResolvedValueOnce({ status: "failed", code: "reauthentication_required", message: "Volvé a autenticarte para confirmar esta operación sensible.", uncertain: false });
    render(<AdmissionPolicyContainer initialState={data.state} client={data.client} reauthentication={recency} />, { wrapper: Providers });
    await confirm(); fireEvent.click(screen.getByRole("button", { name: "Guardar borrador" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Preparar confirmación con Google" })).toBeInTheDocument());
    expect(recency.create).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Preparar confirmación con Google" }));
    await waitFor(() => expect(screen.getByRole("link", { name: "Continuar con la confirmación de Google" })).toHaveAttribute("href", href));
    expect(recency.create).toHaveBeenCalledWith({ tribeId, resourceId: tribeId, operation: "update_admission_policy", returnPath: `/${slug}/academia/admissions/settings`, confirmed: true }, expect.any(AbortSignal));
    expect(readAdmissionPolicyIntent(viewerId, slug)).toMatchObject({ type: "update_admission_policy", input: { expectedVersion: 3 } });
    expect(data.client.updatePolicy).toHaveBeenCalledOnce();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("should hide the previous account's private draft when identity changes during an unfinished original recovery", async () => {
    const data = fixture(), operationId = "297d47c2-5419-4c3d-a339-e8b7970275ca";
    writeAdmissionPolicyIntent(viewerId, slug, { type: "update_admission_policy", input: { operationId, confirmed: true, expectedVersion: 3, ...createAdmissionPolicyDraft(data.policy) } });
    let complete!: (value: Awaited<ReturnType<AdmissionPolicyBrowserClient["operation"]>>) => void;
    data.client.operation.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
    render(data.node, { wrapper: Providers });
    await waitFor(() => expect(data.client.operation).toHaveBeenCalledOnce());
    data.client.viewer.mockResolvedValue({ status: "ready", value: { id: "different-leader" } });
    complete({ status: "ready", value: { type: "update_admission_policy", state: "started", operationId } });
    await waitFor(() => expect(screen.getByText(/La cuenta cambió/)).toBeInTheDocument());
    expect(screen.queryByRole("heading", { name: "Configuración de admisión" })).not.toBeInTheDocument();
    expect(data.client.updatePolicy).not.toHaveBeenCalled();
  });

  it("should withhold original retry confirmation until current policy can be read after original absence", async () => {
    const data = fixture(), operationId = "297d47c2-5419-4c3d-a339-e8b7970275ca";
    writeAdmissionPolicyIntent(viewerId, slug, { type: "update_admission_policy", input: { operationId, confirmed: true, expectedVersion: 3, ...createAdmissionPolicyDraft(data.policy) } });
    data.client.readPolicy.mockResolvedValue({ status: "failed", code: "dependency_unavailable", message: "No pudimos consultar la configuración actual.", uncertain: false });
    render(data.node, { wrapper: Providers });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("No pudimos consultar"));
    expect(screen.queryByRole("checkbox", { name: /Confirmo reintentar/ })).not.toBeInTheDocument();
    expect(readAdmissionPolicyIntent(viewerId, slug)).not.toBeNull();
    expect(data.client.updatePolicy).not.toHaveBeenCalled();
  });
});
