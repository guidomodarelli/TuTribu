/** Exercises the guided policy route with real shared controls and doubles only of owned ports. @module academy-admission-policy-container-tests */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Activity, type ReactNode } from "react";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdmissionPolicyContainer } from "@/app/(platform)/[slug]/academia/admissions/settings/policy-container";
import { AppUIProvider } from "@/components/providers/app-providers/app-ui-provider";
import type { AdmissionPolicyBrowserClient } from "@/src/modules/academy-admissions/application/ports/admission-policy-browser-client";
import type { AdmissionPolicyPageState } from "@/src/modules/academy-admissions/application/results/admission-policy-page-state";
import type { AdmissionPolicyStateDto } from "@/src/modules/academy-admissions/application/results/admission-policy-result-schemas";
import { readAdmissionPolicyIntent, writeAdmissionPolicyIntent } from "@/lib/academy-admissions/admission-policy-intent";
import { createAdmissionPolicyDraft } from "@/src/modules/academy-admissions/application/commands/admission-policy-browser-intent";
import type { CommercialMembershipReviewBrowserClient } from "@/src/modules/academy-admissions/application/ports/commercial-membership-review-browser-client";
import type { CommercialMembershipReviewCase } from "@/src/modules/academy-admissions/domain/entities/commercial-membership-review";
import { readCommercialMembershipReviewIntent } from "@/lib/academy-admissions/commercial-membership-review-intent";

const tribeId = "83ecbfaf-0e7c-4afb-aefc-62b62800d367", viewerId = "synthetic-leader", slug = "synthetic-academy", activatedAt = "2026-10-07T10:00:00Z";
const router = { back: vi.fn(), bfcacheId: "policy-container-test", forward: vi.fn(), prefetch: vi.fn(), push: vi.fn(), refresh: vi.fn(), replace: vi.fn() } satisfies AppRouterInstance;
/** Uses the native framework router context and the actual shared UI provider. */
function Providers({ children }: { children: ReactNode }) { return <AppRouterContext.Provider value={router}><AppUIProvider>{children}</AppUIProvider></AppRouterContext.Provider>; }

type PolicyResult<Method extends keyof AdmissionPolicyBrowserClient> = Awaited<ReturnType<AdmissionPolicyBrowserClient[Method]>>;
/** @returns A promise whose resolution the test controls, to observe a write while it is in flight. */
function deferred<Value>() { let resolve!: (value: Value) => void; const promise = new Promise<Value>((complete) => { resolve = complete; }); return { promise, resolve }; }
/** @param version - Resulting version. @param controlActivated - Whether the control is activated. @returns A completed minimal mutation outcome. */
function mutation(operationId: string, version: number, controlActivated = false) {
  return { status: "ready" as const, value: { state: "completed" as const, operationId, replayed: false, result: { policyId: tribeId, version, verificationEpoch: 1, activatedAt: controlActivated ? activatedAt : null, controlActivated, changed: true } } };
}

/** @param lifecycle - Public state to start from. @returns Current application DTOs and explicit own asynchronous port outcomes. */
function fixture(lifecycle: "draft" | "not_configured" | "active" | "paused" = "draft") {
  const activatedControl = lifecycle === "active" || lifecycle === "paused";
  const savedPolicy = { id: tribeId, version: 3, verificationEpoch: 1, mode: "manual_review" as const, contactType: "email" as const, isOpen: lifecycle !== "paused", allowCommonExceptions: false, requiresAdditionalVerification: false, requiresWhatsappNumber: false, phoneChannel: null, allowSmsAlternative: false, activatedAt: activatedControl ? activatedAt : null, messagingConnectionId: null, messagingConnectionVersion: null, usage: null, requirements: [] };
  const policy: AdmissionPolicyStateDto = { state: lifecycle, controlActivated: activatedControl, policy: lifecycle === "not_configured" ? null : savedPolicy, usage: null, preparation: { state: "not_evaluated", requirements: lifecycle === "not_configured" ? ["policy_unavailable"] : [] }, impact: { pendingRequestCount: 2, contactTypeLocked: activatedControl, historicalLinksProtected: activatedControl, warnings: [] } };
  const state: Extract<AdmissionPolicyPageState, { kind: "ready" }> = { kind: "ready", slug, tribeId, viewerId, renderedAt: "2026-10-07T09:00:00Z", policy };
  const client = {
    viewer: vi.fn<AdmissionPolicyBrowserClient["viewer"]>(async () => ({ status: "ready", value: { id: viewerId } })),
    readPolicy: vi.fn<AdmissionPolicyBrowserClient["readPolicy"]>(async () => ({ status: "ready", value: policy })),
    readPreflight: vi.fn<AdmissionPolicyBrowserClient["readPreflight"]>(async () => ({ status: "ready", value: { prepared: true, reasons: [], impact: { unknownCommercialMemberCount: 0, privilegedCommercialMemberCount: 0 } } })),
    operation: vi.fn<AdmissionPolicyBrowserClient["operation"]>(async () => ({ status: "failed", code: "resource_unavailable", message: "La operación no está disponible.", uncertain: false })),
    initializePolicy: vi.fn<AdmissionPolicyBrowserClient["initializePolicy"]>(async (_slug, input) => mutation(input.operationId, 1)),
    updatePolicy: vi.fn<AdmissionPolicyBrowserClient["updatePolicy"]>(async (_slug, input) => mutation(input.operationId, input.expectedVersion + 1, activatedControl)),
    activatePolicy: vi.fn<AdmissionPolicyBrowserClient["activatePolicy"]>(async (_slug, input) => mutation(input.operationId, input.expectedVersion + 1, true)),
    pausePolicy: vi.fn<AdmissionPolicyBrowserClient["pausePolicy"]>(async (_slug, input) => mutation(input.operationId, input.expectedVersion + 1, true)),
  };
  const reviewClient = {
    viewer: client.viewer,
    operation: vi.fn<CommercialMembershipReviewBrowserClient["operation"]>(async () => ({ status: "failed", code: "resource_unavailable", message: "La operación no está disponible.", uncertain: false })),
    readCommercialReviews: vi.fn<CommercialMembershipReviewBrowserClient["readCommercialReviews"]>(async () => ({ status: "ready", value: { cases: [], pendingCount: 0, resolvedCount: 0 } })),
    resolveCommercialReview: vi.fn<CommercialMembershipReviewBrowserClient["resolveCommercialReview"]>(async (_slug, memberId, input) => ({ status: "ready", value: { state: "completed", operationId: input.operationId, replayed: false, result: { status: "resolved", memberId, decision: input.decision, resultingRole: "tribemate", resultingStatus: input.expected.status, resultingRecoveryStatus: input.decision === "recover_muted" ? "muted" : "active", decidedAt: "2026-10-19T12:00:00.000Z" } } })),
  };
  return { policy, state, client, reviewClient, node: <AdmissionPolicyContainer initialState={state} client={client} reviewClient={reviewClient} /> };
}

