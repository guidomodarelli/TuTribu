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
import { ADMISSION_POLICY_ACTIVATION_REQUIREMENT_COPY, ADMISSION_POLICY_BROWSER_COPY, ADMISSION_POLICY_DESTINATION_COPY } from "@/src/modules/academy-admissions/constants/admission-policy-browser";

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
    readPreflight: vi.fn<AdmissionPolicyBrowserClient["readPreflight"]>(async () => ({ status: "ready", value: { prepared: true, reasons: [] } })),
    operation: vi.fn<AdmissionPolicyBrowserClient["operation"]>(async () => ({ status: "failed", code: "resource_unavailable", message: "La operación no está disponible.", uncertain: false })),
    initializePolicy: vi.fn<AdmissionPolicyBrowserClient["initializePolicy"]>(async (_slug, input) => mutation(input.operationId, 1)),
    updatePolicy: vi.fn<AdmissionPolicyBrowserClient["updatePolicy"]>(async (_slug, input) => mutation(input.operationId, input.expectedVersion + 1, activatedControl)),
    activatePolicy: vi.fn<AdmissionPolicyBrowserClient["activatePolicy"]>(async (_slug, input) => mutation(input.operationId, input.expectedVersion + 1, true)),
    pausePolicy: vi.fn<AdmissionPolicyBrowserClient["pausePolicy"]>(async (_slug, input) => mutation(input.operationId, input.expectedVersion + 1, true)),
  };
  return { policy, state, client, node: <AdmissionPolicyContainer initialState={state} client={client} /> };
}

