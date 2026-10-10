/** Exercises the actual route container and shared UI with own transport ports; ordinary success uses incremental state, not route refresh. @module academy-admission-contact-container-tests */
import { randomUUID } from "node:crypto";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdmissionContainer } from "@/app/(admission)/admissions/[slug]/admission-container";
import type { AdmissionPageState } from "@/src/modules/academy-admissions/application/results/admission-page-state";
import type { AdmissionBrowserClient } from "@/src/modules/academy-admissions/application/ports/admission-browser-client";
import type { AdmissionContactBrowserClient } from "@/src/modules/academy-admissions/application/ports/admission-contact-browser-client";
import type { AdmissionRequestDto } from "@/src/modules/academy-admissions/application/results/admission-flow-result-schemas";
import { ADMISSION_LIMIT } from "@/src/modules/academy-admissions/constants/admission-limits";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { AppUIProvider } from "@/components/providers/app-providers/app-ui-provider";
import { writeAdmissionContactIntent, readAdmissionContactIntent } from "@/lib/academy-admissions/admission-contact-intent";
import { writeAdmissionDraft } from "@/lib/academy-admissions/admission-draft";

afterEach(() => window.sessionStorage.clear());

/** Own ports emulate confirmed application results; beez-ui, browser state and validation remain real. */
function containerFixture() {
  const viewerId = randomUUID(), now = Date.now(), proofId = randomUUID(), challengeId = randomUUID();
  let request: AdmissionRequestDto | null = null;
  const initialState: Extract<AdmissionPageState, { kind: "ready" }> = { kind: "ready", viewerId, renderedAt: new Date(now).toISOString(), request: null, overview: { tribe: { slug: "synthetic-academy", name: "Academia sintética", accessModel: "academy" }, policy: { mode: "manual_review", contactType: "email", requiresAdditionalVerification: true, isOpen: true, version: 1 }, state: "verification_required", nextAction: "verify_contact", safeMessage: "Comprobá tu contacto.", verification: { channel: "email", allowedCountries: [] } } };
  const client: AdmissionBrowserClient = {
    viewer: vi.fn<AdmissionBrowserClient["viewer"]>(async () => ({ status: "ready", value: { id: viewerId } })),
    overview: vi.fn<AdmissionBrowserClient["overview"]>(async () => ({ status: "ready", value: request ? { ...initialState.overview, state: "pending", nextAction: "view_request", request } : initialState.overview })),
    own: vi.fn<AdmissionBrowserClient["own"]>(async () => ({ status: "ready", value: request })),
    operation: vi.fn<AdmissionBrowserClient["operation"]>(async () => ({ status: "failed", code: "resource_unavailable", message: "La operación no está disponible.", uncertain: false })),
    submit: vi.fn<AdmissionBrowserClient["submit"]>(async (_slug, input) => { request = { id: randomUUID(), status: "pending", version: 2, submittedAt: new Date(now).toISOString(), expiresAt: new Date(now + 2_592_000_000).toISOString(), source: "common", needsVerification: false, eligibilityReasons: [], contact: { type: "email", maskedValue: "a•••@example.test", evidenceKind: "local" } }; return { status: "ready", value: { operationId: input.operationId, outcome: "pending", request: { ...request, status: "pending" as const }, safeMessage: "La solicitud quedó pendiente.", nextHref: "/admissions/requests/synthetic" } }; }),
    cancel: vi.fn<AdmissionBrowserClient["cancel"]>(),
  };
  const contact: AdmissionContactBrowserClient = {
    current: vi.fn<AdmissionContactBrowserClient['current']>(async () => ({ status: 'ready', value: { current: null } })),
    issue: vi.fn<AdmissionContactBrowserClient["issue"]>(async (_slug, input) => ({ status: "ready", value: { state: "completed", operationId: input.operationId, replayed: false, result: { purpose: "admission", challengeId, channel: "email", maskedDestination: "a•••@example.test", expiresAt: new Date(now + 600_000).toISOString(), resendAllowedAt: new Date(now + 60_000).toISOString(), deliveryState: "queued" } } })),
    verify: vi.fn<AdmissionContactBrowserClient["verify"]>(async (_slug, _challenge, input) => ({ status: "ready", value: { state: "completed", operationId: input.operationId, replayed: false, result: { purpose: "admission", result: "verified", proofId, applyBefore: new Date(now + 900_000).toISOString() } } })),
    resend: vi.fn<AdmissionContactBrowserClient["resend"]>(), apply: vi.fn<AdmissionContactBrowserClient["apply"]>(), delivery: vi.fn<AdmissionContactBrowserClient["delivery"]>(), operation: vi.fn<AdmissionContactBrowserClient["operation"]>(),
  };
  return { initialState, client, contact, proofId, viewerId, setRequest: (value: AdmissionRequestDto) => { request = value; } };
}