/** Waits for the initial account check, then walks every step up to the review. */
async function goToReview() {
  await waitFor(() => expect(screen.getByRole("button", { name: "Continuar" })).toBeEnabled());
  while (screen.queryByRole("button", { name: "Continuar" })) fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
}
/** Confirmation is always a fresh UI action; persisted local intent cannot supply it. */
async function confirm() {
  const checkbox = screen.getByRole("checkbox", { name: /Revisé las reglas/ });
  await waitFor(() => expect(checkbox).not.toBeDisabled());
  fireEvent.click(checkbox);
}

beforeEach(() => { window.sessionStorage.clear(); vi.clearAllMocks(); });
describe("guided policy route workflow", () => {
  it("should create, save, check and activate a first configuration through one loading action with sub-step status", async () => {
    const data = fixture("not_configured");
    const update = deferred<PolicyResult<"updatePolicy">>(), preflight = deferred<PolicyResult<"readPreflight">>(), activation = deferred<PolicyResult<"activatePolicy">>();
    data.client.updatePolicy.mockImplementationOnce(() => update.promise);
    data.client.readPreflight.mockImplementationOnce(() => preflight.promise);
    data.client.activatePolicy.mockImplementationOnce(() => activation.promise);
    render(data.node, { wrapper: Providers });
    expect(screen.getByText(/Todavía no hay reglas de admisión/)).toBeInTheDocument();
    await goToReview();
    expect(screen.getByText("Se reciben")).toBeInTheDocument();
    await confirm();
    const final = screen.getByRole("button", { name: "Guardar y activar admisiones" });
    fireEvent.click(final);
    await waitFor(() => expect(data.client.updatePolicy).toHaveBeenCalledOnce());
    expect(final).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("Guardando las reglas…")).toHaveAttribute("role", "status");
    expect(data.client.initializePolicy.mock.invocationCallOrder[0]).toBeLessThan(data.client.updatePolicy.mock.invocationCallOrder[0]);
    const saved = data.client.updatePolicy.mock.calls[0][1];
    expect(saved).toMatchObject({ expectedVersion: 1, mode: "manual_review", isOpen: true });
    await act(async () => { update.resolve(mutation(saved.operationId, 2)); });
    await waitFor(() => expect(screen.getByText("Revisando los requisitos…")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Guardar y activar admisiones" })).toHaveAttribute("aria-busy", "true");
    await act(async () => { preflight.resolve({ status: "ready", value: { prepared: true, reasons: [], impact: { unknownCommercialMemberCount: 0, privilegedCommercialMemberCount: 0 } } }); });
    await waitFor(() => expect(screen.getByText("Activando las admisiones…")).toBeInTheDocument());
    const activationInput = data.client.activatePolicy.mock.calls[0][1];
    expect(activationInput.expectedVersion).toBe(2);
    await act(async () => { activation.resolve(mutation(activationInput.operationId, 3, true)); });
    await waitFor(() => expect(screen.getByRole("heading", { name: "Admisiones abiertas" })).toBeInTheDocument());
    expect(screen.getByText("Listo: las admisiones quedaron activadas y abiertas. Ya se pueden recibir solicitudes.")).toHaveAttribute("role", "status");
    expect(readAdmissionPolicyIntent(viewerId, slug)).toBeNull();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("should stop before activating when requirements are missing, explain them and keep every choice", async () => {
    const data = fixture();
    data.client.readPreflight.mockResolvedValueOnce({ status: "ready", value: { prepared: false, reasons: ["preflight_evaluator_disabled"], impact: { unknownCommercialMemberCount: 0, privilegedCommercialMemberCount: 0 } } });
    render(data.node, { wrapper: Providers });
    expect(screen.getByRole("group", { name: "Tenés reglas guardadas sin publicar" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Continuar" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Comprobar el contacto con un código" }));
    await goToReview(); await confirm();
    fireEvent.click(screen.getByRole("button", { name: "Guardar y activar admisiones" }));
    const block = await screen.findByRole("region", { name: "Lo que falta resolver" });
    expect(block).toHaveTextContent("Todavía falta un requisito para activar las admisiones.");
    expect(block).toHaveTextContent("La plataforma todavía no habilitó la admisión para esta academia.");
    expect(block).toHaveTextContent("Código de diagnóstico: preflight_evaluator_disabled");
    expect(screen.getByRole("group", { name: "Tenés reglas guardadas sin publicar" })).toHaveTextContent("Por ahora no se pueden activar: depende del equipo de TuTribu.");
    expect(block).toHaveTextContent("Tus reglas quedaron guardadas como borrador.");
    expect(data.client.updatePolicy.mock.calls[0][1]).toMatchObject({ expectedVersion: 3, requiresAdditionalVerification: true });
    expect(data.client.activatePolicy).not.toHaveBeenCalled();
    expect(screen.queryByText(/sólo está disponible para el líder activo/)).not.toBeInTheDocument();
    expect(screen.getByText("Código de comprobación").nextElementSibling).toHaveTextContent("Sí");
    expect(screen.getByRole("checkbox", { name: /Revisé las reglas/ })).toBeChecked();
  });

  it("should list current configuration requirements with their page when activation is denied", async () => {
    const data = fixture();
    data.client.activatePolicy.mockResolvedValueOnce({ status: "failed", code: "admission_ineligible", message: "Falta un requisito actual para resolver el ingreso.", uncertain: false });
    data.client.readPolicy.mockResolvedValueOnce({ status: "ready", value: { ...data.policy, preparation: { state: "evaluated", requirements: ["verification_unavailable"] } } });
    render(data.node, { wrapper: Providers });
    await goToReview(); await confirm();
    fireEvent.click(screen.getByRole("button", { name: "Guardar y activar admisiones" }));
    const block = await screen.findByRole("region", { name: "Lo que falta resolver" });
    expect(block).toHaveTextContent("El canal para comprobar el contacto todavía no está preparado.");
    expect(screen.getByRole("link", { name: "Ir a Conexión" })).toHaveAttribute("href", `/${slug}/academia/admissions/messaging/connections?return=policy-review`);
    expect(screen.queryByText("Falta un requisito actual para resolver el ingreso.")).not.toBeInTheDocument();
    expect(data.client.updatePolicy).not.toHaveBeenCalled();
  });

  it("should say what was done when activation fails and retry only the missing sub-steps", async () => {
    const data = fixture();
    data.client.activatePolicy.mockResolvedValueOnce({ status: "failed", code: "dependency_unavailable", message: "La mensajería no está disponible temporalmente.", uncertain: false });
    render(data.node, { wrapper: Providers });
    await waitFor(() => expect(screen.getByRole("button", { name: "Continuar" })).toBeEnabled());
    fireEvent.click(screen.getByRole("radio", { name: "Lista de habilitados" }));
    await goToReview(); await confirm();
    fireEvent.click(screen.getByRole("button", { name: "Guardar y activar admisiones" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("No pudimos activar las admisiones. La mensajería no está disponible temporalmente."));
    expect(screen.getByRole("alert")).toHaveTextContent("Las reglas ya quedaron guardadas como borrador.");
    expect(readAdmissionPolicyIntent(viewerId, slug)).toBeNull();
    data.client.readPolicy.mockResolvedValueOnce({ status: "ready", value: { ...data.policy, policy: { ...data.policy.policy!, mode: "allowlist", version: 4 } } });
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Admisiones abiertas" })).toBeInTheDocument());
    expect(data.client.updatePolicy).toHaveBeenCalledOnce();
    expect(data.client.readPolicy).toHaveBeenCalledOnce();
    expect(data.client.activatePolicy).toHaveBeenCalledTimes(2);
    expect(data.client.activatePolicy.mock.calls[1][1].expectedVersion).toBe(4);
    expect(data.client.activatePolicy.mock.calls[1][1].operationId).not.toBe(data.client.activatePolicy.mock.calls[0][1].operationId);
  });

  it("should require a new confirmation when a retry finds a configuration changed by someone else", async () => {
    const data = fixture();
    data.client.updatePolicy.mockResolvedValueOnce({ status: "failed", code: "policy_conflict", message: "La configuración cambió. Revisala y volvé a confirmar.", uncertain: false });
    data.client.readPolicy.mockResolvedValueOnce({ status: "ready", value: { ...data.policy, policy: { ...data.policy.policy!, version: 5 } } });
    render(data.node, { wrapper: Providers });
    await waitFor(() => expect(screen.getByRole("button", { name: "Continuar" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Comprobar el contacto con un código" }));
    await goToReview(); await confirm();
    fireEvent.click(screen.getByRole("button", { name: "Guardar y activar admisiones" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("No pudimos guardar las reglas. La configuración cambió."));
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await waitFor(() => expect(screen.getByText("La configuración cambió mientras tanto. Revisá el resumen y volvé a confirmar.")).toBeInTheDocument());
    expect(screen.getByRole("checkbox", { name: /Revisé las reglas/ })).not.toBeChecked();
    expect(data.client.updatePolicy).toHaveBeenCalledOnce();
    await confirm(); fireEvent.click(screen.getByRole("button", { name: "Guardar y activar admisiones" }));
    await waitFor(() => expect(data.client.updatePolicy).toHaveBeenCalledTimes(2));
    expect(data.client.updatePolicy.mock.calls[1][1]).toMatchObject({ expectedVersion: 5, requiresAdditionalVerification: true });
    expect(data.client.updatePolicy.mock.calls[1][1].operationId).not.toBe(data.client.updatePolicy.mock.calls[0][1].operationId);
  });

  it("should retain an uncertain write, read its original identity and retry only with fresh confirmation and the identical payload", async () => {
    const data = fixture();
    data.client.updatePolicy.mockResolvedValueOnce({ status: "failed", code: "dependency_unavailable", message: "No pudimos confirmar el guardado.", uncertain: true });
    render(data.node, { wrapper: Providers });
    await waitFor(() => expect(screen.getByRole("button", { name: "Continuar" })).toBeEnabled());
    fireEvent.click(screen.getByRole("radio", { name: "Lista de habilitados" }));
    await goToReview(); await confirm();
    fireEvent.click(screen.getByRole("button", { name: "Guardar y activar admisiones" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Consultar operación original" })).toBeInTheDocument());
    const original = readAdmissionPolicyIntent(viewerId, slug);
    expect(original).not.toBeNull();
    expect(screen.getByRole("button", { name: "Guardar y activar admisiones" })).toBeDisabled();
    expect(screen.getByText("Antes de continuar, consultá el resultado de la operación anterior.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reintentar" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Consultar operación original" }));
    await waitFor(() => expect(screen.getByRole("checkbox", { name: /Confirmo reintentar/ })).toBeInTheDocument());
    expect(data.client.updatePolicy).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Reintentar operación original" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /Confirmo reintentar/ }));
    fireEvent.click(screen.getByRole("button", { name: "Reintentar operación original" }));
    await waitFor(() => expect(data.client.updatePolicy).toHaveBeenCalledTimes(2));
    expect(data.client.updatePolicy.mock.calls[1][1]).toEqual(original!.input);
    expect(data.client.operation.mock.invocationCallOrder[0]).toBeLessThan(data.client.updatePolicy.mock.invocationCallOrder[1]);
    expect(data.client.activatePolicy).not.toHaveBeenCalled();
  });

  it("should show the leader-only notice for a permission denial but not for other failures", async () => {
    const data = fixture();
    const update = deferred<PolicyResult<"updatePolicy">>();
    data.client.updatePolicy.mockImplementationOnce(() => update.promise);
    data.client.updatePolicy.mockResolvedValueOnce({ status: "failed", code: "permission_denied", message: "No tenés permiso para realizar esta operación.", uncertain: false });
    render(data.node, { wrapper: Providers });
    await waitFor(() => expect(screen.getByRole("button", { name: "Continuar" })).toBeEnabled());
    fireEvent.click(screen.getByRole("radio", { name: "Lista de habilitados" }));
    await goToReview(); await confirm();
    fireEvent.click(screen.getByRole("button", { name: "Guardar y activar admisiones" }));
    await waitFor(() => expect(data.client.updatePolicy).toHaveBeenCalledOnce());
    expect(screen.queryByText(/sólo está disponible para el líder activo/)).not.toBeInTheDocument();
    await act(async () => { update.resolve({ status: "failed", code: "dependency_unavailable", message: "La mensajería no está disponible temporalmente.", uncertain: false }); });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("No pudimos guardar las reglas."));
    expect(screen.queryByText(/sólo está disponible para el líder activo/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await waitFor(() => expect(screen.getByText("La configuración sólo está disponible para el líder activo de esta academia.")).toBeInTheDocument());
  });

  it("should pause with its reason, close the saved draft and edit without reopening admissions", async () => {
    const data = fixture("active");
    const pause = deferred<PolicyResult<"pausePolicy">>();
    data.client.pausePolicy.mockImplementationOnce(() => pause.promise);
    render(data.node, { wrapper: Providers });
    expect(screen.getByRole("heading", { name: "Admisiones abiertas" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Pausar admisiones" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Pausar admisiones" }));
    expect(screen.getByRole("button", { name: "Confirmar pausa" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Motivo de la pausa"), { target: { value: "Cierre de cohorte" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar pausa" }));
    await waitFor(() => expect(data.client.pausePolicy).toHaveBeenCalledOnce());
    expect(screen.getByRole("button", { name: "Confirmar pausa" })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("Pausando las admisiones…")).toBeInTheDocument();
    const pauseInput = data.client.pausePolicy.mock.calls[0][1];
    expect(pauseInput).toMatchObject({ expectedVersion: 3, reason: "Cierre de cohorte" });
    await act(async () => { pause.resolve(mutation(pauseInput.operationId, 4, true)); });
    await waitFor(() => expect(screen.getByRole("heading", { name: "Admisiones pausadas" })).toBeInTheDocument());
    expect(screen.getByText("Las admisiones quedaron pausadas. Nadie puede postularse hasta que las reanudes.")).toHaveAttribute("role", "status");
    fireEvent.click(screen.getByRole("button", { name: "Editar reglas" }));
    fireEvent.click(screen.getByRole("radio", { name: "Lista de habilitados" }));
    await goToReview();
    expect(screen.getByText("No se reciben")).toBeInTheDocument();
    await confirm();
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(screen.getByText("Los cambios en las reglas quedaron guardados.")).toBeInTheDocument());
    expect(data.client.updatePolicy.mock.calls[0][1]).toMatchObject({ expectedVersion: 4, mode: "allowlist", isOpen: false });
    expect(data.client.readPreflight).not.toHaveBeenCalled();
    expect(data.client.activatePolicy).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Admisiones pausadas" })).toBeInTheDocument();
  });

  it("should resume paused admissions by saving the current rules with intake enabled", async () => {
    const data = fixture("paused");
    render(data.node, { wrapper: Providers });
    await waitFor(() => expect(screen.getByRole("button", { name: "Reanudar admisiones" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Reanudar admisiones" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Admisiones abiertas" })).toBeInTheDocument());
    expect(data.client.updatePolicy.mock.calls[0][1]).toMatchObject({ expectedVersion: 3, isOpen: true, mode: "manual_review" });
    expect(screen.getByText("Las admisiones se reanudaron. Ya se pueden recibir solicitudes.")).toBeInTheDocument();
  });

  it("should explain a denied resume with its requirements while admissions stay paused", async () => {
    const data = fixture("paused");
    data.client.updatePolicy.mockResolvedValueOnce({ status: "failed", code: "admission_ineligible", message: "Falta un requisito actual para resolver el ingreso.", uncertain: false });
    data.client.readPolicy.mockResolvedValueOnce({ status: "ready", value: { ...data.policy, preparation: { state: "evaluated", requirements: ["verification_quota_unavailable"] } } });
    render(data.node, { wrapper: Providers });
    await waitFor(() => expect(screen.getByRole("button", { name: "Reanudar admisiones" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Reanudar admisiones" }));
    const block = await screen.findByRole("region", { name: "Lo que falta resolver" });
    expect(block).toHaveTextContent("Todavía falta un requisito para reanudar las admisiones.");
    expect(screen.getByRole("link", { name: "Ir a Países y cupos" })).toHaveAttribute("href", `/${slug}/academia/admissions/messaging`);
    expect(screen.getByRole("heading", { name: "Admisiones pausadas" })).toBeInTheDocument();
  });

  it("should detect an account change before interpreting a failed requirement check", async () => {
    const data = fixture(); const check = deferred<PolicyResult<"readPreflight">>();
    data.client.readPreflight.mockImplementationOnce(() => check.promise);
    render(data.node, { wrapper: Providers });
    await goToReview(); await confirm();
    fireEvent.click(screen.getByRole("button", { name: "Guardar y activar admisiones" }));
    await waitFor(() => expect(data.client.readPreflight).toHaveBeenCalledOnce());
    data.client.viewer.mockResolvedValue({ status: "ready", value: { id: "different-leader" } });
    await act(async () => { check.resolve({ status: "failed", code: "dependency_unavailable", message: "No pudimos consultar los requisitos.", uncertain: false }); });
    await waitFor(() => expect(screen.getByText(/La cuenta cambió/)).toBeInTheDocument());
    expect(screen.queryByRole("radio", { name: "Revisión manual" })).not.toBeInTheDocument();
    expect(data.client.activatePolicy).not.toHaveBeenCalled();
  });

  it("should reload current pending impact on Activity restoration without duplicating the initial SSR read", async () => {
    const data = fixture(); const view = render(<Activity mode="visible">{data.node}</Activity>, { wrapper: Providers });
    await waitFor(() => expect(screen.getByRole("button", { name: "Continuar" })).toBeEnabled());
    expect(data.client.readPolicy).not.toHaveBeenCalled();
    view.rerender(<Activity mode="hidden">{data.node}</Activity>);
    data.client.readPolicy.mockResolvedValueOnce({ status: "ready", value: { ...data.policy, impact: { ...data.policy.impact, pendingRequestCount: 5 } } });
    view.rerender(<Activity mode="visible">{data.node}</Activity>);
    await waitFor(() => expect(screen.getByText("5 solicitudes pendientes")).toBeInTheDocument());
    expect(data.client.readPolicy).toHaveBeenCalledOnce(); expect(data.client.updatePolicy).not.toHaveBeenCalled();
  });

  it("should hide private policy draft when a restored browser cannot confirm its current account", async () => {
    const data = fixture(); render(data.node, { wrapper: Providers });
    await waitFor(() => expect(screen.getByRole("button", { name: "Continuar" })).toBeEnabled());
    data.client.viewer.mockResolvedValue({ status: "failed", code: "dependency_unavailable", message: "No pudimos confirmar la cuenta actual.", uncertain: false });
    await act(async () => { window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })); });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("No pudimos confirmar la cuenta actual"));
    expect(screen.queryByRole("radio", { name: "Revisión manual" })).not.toBeInTheDocument();
    expect(data.client.updatePolicy).not.toHaveBeenCalled();
  });

  it("should clear the confirmation when the draft changes", async () => {
    const data = fixture(); render(data.node, { wrapper: Providers });
    await goToReview(); await confirm();
    fireEvent.click(screen.getByRole("button", { name: "Atrás" }));
    fireEvent.click(screen.getByRole("button", { name: "Atrás" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Comprobar el contacto con un código" }));
    await goToReview();
    expect(screen.getByRole("checkbox", { name: /Revisé las reglas/ })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Guardar y activar admisiones" })).toBeDisabled();
    expect(data.client.updatePolicy).not.toHaveBeenCalled();
  });

  it("should recover a restored original result before reading current policy and never replace current version with historical replay", async () => {
    const data = fixture(), operationId = "297d47c2-5419-4c3d-a339-e8b7970275ca";
    writeAdmissionPolicyIntent(viewerId, slug, { type: "update_admission_policy", input: { operationId, confirmed: true, expectedVersion: 2, ...createAdmissionPolicyDraft(data.policy), requiresAdditionalVerification: true } });
    data.client.operation.mockResolvedValueOnce({ status: "ready", value: { type: "update_admission_policy", state: "completed", operationId, replayed: true, result: { policyId: tribeId, version: 3, verificationEpoch: 2, activatedAt: null, controlActivated: false, changed: true } } });
    data.client.readPolicy.mockResolvedValueOnce({ status: "ready", value: { ...data.policy, policy: { ...data.policy.policy!, version: 8 } } });
    render(data.node, { wrapper: Providers });
    await waitFor(() => expect(screen.getByText("El resultado original quedó confirmado. Revisá la configuración actual antes de continuar.")).toBeInTheDocument());
    expect(data.client.operation).toHaveBeenCalledWith(slug, operationId, expect.any(AbortSignal));
    expect(data.client.operation.mock.invocationCallOrder[0]).toBeLessThan(data.client.readPolicy.mock.invocationCallOrder[0]);
    expect(data.client.updatePolicy).not.toHaveBeenCalled();
    await goToReview();
    expect(screen.getByText("Código de comprobación").nextElementSibling).toHaveTextContent("Sí");
    await confirm(); fireEvent.click(screen.getByRole("button", { name: "Guardar y activar admisiones" }));
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

  it("should retain local intent and close new writes for a foreign recovery namespace", async () => {
    const data = fixture(), operationId = "297d47c2-5419-4c3d-a339-e8b7970275ca";
    writeAdmissionPolicyIntent(viewerId, slug, { type: "update_admission_policy", input: { operationId, confirmed: true, expectedVersion: 2, ...createAdmissionPolicyDraft(data.policy) } });
    data.client.operation.mockResolvedValueOnce({ status: "ready", value: { type: "pause_admission_policy", state: "completed", operationId, replayed: true, result: { policyId: tribeId, version: 3, verificationEpoch: 1, activatedAt: null, controlActivated: false, changed: true } } });
    render(data.node, { wrapper: Providers });
    await waitFor(() => expect(screen.getByRole("button", { name: "Consultar operación original" })).toBeInTheDocument());
    expect(readAdmissionPolicyIntent(viewerId, slug)).not.toBeNull();
    await goToReview();
    expect(screen.getByRole("button", { name: "Guardar y activar admisiones" })).toBeDisabled();
    expect(data.client.readPolicy).not.toHaveBeenCalled();
    expect(data.client.updatePolicy).not.toHaveBeenCalled();
  });

  it("should show a legacy session-change answer as a plain error, keep the original intent and offer no Google control", async () => {
    const data = fixture(), message = "Tu sesión cambió. Recargá la página e intentá de nuevo.";
    data.client.updatePolicy.mockResolvedValueOnce({ status: "failed", code: "reauthentication_required", message, uncertain: false });
    render(data.node, { wrapper: Providers });
    await waitFor(() => expect(screen.getByRole("button", { name: "Continuar" })).toBeEnabled());
    fireEvent.click(screen.getByRole("radio", { name: "Lista de habilitados" }));
    await goToReview(); await confirm(); fireEvent.click(screen.getByRole("button", { name: "Guardar y activar admisiones" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(message));
    expect(screen.getByRole("button", { name: "Consultar operación original" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Google/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Google/ })).not.toBeInTheDocument();
    expect(readAdmissionPolicyIntent(viewerId, slug)).toMatchObject({ type: "update_admission_policy", input: { expectedVersion: 3 } });
    expect(data.client.updatePolicy).toHaveBeenCalledOnce();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("should hide the previous account's private draft when identity changes during an unfinished original recovery", async () => {
    const data = fixture(), operationId = "297d47c2-5419-4c3d-a339-e8b7970275ca";
    writeAdmissionPolicyIntent(viewerId, slug, { type: "update_admission_policy", input: { operationId, confirmed: true, expectedVersion: 3, ...createAdmissionPolicyDraft(data.policy) } });
    const recovery = deferred<PolicyResult<"operation">>();
    data.client.operation.mockImplementationOnce(() => recovery.promise);
    render(data.node, { wrapper: Providers });
    await waitFor(() => expect(data.client.operation).toHaveBeenCalledOnce());
    data.client.viewer.mockResolvedValue({ status: "ready", value: { id: "different-leader" } });
    recovery.resolve({ status: "ready", value: { type: "update_admission_policy", state: "started", operationId } });
    await waitFor(() => expect(screen.getByText(/La cuenta cambió/)).toBeInTheDocument());
    expect(screen.queryByRole("region", { name: "Estado actual" })).not.toBeInTheDocument();
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

  describe("memberships blocked by payment", () => {
    const unknownCase: CommercialMembershipReviewCase = { memberId: "0b9f6c8e-2f4f-4b8e-9d11-0d6f6a0c2a11", displayName: "Integrante sintética", role: "tribemate", status: "blocked", statusReason: "payment_blocked", recoveryStatus: null, joinedAt: "2026-05-07T12:00:00.000Z" };
    const guardianCase: CommercialMembershipReviewCase = { memberId: "5c3c1f0e-8d7a-4f0b-9a7e-2b1d3c4e5f60", displayName: "Guardiana sintética", role: "guardian", status: "removed", statusReason: "subscription_inactive", recoveryStatus: "active", joinedAt: "2025-11-02T12:00:00.000Z" };

    it("should insert the review before the final step when activation is blocked, record each decision and return to «Activar ahora»", async () => {
      const data = fixture();
      data.client.readPreflight.mockResolvedValueOnce({ status: "ready", value: { prepared: false, reasons: ["preflight_unknown_commercial_history", "preflight_privileged_commercial_membership"], impact: { unknownCommercialMemberCount: 1, privilegedCommercialMemberCount: 1 } } });
      data.reviewClient.readCommercialReviews.mockResolvedValueOnce({ status: "ready", value: { cases: [unknownCase, guardianCase], pendingCount: 2, resolvedCount: 0 } })
        .mockResolvedValueOnce({ status: "ready", value: { cases: [guardianCase], pendingCount: 1, resolvedCount: 1 } })
        .mockResolvedValueOnce({ status: "ready", value: { cases: [], pendingCount: 0, resolvedCount: 2 } });
      render(data.node, { wrapper: Providers });
      await goToReview(); await confirm();
      fireEvent.click(screen.getByRole("button", { name: "Guardar y activar admisiones" }));
      const list = await screen.findByRole("list", { name: "Membresías por revisar" });
      expect(screen.getByRole("group", { name: "Revisá membresías bloqueadas por pago" })).toBeInTheDocument();
      expect(screen.getByRole("navigation", { name: "Paso 4 de 5" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Continuar" })).toBeDisabled();
      expect(list).toHaveTextContent("Integrante sintética");
      expect(list).toHaveTextContent("Alta: 07/05/2026");
      expect(screen.queryByRole("radio", { name: "No vuelve por pago: queda retirada" })).toBeInTheDocument();
      const save = screen.getAllByRole("button", { name: "Guardar decisión" })[0];
      expect(save).toBeDisabled();
      fireEvent.click(screen.getByRole("radio", { name: "Al regularizar el pago vuelve como integrante silenciada" }));
      fireEvent.change(screen.getAllByLabelText("Motivo (opcional)")[0], { target: { value: "  Acordado con la tribu  " } });
      fireEvent.click(screen.getAllByRole("checkbox", { name: /Confirmo esta decisión/ })[0]);
      fireEvent.click(save);
      await waitFor(() => expect(screen.getByText("Listo: registramos la decisión para Integrante sintética.")).toBeInTheDocument());
      expect(data.reviewClient.resolveCommercialReview).toHaveBeenCalledWith(slug, unknownCase.memberId, expect.objectContaining({ confirmed: true, decision: "recover_muted", reason: "Acordado con la tribu", expected: { role: "tribemate", status: "blocked", statusReason: "payment_blocked", recoveryStatus: null } }), expect.any(AbortSignal));
      expect(readCommercialMembershipReviewIntent(viewerId, slug)).toBeNull();
      fireEvent.click(screen.getByRole("radio", { name: "No vuelve por pago: queda retirada" }));
      fireEvent.click(screen.getByRole("checkbox", { name: /Confirmo esta decisión/ }));
      fireEvent.click(screen.getByRole("button", { name: "Guardar decisión" }));
      await waitFor(() => expect(screen.getByRole("button", { name: "Activar ahora" })).toBeInTheDocument());
      expect(data.reviewClient.resolveCommercialReview.mock.calls[1][2]).toMatchObject({ decision: "retire", expected: { role: "guardian", recoveryStatus: "active" } });
      expect(screen.getByText("No quedan membresías por revisar; ya podés volver a «Activar ahora».")).toHaveAttribute("role", "status");
      expect(screen.queryByRole("region", { name: "Lo que falta resolver" })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Activar ahora" }));
      await waitFor(() => expect(data.client.activatePolicy).toHaveBeenCalledOnce());
    });

    it("should keep an uncertain decision and read its original result instead of sending it again", async () => {
      const data = fixture();
      data.client.readPreflight.mockResolvedValueOnce({ status: "ready", value: { prepared: false, reasons: ["preflight_unknown_commercial_history"], impact: { unknownCommercialMemberCount: 1, privilegedCommercialMemberCount: 0 } } });
      data.reviewClient.readCommercialReviews.mockResolvedValue({ status: "ready", value: { cases: [unknownCase], pendingCount: 1, resolvedCount: 0 } });
      data.reviewClient.resolveCommercialReview.mockResolvedValueOnce({ status: "failed", code: "dependency_unavailable", message: "No pudimos confirmar la decisión.", uncertain: true });
      render(data.node, { wrapper: Providers });
      await goToReview(); await confirm();
      fireEvent.click(screen.getByRole("button", { name: "Guardar y activar admisiones" }));
      await screen.findByRole("list", { name: "Membresías por revisar" });
      fireEvent.click(screen.getByRole("radio", { name: "Al regularizar el pago vuelve como integrante activa" }));
      fireEvent.click(screen.getByRole("checkbox", { name: /Confirmo esta decisión/ }));
      fireEvent.click(screen.getByRole("button", { name: "Guardar decisión" }));
      await waitFor(() => expect(screen.getByRole("button", { name: "Consultar resultado" })).toBeInTheDocument());
      const pending = readCommercialMembershipReviewIntent(viewerId, slug);
      expect(pending?.input.decision).toBe("recover_active");
      expect(screen.getByRole("button", { name: "Guardar decisión" })).toBeDisabled();
      data.reviewClient.operation.mockResolvedValueOnce({ status: "ready", value: { type: "resolve_commercial_membership_review", state: "completed", operationId: pending!.input.operationId, replayed: true, result: { status: "resolved", memberId: unknownCase.memberId, decision: "recover_active", resultingRole: "tribemate", resultingStatus: "blocked", resultingRecoveryStatus: "active", decidedAt: "2026-10-19T12:00:00.000Z" } } });
      data.reviewClient.readCommercialReviews.mockResolvedValue({ status: "ready", value: { cases: [], pendingCount: 0, resolvedCount: 1 } });
      fireEvent.click(screen.getByRole("button", { name: "Consultar resultado" }));
      await waitFor(() => expect(screen.getByRole("button", { name: "Activar ahora" })).toBeInTheDocument());
      expect(data.reviewClient.resolveCommercialReview).toHaveBeenCalledOnce();
      expect(readCommercialMembershipReviewIntent(viewerId, slug)).toBeNull();
    });

    it("should label a crossed commercial pair with its own status and reason and send them as the observed facts", async () => {
      const data = fixture();
      const crossedCase: CommercialMembershipReviewCase = { ...unknownCase, memberId: "7d2e4f60-1a3b-4c5d-8e9f-0a1b2c3d4e5f", displayName: "Integrante cruzada", status: "removed", statusReason: "payment_blocked" };
      data.reviewClient.readCommercialReviews.mockResolvedValue({ status: "ready", value: { cases: [], pendingCount: 0, resolvedCount: 1 } });
      render(<AdmissionPolicyContainer initialState={data.state} client={data.client} reviewClient={data.reviewClient} initialCommercialReview={{ kind: "ready", list: { cases: [crossedCase], pendingCount: 1, resolvedCount: 0 } }} entryStep="memberships" />, { wrapper: Providers });
      const facts = await screen.findByRole("list", { name: "Estado de Integrante cruzada" });
      expect(within(facts).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["Dada de baja", "Pago bloqueado", "Estado anterior desconocido"]);
      fireEvent.click(screen.getByRole("radio", { name: "Al regularizar el pago vuelve como integrante activa" }));
      fireEvent.click(screen.getByRole("checkbox", { name: /Confirmo esta decisión/ }));
      fireEvent.click(screen.getByRole("button", { name: "Guardar decisión" }));
      await waitFor(() => expect(data.reviewClient.resolveCommercialReview).toHaveBeenCalledWith(slug, crossedCase.memberId, expect.objectContaining({ decision: "recover_active", expected: { role: "tribemate", status: "removed", statusReason: "payment_blocked", recoveryStatus: null } }), expect.any(AbortSignal)));
      await waitFor(() => expect(data.reviewClient.readCommercialReviews).toHaveBeenCalled());
    });

    it("should explain a rejected decision and refresh the list", async () => {
      const data = fixture();
      data.reviewClient.resolveCommercialReview.mockImplementationOnce(async (_slug, memberId, input) => ({ status: "ready", value: { state: "completed", operationId: input.operationId, replayed: false, result: { status: "rejected", memberId, reason: "membership_changed" } } }));
      data.reviewClient.readCommercialReviews.mockResolvedValue({ status: "ready", value: { cases: [unknownCase], pendingCount: 1, resolvedCount: 0 } });
      render(<AdmissionPolicyContainer initialState={data.state} client={data.client} reviewClient={data.reviewClient} initialCommercialReview={{ kind: "ready", list: { cases: [unknownCase], pendingCount: 1, resolvedCount: 0 } }} entryStep="memberships" />, { wrapper: Providers });
      await screen.findByRole("list", { name: "Membresías por revisar" });
      fireEvent.click(screen.getByRole("radio", { name: "Al regularizar el pago vuelve como integrante activa" }));
      fireEvent.click(screen.getByRole("checkbox", { name: /Confirmo esta decisión/ }));
      fireEvent.click(screen.getByRole("button", { name: "Guardar decisión" }));
      await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("La membresía cambió mientras decidías. Actualizamos la lista: revisala y volvé a decidir."));
      expect(data.reviewClient.readCommercialReviews).toHaveBeenCalled();
    });
  });

  describe("unpublished drafts", () => {
    it("should open the final step from the draft notice with «Activar ahora»", async () => {
      const data = fixture();
      render(data.node, { wrapper: Providers });
      await waitFor(() => expect(screen.getByRole("button", { name: "Revisar y activar" })).toBeEnabled());
      fireEvent.click(screen.getByRole("button", { name: "Revisar y activar" }));
      expect(screen.getByRole("navigation", { name: "Paso 4 de 4" })).toBeInTheDocument();
      await confirm();
      fireEvent.click(screen.getByRole("button", { name: "Activar ahora" }));
      await waitFor(() => expect(data.client.activatePolicy).toHaveBeenCalledOnce());
      expect(data.client.updatePolicy).not.toHaveBeenCalled();
    });

    it("should open the final step from a return link", async () => {
      const data = fixture();
      render(<AdmissionPolicyContainer initialState={data.state} client={data.client} reviewClient={data.reviewClient} entryStep="review" />, { wrapper: Providers });
      expect(screen.getByRole("navigation", { name: "Paso 4 de 4" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Activar ahora" })).toBeDisabled();
    });

    it("should not offer to publish while a platform block is known, and recheck without asking for another decision", async () => {
      const data = fixture();
      render(<AdmissionPolicyContainer initialState={data.state} client={data.client} reviewClient={data.reviewClient} initialPreflight={{ prepared: false, reasons: ["preflight_recovery_locked"], impact: { unknownCommercialMemberCount: 0, privilegedCommercialMemberCount: 0 } }} />, { wrapper: Providers });
      const notice = screen.getByRole("group", { name: "Tenés reglas guardadas sin publicar" });
      expect(notice).toHaveTextContent("Por ahora no se pueden activar: depende del equipo de TuTribu.");
      expect(screen.queryByRole("button", { name: "Revisar y activar" })).not.toBeInTheDocument();
      expect(screen.getByRole("group", { name: "Depende del equipo de TuTribu" })).toHaveTextContent("Código de diagnóstico: preflight_recovery_locked");
      await waitFor(() => expect(screen.getByRole("button", { name: "Volver a comprobar" })).toBeEnabled());
      fireEvent.click(screen.getByRole("button", { name: "Volver a comprobar" }));
      await waitFor(() => expect(screen.getByText("Volvimos a comprobar y ya no hay bloqueos. Podés activar las admisiones.")).toBeInTheDocument());
      expect(data.client.readPolicy).toHaveBeenCalledOnce();
      expect(data.client.readPreflight).toHaveBeenCalledOnce();
      expect(data.client.updatePolicy).not.toHaveBeenCalled();
      expect(data.client.activatePolicy).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Revisar y activar" })).toBeInTheDocument();
    });
  });
});