/** A denied write whose original was not registered: the browser keeps no intent and shows the rules requirements instead. */
const ineligible = { status: "failed" as const, code: "admission_ineligible" as const, message: "Falta un requisito actual para resolver el ingreso. Consultá el estado de la solicitud.", uncertain: false };
/** A write whose result is unknown: the original intent stays stored for its recovery. */
const unconfirmed = { status: "failed" as const, code: "dependency_unavailable" as const, message: "No pudimos confirmar el resultado.", uncertain: true };
/** @param policy - Current state. @param requirements - Requirements the read lists. @returns The same state as read with those requirements, before evaluating the preparation. */
function withRequirements(policy: AdmissionPolicyStateDto, requirements: AdmissionPolicyStateDto["preparation"]["requirements"]): AdmissionPolicyStateDto {
  return { ...policy, preparation: { state: "not_evaluated", requirements } };
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
    await act(async () => { preflight.resolve({ status: "ready", value: { prepared: true, reasons: [] } }); });
    await waitFor(() => expect(screen.getByText("Activando las admisiones…")).toBeInTheDocument());
    const activationInput = data.client.activatePolicy.mock.calls[0][1];
    expect(activationInput.expectedVersion).toBe(2);
    await act(async () => { activation.resolve(mutation(activationInput.operationId, 3, true)); });
    await waitFor(() => expect(screen.getByRole("heading", { name: "Admisiones abiertas" })).toBeInTheDocument());
    expect(screen.getByText("Listo: las admisiones quedaron activadas y abiertas. Ya se pueden recibir solicitudes.")).toHaveAttribute("role", "status");
    expect(readAdmissionPolicyIntent(viewerId, slug)).toBeNull();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("should check the applicant phone requirement by default on a new configuration and save it", async () => {
    const data = fixture("not_configured");
    render(data.node, { wrapper: Providers });
    await waitFor(() => expect(screen.getByRole("button", { name: "Continuar" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(screen.getByRole("checkbox", { name: "Exigir el teléfono del solicitante" })).toBeChecked();
    await goToReview();
    await confirm();
    fireEvent.click(screen.getByRole("button", { name: "Guardar y activar admisiones" }));
    await waitFor(() => expect(data.client.updatePolicy).toHaveBeenCalledOnce());
    expect(data.client.updatePolicy.mock.calls[0][1]).toMatchObject({ requiresWhatsappNumber: true });
  });

  it("should keep the applicant phone optional when a saved configuration chose it", async () => {
    const data = fixture("draft");
    render(data.node, { wrapper: Providers });
    await waitFor(() => expect(screen.getByRole("button", { name: "Continuar" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(screen.getByRole("checkbox", { name: "Exigir el teléfono del solicitante" })).not.toBeChecked();
  });

  it("should stop before activating when requirements are missing, explain them and keep every choice", async () => {
    const data = fixture();
    data.client.readPreflight.mockResolvedValueOnce({ status: "ready", value: { prepared: false, reasons: ["preflight_evaluator_disabled"] } });
    render(data.node, { wrapper: Providers });
    expect(screen.getByRole("group", { name: "Tenés reglas guardadas sin publicar" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Continuar" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Comprobar el contacto con un código" }));
    await goToReview(); await confirm();
    fireEvent.click(screen.getByRole("button", { name: "Guardar y activar admisiones" }));
    const block = await screen.findByRole("region", { name: "Lo que falta resolver" });
    expect(block).toHaveTextContent("Todavía falta un requisito para activar las admisiones.");
    expect(block).toHaveTextContent("Las admisiones de la academia están cerradas. Encendé «Admisiones abiertas» en Gestionar academia y volvé a activar estas reglas.");
    expect(within(block).getByRole("link", { name: "Ir a Gestionar academia" })).toHaveAttribute("href", expect.stringMatching(/\/academia\/gestionar$/));
    expect(block).not.toHaveTextContent("Depende del equipo de TuTribu");
    expect(block).not.toHaveTextContent("Código de diagnóstico");
    expect(screen.getByRole("group", { name: "Tenés reglas guardadas sin publicar" })).not.toHaveTextContent("depende del equipo de TuTribu");
    expect(block).toHaveTextContent("Tus reglas quedaron guardadas como borrador.");
    expect(data.client.updatePolicy.mock.calls[0][1]).toMatchObject({ expectedVersion: 3, requiresAdditionalVerification: true });
    // The server binds the messaging selection; the saved rules never carry a connection reference.
    expect(data.client.updatePolicy.mock.calls[0][1]).not.toHaveProperty("messagingConnectionId");
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

  it("should stop on the platform block, not on an uncertain write, when the first save lacks the hosting security", async () => {
    const data = fixture("not_configured");
    data.client.initializePolicy.mockResolvedValueOnce({ status: "failed", code: "admission_ineligible", message: "Falta un requisito actual para resolver el ingreso.", uncertain: false });
    data.client.readPolicy.mockResolvedValueOnce({ status: "ready", value: { ...data.policy, preparation: { state: "not_evaluated", requirements: ["admission_security_unconfigured", "policy_unavailable"] } } });
    render(data.node, { wrapper: Providers });
    await goToReview(); await confirm();
    fireEvent.click(screen.getByRole("button", { name: "Guardar y activar admisiones" }));
    const block = await screen.findByRole("region", { name: "Lo que falta resolver" });
    expect(block).toHaveTextContent("Todavía falta un requisito para guardar las reglas.");
    const platform = within(block).getByRole("group", { name: "Depende del equipo de TuTribu" });
    expect(platform).toHaveTextContent("Código de diagnóstico: admission_security_unconfigured");
    expect(platform).toHaveTextContent("Esto no es algo que puedas cambiar desde tu academia. Mientras tanto no se guarda nada: lo que elijas queda solo en esta pantalla y se pierde si salís.");
    expect(platform).not.toHaveTextContent("quedó guardado como borrador");
    expect(block).toHaveTextContent("Lo que elegiste sigue en esta pantalla.");
    expect(screen.getByRole("region", { name: "Estado actual" })).toHaveTextContent("Todavía no hay reglas de admisión y por ahora no se pueden guardar: depende del equipo de TuTribu.");
    expect(screen.getByRole("button", { name: "Guardar y activar admisiones" })).toBeDisabled();
    expect(screen.queryByText(/consultá el resultado de la operación anterior/)).not.toBeInTheDocument();
    expect(readAdmissionPolicyIntent(viewerId, slug)).toBeNull();
    expect(data.client.updatePolicy).not.toHaveBeenCalled();
    expect(data.client.activatePolicy).not.toHaveBeenCalled();
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

  it("should explain that codes need a prepared channel when saving active rules is denied, keeping the saved rules", async () => {
    const data = fixture("active");
    data.client.updatePolicy.mockResolvedValueOnce({ status: "failed", code: "admission_ineligible", message: "Falta un requisito actual para resolver el ingreso.", uncertain: false });
    render(data.node, { wrapper: Providers });
    await waitFor(() => expect(screen.getByRole("button", { name: "Editar reglas" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Editar reglas" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Continuar" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Comprobar el contacto con un código" }));
    await goToReview(); await confirm();
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => expect(screen.getByText(ADMISSION_POLICY_BROWSER_COPY.saveIneligible)).toBeInTheDocument());
    expect(screen.getByText(ADMISSION_POLICY_BROWSER_COPY.saveBlockedNote)).toBeInTheDocument();
    expect(screen.getByText(ADMISSION_POLICY_ACTIVATION_REQUIREMENT_COPY.verification_unavailable)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: ADMISSION_POLICY_DESTINATION_COPY.connection })).toHaveAttribute("href", `/${slug}/academia/admissions/messaging/connections`);
    expect(screen.queryByText("Falta un requisito actual para resolver el ingreso.")).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Revisé las reglas/ })).not.toBeChecked();
    expect(data.client.updatePolicy).toHaveBeenCalledOnce();
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

  describe("platform security", () => {
    it("should explain a pause the platform security blocks while admissions stay open, without a retry", async () => {
      const data = fixture("active");
      data.client.pausePolicy.mockResolvedValueOnce(ineligible);
      data.client.readPolicy.mockResolvedValue({ status: "ready", value: withRequirements(data.policy, ["admission_security_unconfigured"]) });
      render(data.node, { wrapper: Providers });
      await waitFor(() => expect(screen.getByRole("button", { name: "Pausar admisiones" })).toBeEnabled());
      fireEvent.click(screen.getByRole("button", { name: "Pausar admisiones" }));
      fireEvent.change(screen.getByLabelText("Motivo de la pausa"), { target: { value: "Cierre de cohorte" } });
      fireEvent.click(screen.getByRole("button", { name: "Confirmar pausa" }));
      const block = await screen.findByRole("region", { name: "Lo que falta resolver" });
      expect(block).toHaveTextContent("Todavía falta un requisito para pausar las admisiones.");
      expect(block).toHaveTextContent("Las admisiones siguen abiertas. Cuando se resuelva, volvé a tocar «Confirmar pausa».");
      const platform = within(block).getByRole("group", { name: "Depende del equipo de TuTribu" });
      expect(platform).toHaveTextContent("Las admisiones siguen abiertas: se siguen recibiendo solicitudes.");
      expect(platform).toHaveTextContent("Código de diagnóstico: admission_security_unconfigured");
      expect(screen.queryByText(/Falta un requisito actual para resolver el ingreso/)).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Reintentar" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Confirmar pausa" })).toBeDisabled();
      expect(screen.getByLabelText("Motivo de la pausa")).toHaveValue("Cierre de cohorte");
      expect(screen.getByRole("heading", { name: "Admisiones abiertas" })).toBeInTheDocument();
      expect(readAdmissionPolicyIntent(viewerId, slug)).toBeNull();
      expect(data.client.pausePolicy).toHaveBeenCalledOnce();
    });

    it("should warn before the steps when the rules read names the platform security, keep it while the draft changes and never send a write", async () => {
      const data = fixture("not_configured");
      render(<AdmissionPolicyContainer initialState={{ ...data.state, policy: withRequirements(data.policy, ["admission_security_unconfigured", "policy_unavailable"]) }} client={data.client} />, { wrapper: Providers });
      expect(screen.getByRole("region", { name: "Estado actual" })).toHaveTextContent("Todavía no hay reglas de admisión y por ahora no se pueden guardar: depende del equipo de TuTribu. Podés recorrer los pasos, pero lo que elijas no se guarda.");
      const block = screen.getByRole("region", { name: "Lo que falta resolver" });
      expect(block).toHaveTextContent("Todavía falta un requisito para guardar las reglas.");
      const platform = within(block).getByRole("group", { name: "Depende del equipo de TuTribu" });
      expect(platform).toHaveTextContent("Mientras tanto no se guarda nada: lo que elijas queda solo en esta pantalla y se pierde si salís.");
      expect(platform).toHaveTextContent("Código de diagnóstico: admission_security_unconfigured");
      expect(platform).not.toHaveTextContent("borrador");
      await waitFor(() => expect(screen.getByRole("button", { name: "Continuar" })).toBeEnabled());
      fireEvent.click(screen.getByRole("radio", { name: "Lista de habilitados" }));
      expect(screen.getByRole("group", { name: "Depende del equipo de TuTribu" })).toHaveTextContent("admission_security_unconfigured");
      await goToReview(); await confirm();
      const final = screen.getByRole("button", { name: "Guardar y activar admisiones" });
      expect(final).toBeDisabled();
      expect(screen.getByText("Por ahora no se pueden guardar las reglas: depende del equipo de TuTribu.")).toBeInTheDocument();
      fireEvent.click(final);
      expect(data.client.initializePolicy).not.toHaveBeenCalled();
      expect(data.client.updatePolicy).not.toHaveBeenCalled();
    });

    it("should keep paused admissions closed to a resume while the platform recovery lock is listed", async () => {
      const data = fixture("paused");
      render(<AdmissionPolicyContainer initialState={{ ...data.state, policy: withRequirements(data.policy, ["admission_recovery_locked"]) }} client={data.client} />, { wrapper: Providers });
      const block = screen.getByRole("region", { name: "Lo que falta resolver" });
      expect(block).toHaveTextContent("Todavía falta un requisito para reanudar las admisiones.");
      const platform = within(block).getByRole("group", { name: "Depende del equipo de TuTribu" });
      expect(platform).toHaveTextContent("Las admisiones siguen pausadas.");
      expect(platform).toHaveTextContent("Código de diagnóstico: admission_recovery_locked");
      expect(screen.getByRole("region", { name: "Estado actual" })).toHaveTextContent("Las admisiones siguen pausadas y por ahora no se pueden reanudar ni cambiar sus reglas: depende del equipo de TuTribu.");
      await waitFor(() => expect(within(platform).getByRole("button", { name: "Volver a comprobar" })).toBeEnabled());
      expect(screen.getByRole("button", { name: "Reanudar admisiones" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Editar reglas" })).toBeDisabled();
      // Once the team lifts the lock, rechecking reopens the resume without another decision.
      fireEvent.click(within(platform).getByRole("button", { name: "Volver a comprobar" }));
      await waitFor(() => expect(screen.getByText("Volvimos a comprobar y ya no hay bloqueos. Podés reanudar las admisiones.")).toHaveAttribute("role", "status"));
      expect(screen.queryByRole("region", { name: "Lo que falta resolver" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Reanudar admisiones" })).toBeEnabled();
      expect(data.client.readPreflight).not.toHaveBeenCalled();
      expect(data.client.updatePolicy).not.toHaveBeenCalled();
    });

    it("should say the current rules did not change when saving active rules lacks the platform security", async () => {
      const data = fixture("active");
      data.client.updatePolicy.mockResolvedValueOnce(ineligible);
      data.client.readPolicy.mockResolvedValue({ status: "ready", value: withRequirements(data.policy, ["admission_security_unconfigured"]) });
      render(data.node, { wrapper: Providers });
      await waitFor(() => expect(screen.getByRole("button", { name: "Editar reglas" })).toBeEnabled());
      fireEvent.click(screen.getByRole("button", { name: "Editar reglas" }));
      fireEvent.click(screen.getByRole("radio", { name: "Lista de habilitados" }));
      await goToReview(); await confirm();
      fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
      const block = await screen.findByRole("region", { name: "Lo que falta resolver" });
      expect(block).toHaveTextContent("Todavía falta un requisito para guardar estos cambios.");
      expect(within(block).getByRole("group", { name: "Depende del equipo de TuTribu" })).toHaveTextContent("Esto no es algo que puedas cambiar desde tu academia. Las reglas vigentes no cambiaron.");
      expect(block).not.toHaveTextContent("borrador");
      expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeDisabled();
    });

    it("should say admissions stay paused when a resume lacks the platform security", async () => {
      const data = fixture("paused");
      data.client.updatePolicy.mockResolvedValueOnce(ineligible);
      data.client.readPolicy.mockResolvedValue({ status: "ready", value: withRequirements(data.policy, ["admission_security_unconfigured"]) });
      render(data.node, { wrapper: Providers });
      await waitFor(() => expect(screen.getByRole("button", { name: "Reanudar admisiones" })).toBeEnabled());
      fireEvent.click(screen.getByRole("button", { name: "Reanudar admisiones" }));
      const block = await screen.findByRole("region", { name: "Lo que falta resolver" });
      expect(block).toHaveTextContent("Todavía falta un requisito para reanudar las admisiones.");
      expect(within(block).getByRole("group", { name: "Depende del equipo de TuTribu" })).toHaveTextContent("Esto no es algo que puedas cambiar desde tu academia. Las admisiones siguen pausadas.");
      expect(screen.getByRole("heading", { name: "Admisiones pausadas" })).toBeInTheDocument();
    });

    it("should show the platform block on «Volver a comprobar» after a save the recovery lock denied, naming the cause once", async () => {
      const data = fixture("not_configured");
      data.client.initializePolicy.mockResolvedValueOnce(ineligible);
      data.client.readPolicy.mockResolvedValue({ status: "ready", value: withRequirements(data.policy, ["admission_recovery_locked", "policy_unavailable"]) });
      data.client.readPreflight.mockResolvedValue({ status: "ready", value: { prepared: false, reasons: ["preflight_policy_unavailable", "preflight_recovery_locked"] } });
      render(data.node, { wrapper: Providers });
      await goToReview(); await confirm();
      fireEvent.click(screen.getByRole("button", { name: "Guardar y activar admisiones" }));
      const block = await screen.findByRole("region", { name: "Lo que falta resolver" });
      expect(within(block).getByRole("group", { name: "Depende del equipo de TuTribu" })).toHaveTextContent("Código de diagnóstico: admission_recovery_locked");
      fireEvent.click(within(block).getByRole("button", { name: "Volver a comprobar" }));
      await waitFor(() => expect(screen.getByText("Volvimos a comprobar: todavía falta resolver lo que se indica.")).toBeInTheDocument());
      const rechecked = screen.getByRole("region", { name: "Lo que falta resolver" });
      const platform = within(rechecked).getByRole("group", { name: "Depende del equipo de TuTribu" });
      expect(platform).toHaveTextContent("La plataforma pausó las admisiones mientras recupera un servicio.");
      expect(platform).toHaveTextContent("Código de diagnóstico: admission_recovery_locked");
      expect(platform).not.toHaveTextContent("preflight_recovery_locked");
      expect(within(platform).getAllByRole("listitem")).toHaveLength(1);
      expect(rechecked).toHaveTextContent("Todavía falta un requisito para guardar las reglas.");
      expect(data.client.readPreflight).toHaveBeenCalledOnce();
      expect(data.client.initializePolicy).toHaveBeenCalledOnce();
    });

    it("should show the failed reread after a denied save instead of an empty requirements block", async () => {
      const data = fixture("not_configured");
      data.client.initializePolicy.mockResolvedValueOnce(ineligible);
      data.client.readPolicy.mockResolvedValueOnce({ status: "failed", code: "dependency_unavailable", message: "No pudimos consultar la configuración actual.", uncertain: false });
      render(data.node, { wrapper: Providers });
      await goToReview(); await confirm();
      fireEvent.click(screen.getByRole("button", { name: "Guardar y activar admisiones" }));
      await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Todavía falta un requisito para guardar las reglas. No pudimos consultar la configuración actual."));
      expect(screen.queryByRole("region", { name: "Lo que falta resolver" })).not.toBeInTheDocument();
      expect(screen.queryByText(/Falta un requisito actual para resolver el ingreso/)).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Reintentar" })).not.toBeInTheDocument();
      await waitFor(() => expect(screen.getByRole("button", { name: "Consultar configuración actual" })).toBeEnabled());
      expect(readAdmissionPolicyIntent(viewerId, slug)).toBeNull();
    });

    it.each([
      { scenario: "a pause", lifecycle: "active" as const, method: "pausePolicy" as const, message: "Todavía falta un requisito para pausar las admisiones.", consequence: "Las admisiones siguen abiertas: se siguen recibiendo solicitudes." },
      { scenario: "a resume", lifecycle: "paused" as const, method: "updatePolicy" as const, message: "Todavía falta un requisito para reanudar las admisiones.", consequence: "Las admisiones siguen pausadas." },
      { scenario: "a change to active rules", lifecycle: "active" as const, method: "updatePolicy" as const, message: "Todavía falta un requisito para guardar estos cambios.", consequence: "Las reglas vigentes no cambiaron." },
    ])("should explain a retried original of $scenario with its own action, never «Guardar y activar admisiones»", async ({ lifecycle, method, message, consequence }) => {
      const data = fixture(lifecycle);
      data.client[method].mockResolvedValueOnce(unconfirmed).mockResolvedValueOnce(ineligible);
      data.client.readPolicy.mockResolvedValueOnce({ status: "ready", value: data.policy }).mockResolvedValue({ status: "ready", value: withRequirements(data.policy, ["admission_security_unconfigured"]) });
      render(data.node, { wrapper: Providers });
      if (method === "pausePolicy") {
        await waitFor(() => expect(screen.getByRole("button", { name: "Pausar admisiones" })).toBeEnabled());
        fireEvent.click(screen.getByRole("button", { name: "Pausar admisiones" }));
        fireEvent.change(screen.getByLabelText("Motivo de la pausa"), { target: { value: "Cierre de cohorte" } });
        fireEvent.click(screen.getByRole("button", { name: "Confirmar pausa" }));
      } else if (lifecycle === "paused") {
        await waitFor(() => expect(screen.getByRole("button", { name: "Reanudar admisiones" })).toBeEnabled());
        fireEvent.click(screen.getByRole("button", { name: "Reanudar admisiones" }));
      } else {
        await waitFor(() => expect(screen.getByRole("button", { name: "Editar reglas" })).toBeEnabled());
        fireEvent.click(screen.getByRole("button", { name: "Editar reglas" }));
        fireEvent.click(screen.getByRole("radio", { name: "Lista de habilitados" }));
        await goToReview(); await confirm();
        fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
      }
      await waitFor(() => expect(screen.getByRole("button", { name: "Consultar operación original" })).toBeEnabled());
      const original = readAdmissionPolicyIntent(viewerId, slug);
      fireEvent.click(screen.getByRole("button", { name: "Consultar operación original" }));
      fireEvent.click(await screen.findByRole("checkbox", { name: /Confirmo reintentar/ }));
      fireEvent.click(screen.getByRole("button", { name: "Reintentar operación original" }));
      const block = await screen.findByRole("region", { name: "Lo que falta resolver" });
      expect(block).toHaveTextContent(message);
      expect(within(block).getByRole("group", { name: "Depende del equipo de TuTribu" })).toHaveTextContent(consequence);
      expect(block).not.toHaveTextContent("Guardar y activar admisiones");
      expect(data.client[method]).toHaveBeenCalledTimes(2);
      expect(data.client[method].mock.calls[1][1]).toEqual(original!.input);
      expect(readAdmissionPolicyIntent(viewerId, slug)).toBeNull();
    });
  });

  describe("memberships blocked by payment", () => {
    it("should tell the leader before activating how many memberships blocked by payment become free members, without an extra step", async () => {
      const data = fixture();
      const state = { ...data.state, policy: { ...data.policy, impact: { ...data.policy.impact, freeConversionMemberCount: 2 } } };
      render(<AdmissionPolicyContainer initialState={state} client={data.client} />, { wrapper: Providers });
      await goToReview();
      expect(screen.getByRole("navigation", { name: "Paso 4 de 4" })).toBeInTheDocument();
      expect(screen.getByText("Al activar, 2 membresías bloqueadas por pago pasan a ser integrantes gratuitas: entran a la tribu sin acceso al contenido pago de la academia y las que eran guardianas pierden ese rol. Después podés gestionarlas desde Integrantes.")).toBeInTheDocument();
      await confirm();
      fireEvent.click(screen.getByRole("button", { name: "Guardar y activar admisiones" }));
      await waitFor(() => expect(data.client.activatePolicy).toHaveBeenCalledOnce());
    });

    it("should not mention the conversion when no membership converts", async () => {
      const data = fixture();
      const state = { ...data.state, policy: { ...data.policy, impact: { ...data.policy.impact, freeConversionMemberCount: 0 } } };
      render(<AdmissionPolicyContainer initialState={state} client={data.client} />, { wrapper: Providers });
      await goToReview();
      expect(screen.queryByText(/membresías? bloqueadas? por pago/)).not.toBeInTheDocument();
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

    it("should name a saved draft's evaluated requirement and where to resolve it as soon as the rules open", async () => {
      const data = fixture();
      const state = { ...data.state, policy: { ...data.policy, preparation: { state: "evaluated" as const, requirements: ["verification_unavailable" as const] } } };
      render(<AdmissionPolicyContainer initialState={state} client={data.client} />, { wrapper: Providers });
      const block = screen.getByRole("region", { name: "Lo que falta resolver" });
      expect(block).toHaveTextContent("Todavía falta un requisito para activar las admisiones.");
      expect(block).toHaveTextContent("El canal para comprobar el contacto todavía no está preparado.");
      expect(screen.getByRole("link", { name: "Ir a Conexión" })).toHaveAttribute("href", `/${slug}/academia/admissions/messaging/connections?return=policy-review`);
      // The mount viewer check settles without dropping the server-read requirement.
      await waitFor(() => expect(screen.getByRole("button", { name: "Revisar y activar" })).toBeEnabled());
      expect(screen.getByRole("region", { name: "Lo que falta resolver" })).toHaveTextContent("El canal para comprobar el contacto todavía no está preparado.");
      expect(data.client.activatePolicy).not.toHaveBeenCalled();
    });

    it("should name a missing platform security once even when the preflight reads it as a recovery lock, and offer no publication", async () => {
      const data = fixture();
      render(<AdmissionPolicyContainer initialState={{ ...data.state, policy: withRequirements(data.policy, ["admission_security_unconfigured"]) }} client={data.client} initialPreflight={{ prepared: false, reasons: ["preflight_recovery_locked"] }} />, { wrapper: Providers });
      const platform = screen.getByRole("group", { name: "Depende del equipo de TuTribu" });
      expect(platform).toHaveTextContent("Código de diagnóstico: admission_security_unconfigured");
      expect(platform).not.toHaveTextContent("preflight_recovery_locked");
      expect(platform).toHaveTextContent("Lo que ya elegiste quedó guardado como borrador.");
      const notice = screen.getByRole("group", { name: "Tenés reglas guardadas sin publicar" });
      expect(notice).toHaveTextContent("Tus reglas siguen guardadas como borrador, pero por ahora no se pueden cambiar ni activar: depende del equipo de TuTribu.");
      await waitFor(() => expect(within(platform).getByRole("button", { name: "Volver a comprobar" })).toBeEnabled());
      expect(screen.queryByRole("button", { name: "Revisar y activar" })).not.toBeInTheDocument();
    });

    it("should open the final step from a return link", async () => {
      const data = fixture();
      render(<AdmissionPolicyContainer initialState={data.state} client={data.client} entryStep="review" />, { wrapper: Providers });
      expect(screen.getByRole("navigation", { name: "Paso 4 de 4" })).toBeInTheDocument();
      // Once the mount viewer check settles, the step waits for the leader's confirmation before activating.
      await waitFor(() => expect(screen.getByRole("checkbox", { name: /Revisé las reglas/ })).toBeEnabled());
      expect(screen.getByRole("button", { name: "Activar ahora" })).toBeDisabled();
    });

    it("should not offer to publish while a platform block is known, and recheck without asking for another decision", async () => {
      const data = fixture();
      render(<AdmissionPolicyContainer initialState={data.state} client={data.client} initialPreflight={{ prepared: false, reasons: ["preflight_recovery_locked"] }} />, { wrapper: Providers });
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