describe("applicant contact step in the route", () => {
  it("should expose readonly recovery and block new contact fields when a stored issuance cannot be reconciled", async () => {
    const fixture = containerFixture(), issuedOperationId = randomUUID(), user = userEvent.setup();
    writeAdmissionContactIntent({ viewerId: fixture.viewerId, slug: fixture.initialState.overview.tribe.slug, requestId: null, issuedOperationId, verifiedOperationId: null, pending: null });
    vi.mocked(fixture.contact.operation).mockResolvedValueOnce({ status: "failed", code: "dependency_unavailable", message: "No pudimos consultar el código.", uncertain: false });
    vi.mocked(fixture.contact.operation).mockResolvedValueOnce({ status: "ready", value: { type: "issue_contact_challenge", state: "completed", operationId: issuedOperationId, replayed: true, result: { purpose: "admission", challengeId: randomUUID(), channel: "email", maskedDestination: "a•••@example.test", expiresAt: new Date(Date.now() + ADMISSION_LIMIT.verificationCodeValidityMs).toISOString(), resendAllowedAt: new Date(Date.now() + ADMISSION_LIMIT.verificationResendWaitMs).toISOString(), deliveryState: "queued" } } });
    render(<AdmissionContainer initialState={fixture.initialState} client={fixture.client} contactClient={fixture.contact} />);
    const recover = await screen.findByRole("button", { name: "Consultar operación del código" });
    await waitFor(() => expect(recover).toBeEnabled());
    expect(screen.getByRole("checkbox", { name: /Confirmo el contacto y el envío del código/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Enviar código de ingreso" })).toBeDisabled();
    expect(fixture.contact.issue).not.toHaveBeenCalled();
    await user.click(recover);
    expect(await screen.findByLabelText("Código de ingreso")).toBeEnabled();
    expect(fixture.contact.operation).toHaveBeenCalledTimes(2);
    expect(fixture.contact.issue).not.toHaveBeenCalled();
    expect(fixture.client.submit).not.toHaveBeenCalled();
  });

  it("should start a new contact after an authorized retry of a canceled request without restoring its old checked proof", async () => {
    const fixture = containerFixture(), previousRequestId = randomUUID(), issuedOperationId = randomUUID(), verifiedOperationId = randomUUID(), previousChallengeId = randomUUID();
    fixture.initialState.overview.policy = { ...fixture.initialState.overview.policy!, contactType: "phone" };
    fixture.initialState.overview.verification = { channel: "sms", allowedCountries: ["AR"] };
    const canceled: AdmissionRequestDto = { id: previousRequestId, status: "cancelled", version: 2, source: "common", submittedAt: new Date(Date.now() - ADMISSION_LIMIT.submissionCadenceMs - 1).toISOString(), expiresAt: new Date(Date.now() + ADMISSION_LIMIT.pendingValidityMs).toISOString(), retryAllowedAt: new Date(Date.now() - 1).toISOString(), needsVerification: false, eligibilityReasons: [], contact: { type: "phone", maskedValue: "•••1234", evidenceKind: "local" } };
    const initialState = { ...fixture.initialState, request: canceled, overview: { ...fixture.initialState.overview, request: canceled } };
    writeAdmissionDraft({ viewerId: fixture.viewerId, slug: initialState.overview.tribe.slug, draft: { phone: "+5491155501234", country: "AR", message: "Conservo mi explicación." }, pending: null });
    const original = { viewerId: fixture.viewerId, slug: initialState.overview.tribe.slug, requestId: null, issuedOperationId, verifiedOperationId, pending: null };
    writeAdmissionContactIntent(original);
    vi.mocked(fixture.contact.operation).mockImplementation(async (_slug, operationId) => ({ status: "ready", value: operationId === issuedOperationId ? { type: "issue_contact_challenge", state: "completed", operationId, replayed: true, result: { purpose: "admission", challengeId: previousChallengeId, channel: "sms", maskedDestination: "•••1234", expiresAt: new Date(Date.now() + ADMISSION_LIMIT.verificationCodeValidityMs).toISOString(), resendAllowedAt: new Date(Date.now() - 1).toISOString(), deliveryState: "accepted" } } : { type: "verify_contact_challenge", state: "completed", operationId, replayed: true, result: { purpose: "admission", result: "verified", proofId: fixture.proofId, applyBefore: new Date(Date.now() + ADMISSION_LIMIT.verificationProofFreshnessMs).toISOString() } } }));
    render(<AdmissionContainer initialState={initialState} client={fixture.client} contactClient={fixture.contact} />);
    const phone = await screen.findByLabelText("Teléfono para este ingreso");
    await waitFor(() => expect(screen.getByRole("checkbox", { name: /Confirmo el contacto y el envío del código/i })).toBeEnabled());
    expect(phone).toBeEnabled();
    expect(screen.queryByText("Código comprobado para este ingreso.")).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Confirmo el contacto y el envío del código/i })).not.toBeChecked();
    expect(fixture.contact.operation).not.toHaveBeenCalled();
    expect(fixture.contact.issue).not.toHaveBeenCalled();
    expect(fixture.client.submit).not.toHaveBeenCalled();
    expect(readAdmissionContactIntent(fixture.viewerId, initialState.overview.tribe.slug, null)).toEqual(original);
  });

  it("should show the current delivery reason persistently while code edits remain local and replace the old reason on an explicit read", async () => {
    const fixture = containerFixture(), user = userEvent.setup(), deliveryId = randomUUID();
    vi.mocked(fixture.contact.issue).mockImplementation(async (_slug, input) => ({ status: "ready", value: { state: "completed", operationId: input.operationId, replayed: false, result: { purpose: "admission", challengeId: randomUUID(), deliveryId, channel: "email", maskedDestination: "a•••@example.test", expiresAt: new Date(Date.now() + 600_000).toISOString(), resendAllowedAt: new Date(Date.now() + 60_000).toISOString(), deliveryState: "queued" } } }));
    vi.mocked(fixture.contact.delivery).mockResolvedValue({ status: "ready", value: { id: deliveryId, state: "queued", channel: "email", purpose: "admission", createdAt: fixture.initialState.renderedAt, safeReason: "usage_limit_reached" } });
    render(<AdmissionContainer initialState={fixture.initialState} client={fixture.client} contactClient={fixture.contact} />);
    await waitFor(() => expect(screen.getByRole("checkbox", { name: /Confirmo el contacto y el envío del código/i })).toBeEnabled());
    await user.click(screen.getByRole("checkbox", { name: /Confirmo el contacto y el envío del código/i }));
    await user.click(screen.getByRole("button", { name: "Enviar código de ingreso" }));
    expect(await screen.findByText("Se alcanzó el límite de nuevos envíos. Podés validar un código vigente o consultar tu solicitud.")).toBeVisible();
    await user.type(screen.getByLabelText("Código de ingreso"), "123456");
    expect(screen.getByText("Se alcanzó el límite de nuevos envíos. Podés validar un código vigente o consultar tu solicitud.")).toBeVisible();
    expect(fixture.contact.verify).not.toHaveBeenCalled();
    vi.mocked(fixture.contact.delivery).mockResolvedValue({ status: "ready", value: { id: deliveryId, state: "failed", channel: "email", purpose: "admission", createdAt: fixture.initialState.renderedAt, safeReason: "dependency_unavailable" } });
    await user.click(screen.getByRole("button", { name: "Consultar envío del código" }));
    expect(await screen.findByText("La mensajería no está disponible temporalmente. Podés consultar tu solicitud.")).toBeVisible();
    expect(screen.queryByText("Se alcanzó el límite de nuevos envíos. Podés validar un código vigente o consultar tu solicitud.")).not.toBeInTheDocument();
    expect(fixture.contact.issue).toHaveBeenCalledTimes(1);
    expect(fixture.contact.resend).not.toHaveBeenCalled();
    expect(fixture.client.submit).not.toHaveBeenCalled();
  });

  it("should disable contact consent until the current viewer and reference restoration are ready", async () => {
    const fixture = containerFixture();
    let finishViewer!: () => void;
    vi.mocked(fixture.client.viewer).mockImplementationOnce(() => new Promise((resolve) => { finishViewer = () => resolve({ status: "ready", value: { id: fixture.viewerId } }); }));
    render(<AdmissionContainer initialState={fixture.initialState} client={fixture.client} contactClient={fixture.contact} />);
    expect(screen.getByRole("checkbox", { name: /Confirmo el contacto y el envío del código/i })).toBeDisabled();
    await waitFor(() => expect(fixture.client.viewer).toHaveBeenCalledTimes(1));
    expect(fixture.contact.issue).not.toHaveBeenCalled();
    await act(async () => { finishViewer(); });
    await waitFor(() => expect(screen.getByRole("checkbox", { name: /Confirmo el contacto y el envío del código/i })).toBeEnabled());
    expect(screen.getByRole("checkbox", { name: /Confirmo el contacto y el envío del código/i })).not.toBeChecked();
  });

  it.each(["anonymous", "disabled"] as const)("should omit contact actions and requests for %s scope", async (scope) => {
    const fixture = containerFixture();
    const initialState = scope === "anonymous" ? { ...fixture.initialState, viewerId: null, overview: { ...fixture.initialState.overview, state: "sign_in_required" as const, nextAction: "sign_in" as const, verification: undefined } } : { ...fixture.initialState, overview: { ...fixture.initialState.overview, policy: { ...fixture.initialState.overview.policy!, requiresAdditionalVerification: false }, state: "available" as const, nextAction: "request_admission" as const, verification: undefined } };
    render(<AdmissionContainer initialState={initialState} client={fixture.client} contactClient={fixture.contact} />);
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Comprobar contacto para el ingreso" })).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Enviar código de ingreso" })).not.toBeInTheDocument();
    expect(fixture.contact.issue).not.toHaveBeenCalled();
    expect(fixture.contact.operation).not.toHaveBeenCalled();
  });

  it("should omit local contact actions when the own pending already has its required verification", async () => {
    const fixture = containerFixture(), submittedAt = new Date().toISOString();
    const pending: AdmissionRequestDto = { id: randomUUID(), status: "pending", version: 2, submittedAt, expiresAt: new Date(new Date(submittedAt).getTime() + ADMISSION_LIMIT.pendingValidityMs).toISOString(), source: "common", needsVerification: false, eligibilityReasons: [], contact: { type: "email", maskedValue: "a•••@example.test", evidenceKind: "local" } };
    fixture.setRequest(pending);
    const initialState = { ...fixture.initialState, request: pending, overview: { ...fixture.initialState.overview, state: "pending" as const, nextAction: "view_request" as const, request: pending } };
    render(<AdmissionContainer initialState={initialState} requestPage client={fixture.client} contactClient={fixture.contact} />);
    await waitFor(() => expect(screen.getByRole("checkbox", { name: /Confirmo que quiero cancelar esta solicitud/i })).toBeEnabled());
    expect(screen.queryByRole("heading", { name: "Comprobar contacto para el ingreso" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Enviar código de ingreso" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Aplicar prueba a esta solicitud" })).not.toBeInTheDocument();
    expect(fixture.contact.issue).not.toHaveBeenCalled();
    expect(fixture.contact.verify).not.toHaveBeenCalled();
    expect(fixture.contact.apply).not.toHaveBeenCalled();
    expect(fixture.client.submit).not.toHaveBeenCalled();
  });

  it("should omit local contact actions when the own pending deadline has passed even if its snapshot requested verification", async () => {
    const fixture = containerFixture();
    const pending: AdmissionRequestDto = { id: randomUUID(), status: "pending", version: 1, submittedAt: new Date(Date.now() - ADMISSION_LIMIT.pendingValidityMs - 1).toISOString(), expiresAt: new Date(Date.now() - 1).toISOString(), source: "common", needsVerification: true, eligibilityReasons: ["local_proof_required"] };
    fixture.setRequest(pending);
    const initialState = { ...fixture.initialState, request: pending, overview: { ...fixture.initialState.overview, state: "pending" as const, nextAction: "view_request" as const, request: pending } };
    render(<AdmissionContainer initialState={initialState} requestPage client={fixture.client} contactClient={fixture.contact} />);
    expect(await screen.findByText("El plazo de la solicitud venció.")).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Comprobar contacto para el ingreso" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Enviar código de ingreso" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Aplicar prueba a esta solicitud" })).not.toBeInTheDocument();
    expect(fixture.contact.issue).not.toHaveBeenCalled();
    expect(fixture.contact.verify).not.toHaveBeenCalled();
    expect(fixture.contact.apply).not.toHaveBeenCalled();
    expect(fixture.client.submit).not.toHaveBeenCalled();
  });

  it("should require and locally verify the code before presenting an initial request with its opaque proof", async () => {
    const fixture = containerFixture(), user = userEvent.setup();
    render(<AdmissionContainer initialState={fixture.initialState} client={fixture.client} contactClient={fixture.contact} />);
    await waitFor(() => expect(screen.getByRole("checkbox", { name: /Confirmo el contacto y el envío del código/i })).toBeEnabled());
    expect(fixture.contact.issue).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Solicitar ingreso" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: /Confirmo el contacto y el envío del código/i }));
    await user.click(screen.getByRole("button", { name: "Enviar código de ingreso" }));
    await user.type(await screen.findByLabelText("Código de ingreso"), "123456");
    await user.click(screen.getByRole("button", { name: "Comprobar código" }));
    expect(await screen.findByText("Código comprobado para este ingreso.")).toBeVisible();
    await user.click(screen.getByRole("checkbox", { name: /Confirmo que quiero solicitar ingreso a esta academia/i }));
    await user.click(screen.getByRole("button", { name: "Solicitar ingreso" }));
    await waitFor(() => expect(fixture.client.submit).toHaveBeenCalledTimes(1));
    expect(fixture.client.submit).toHaveBeenCalledWith("synthetic-academy", expect.objectContaining({ proofId: fixture.proofId, expectedPolicyVersion: 1, confirmed: true }), expect.any(AbortSignal));
    expect(await screen.findByText("La solicitud quedó pendiente.")).toBeVisible();
    expect(fixture.contact.issue).toHaveBeenCalledTimes(1);
    expect(fixture.contact.verify).toHaveBeenCalledTimes(1);
  });

  it.each([
    { code: "usage_limit_reached", message: "Se alcanzó el límite de comprobación. Esperá antes de pedir otro código." },
    { code: "dependency_unavailable", message: "El servicio de envío no está disponible. Probá de nuevo más tarde." },
    { code: "invalid_credentials", message: "La conexión de mensajería requiere atención del líder de la academia." },
  ] as const)("should preserve a safe $code rejection and clear stale feedback before an explicit retry", async ({ code, message }) => {
    // Given a confirmed rejection from the application's own browser port.
    const fixture = containerFixture(), user = userEvent.setup();
    let finishRetry!: () => void;
    vi.mocked(fixture.contact.issue).mockResolvedValueOnce({ status: "failed", code, message, uncertain: false });
    vi.mocked(fixture.contact.issue).mockImplementationOnce((_slug, input) => new Promise((resolve) => {
      finishRetry = () => resolve({ status: "ready", value: { state: "completed", operationId: input.operationId, replayed: false, result: { purpose: "admission", challengeId: randomUUID(), channel: "email", maskedDestination: "a•••@example.test", expiresAt: new Date(Date.now() + 600_000).toISOString(), resendAllowedAt: new Date(Date.now() + 60_000).toISOString(), deliveryState: "queued" } } });
    }));
    render(<AdmissionContainer initialState={fixture.initialState} client={fixture.client} contactClient={fixture.contact} />);
    await waitFor(() => expect(screen.getByRole("checkbox", { name: /Confirmo el contacto y el envío del código/i })).toBeEnabled());
    await user.click(screen.getByRole("checkbox", { name: /Confirmo el contacto y el envío del código/i }));
    await user.click(screen.getByRole("button", { name: "Enviar código de ingreso" }));
    expect(await screen.findByText(message)).toBeVisible();
    expect(screen.queryByText("Código comprobado para este ingreso.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Solicitar ingreso" })).not.toBeInTheDocument();
    expect(fixture.contact.issue).toHaveBeenCalledTimes(1);
    expect(fixture.contact.verify).not.toHaveBeenCalled();
    expect(fixture.client.submit).not.toHaveBeenCalled();

    // When a new explicit attempt starts, its pending state replaces the old error.
    await user.click(screen.getByRole("button", { name: "Enviar código de ingreso" }));
    await waitFor(() => expect(fixture.contact.issue).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(message)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enviando código…" })).toBeDisabled();
    await act(async () => finishRetry());
    expect(await screen.findByLabelText("Código de ingreso")).toBeEnabled();
    expect(screen.queryByText(message)).not.toBeInTheDocument();
    expect(fixture.client.submit).not.toHaveBeenCalled();
  });

  it("should preserve the own pending and offer safe recovery when attaching a checked proof conflicts with another contact binding", async () => {
    // Given an actual contact workflow with own pending state and a confirmed rejection from its HTTP port.
    const fixture = containerFixture(), user = userEvent.setup(), submittedAt = new Date().toISOString();
    const router = { back: vi.fn(), bfcacheId: "contact-conflict", forward: vi.fn(), prefetch: vi.fn(), push: vi.fn(), refresh: vi.fn(), replace: vi.fn() } satisfies AppRouterInstance;
    const pending: AdmissionRequestDto = { id: randomUUID(), status: "pending", version: 1, submittedAt, expiresAt: new Date(new Date(submittedAt).getTime() + ADMISSION_LIMIT.pendingValidityMs).toISOString(), source: "common", needsVerification: true, eligibilityReasons: ["local_proof_required"] };
    fixture.setRequest(pending);
    const initialState = { ...fixture.initialState, request: pending, overview: { ...fixture.initialState.overview, state: "pending" as const, nextAction: "view_request" as const, request: pending } };
    vi.mocked(fixture.contact.apply).mockImplementationOnce(async (_slug, _requestId, input) => ({ status: "failed", code: "contact_binding_conflict", message: "No pudimos usar ese contacto para el ingreso. Revisá tu cuenta o pedí ayuda.", uncertain: false, operation: { operationId: input.operationId, state: "completed" } }));
    render(<AppRouterContext.Provider value={router}><AppUIProvider><AdmissionContainer initialState={initialState} requestPage client={fixture.client} contactClient={fixture.contact} /></AppUIProvider></AppRouterContext.Provider>);
    const contactConsent = screen.getByRole("checkbox", { name: /Confirmo el contacto y el envío del código/i });
    await waitFor(() => expect(contactConsent).toBeEnabled());
    await user.click(contactConsent);
    await user.click(screen.getByRole("button", { name: "Enviar código de ingreso" }));
    await user.type(await screen.findByLabelText("Código de ingreso"), "123456");
    await user.click(screen.getByRole("button", { name: "Comprobar código" }));
    expect(await screen.findByText("Código comprobado para este ingreso.")).toBeVisible();

    // When the verified proof is explicitly attached, another binding is never treated as success.
    await user.click(await screen.findByRole("button", { name: "Aplicar prueba a esta solicitud" }));
    const recovery = await screen.findByText("No pudimos usar ese contacto para el ingreso. Revisá tu cuenta o pedí ayuda.");
    expect(recovery).toBeVisible();
    expect(recovery).toHaveAttribute("role", "alert");
    expect(screen.getByText("Presentada").parentElement?.querySelector("time")).toHaveAttribute("datetime", pending.submittedAt);
    expect(screen.getByText("Plazo de la solicitud").parentElement?.querySelector("time")).toHaveAttribute("datetime", pending.expiresAt);
    expect(screen.queryByText("La prueba quedó aplicada a tu solicitud pendiente.")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Abrir academia" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Solicitar ingreso" })).not.toBeInTheDocument();
    expect(fixture.contact.apply).toHaveBeenCalledExactlyOnceWith("synthetic-academy", pending.id, expect.objectContaining({ proofId: fixture.proofId, expectedVersion: pending.version, confirmed: true }), expect.any(AbortSignal));
    expect(fixture.contact.issue).toHaveBeenCalledOnce();
    expect(fixture.contact.verify).toHaveBeenCalledOnce();
    expect(fixture.contact.resend).not.toHaveBeenCalled();
    expect(fixture.client.submit).not.toHaveBeenCalled();
    expect(fixture.client.cancel).not.toHaveBeenCalled();
    expect(fixture.client.overview).not.toHaveBeenCalled();
    expect(fixture.client.own).not.toHaveBeenCalled();
    expect(router.refresh).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
    // Cancellation remains an own request action; the contact conflict never approves or replaces that request.
    expect(screen.getByRole("checkbox", { name: /Confirmo que quiero cancelar esta solicitud/i })).toBeEnabled();
  });

  it("should apply the opaque proof to the same pending and preserve original dates without another presentation", async () => {
    const fixture = containerFixture(), user = userEvent.setup(), pending: AdmissionRequestDto = { id: randomUUID(), status: "pending", version: 1, submittedAt: "2026-10-08T00:00:00Z", expiresAt: "2026-11-07T00:00:00Z", source: "common", needsVerification: true, eligibilityReasons: ["local_proof_required"] };
    fixture.setRequest(pending);
    const initialState = { ...fixture.initialState, request: pending, overview: { ...fixture.initialState.overview, state: "pending" as const, nextAction: "view_request" as const, request: pending } };
    vi.mocked(fixture.contact.apply).mockImplementation(async (_slug, requestId, input) => { fixture.setRequest({ ...pending, version: 2, needsVerification: false, eligibilityReasons: [], contact: { type: "email", maskedValue: "a•••@example.test", evidenceKind: "local" } }); return { status: "ready", value: { state: "completed", operationId: input.operationId, replayed: false, result: { outcome: "applied", requestId, requestVersion: 2, status: "pending", proofId: input.proofId } } }; });
    render(<AdmissionContainer initialState={initialState} requestPage client={fixture.client} contactClient={fixture.contact} />);
    await waitFor(() => expect(screen.getByRole("checkbox", { name: /Confirmo el contacto y el envío del código/i })).toBeEnabled());
    await user.click(screen.getByRole("checkbox", { name: /Confirmo el contacto y el envío del código/i }));
    await user.click(screen.getByRole("button", { name: "Enviar código de ingreso" }));
    await user.type(await screen.findByLabelText("Código de ingreso"), "123456");
    await user.click(screen.getByRole("button", { name: "Comprobar código" }));
    await user.click(await screen.findByRole("button", { name: "Aplicar prueba a esta solicitud" }));
    await waitFor(() => expect(fixture.contact.apply).toHaveBeenCalledTimes(1));
    expect(fixture.contact.apply).toHaveBeenCalledWith("synthetic-academy", pending.id, expect.objectContaining({ proofId: fixture.proofId, expectedVersion: 1, confirmed: true }), expect.any(AbortSignal));
    expect(await screen.findByText("La prueba quedó aplicada a tu solicitud pendiente.")).toBeVisible();
    expect(fixture.client.submit).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Solicitar ingreso" })).not.toBeInTheDocument();
    expect(screen.getByText("Plazo de la solicitud").parentElement?.querySelector("time")).toHaveAttribute("datetime", pending.expiresAt);
  });

  it("should keep the verified phone fixed in both contact and submission forms while allowing a message", async () => {
    const fixture = containerFixture(), user = userEvent.setup();
    fixture.initialState.overview.policy = { ...fixture.initialState.overview.policy!, contactType: "phone" };
    fixture.initialState.overview.verification = { channel: "sms", allowedCountries: ["AR"] };
    vi.mocked(fixture.contact.issue).mockImplementation(async (_slug, input) => ({ status: "ready", value: { state: "completed", operationId: input.operationId, replayed: false, result: { purpose: "admission", challengeId: randomUUID(), channel: "sms", maskedDestination: "•••1234", expiresAt: new Date(Date.now() + 600_000).toISOString(), resendAllowedAt: new Date(Date.now() + 60_000).toISOString(), deliveryState: "queued" } } }));
    render(<AdmissionContainer initialState={fixture.initialState} client={fixture.client} contactClient={fixture.contact} />);
    await waitFor(() => expect(screen.getByLabelText("Teléfono para este ingreso")).toBeEnabled());
    await user.type(screen.getByLabelText("Teléfono para este ingreso"), "+5491155501234");
    await user.click(screen.getByRole("checkbox", { name: /Confirmo el contacto y el envío del código/i }));
    await user.click(screen.getByRole("button", { name: "Enviar código de ingreso" }));
    await user.type(await screen.findByLabelText("Código de ingreso"), "123456");
    await user.click(screen.getByRole("button", { name: "Comprobar código" }));
    expect(await screen.findByText("Código comprobado para este ingreso.")).toBeVisible();
    expect(screen.getByLabelText("Teléfono para este ingreso")).toBeDisabled();
    expect(screen.getByLabelText("Teléfono", { exact: true })).toBeDisabled();
    expect(screen.getByLabelText("País del teléfono", { selector: "input" })).toBeDisabled();
    expect(screen.getByLabelText("Mensaje para los responsables (opcional)")).toBeEnabled();
  });
});
