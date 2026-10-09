/** Exercises the actual route container and shared UI with own transport ports; ordinary success uses incremental state, not route refresh. @module academy-admission-contact-container-tests */
import { randomUUID } from "node:crypto";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdmissionContainer } from "@/app/(admission)/admissions/[slug]/admission-container";
import type { AdmissionPageState } from "@/src/modules/academy-admissions/application/results/admission-page-state";
import type { AdmissionBrowserClient } from "@/src/modules/academy-admissions/application/ports/admission-browser-client";
import type { AdmissionContactBrowserClient } from "@/src/modules/academy-admissions/application/ports/admission-contact-browser-client";
import type { AdmissionRequestDto } from "@/src/modules/academy-admissions/application/results/admission-flow-result-schemas";

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
    issue: vi.fn<AdmissionContactBrowserClient["issue"]>(async (_slug, input) => ({ status: "ready", value: { state: "completed", operationId: input.operationId, replayed: false, result: { purpose: "admission", challengeId, channel: "email", maskedDestination: "a•••@example.test", expiresAt: new Date(now + 600_000).toISOString(), resendAllowedAt: new Date(now + 60_000).toISOString(), deliveryState: "queued" } } })),
    verify: vi.fn<AdmissionContactBrowserClient["verify"]>(async (_slug, _challenge, input) => ({ status: "ready", value: { state: "completed", operationId: input.operationId, replayed: false, result: { purpose: "admission", result: "verified", proofId, applyBefore: new Date(now + 900_000).toISOString() } } })),
    resend: vi.fn<AdmissionContactBrowserClient["resend"]>(), apply: vi.fn<AdmissionContactBrowserClient["apply"]>(), delivery: vi.fn<AdmissionContactBrowserClient["delivery"]>(), operation: vi.fn<AdmissionContactBrowserClient["operation"]>(),
  };
  return { initialState, client, contact, proofId, viewerId, setRequest: (value: AdmissionRequestDto) => { request = value; } };
}

describe("applicant contact step in the route", () => {
  it.each(["anonymous", "disabled"] as const)("should omit contact actions and requests for %s scope", async (scope) => {
    const fixture = containerFixture();
    const initialState = scope === "anonymous" ? { ...fixture.initialState, viewerId: null, overview: { ...fixture.initialState.overview, state: "sign_in_required" as const, nextAction: "sign_in" as const, verification: undefined } } : { ...fixture.initialState, overview: { ...fixture.initialState.overview, policy: { ...fixture.initialState.overview.policy!, requiresAdditionalVerification: false }, state: "available" as const, nextAction: "request_admission" as const, verification: undefined } };
    render(<AdmissionContainer initialState={initialState} client={fixture.client} contactClient={fixture.contact} />);
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Comprobar contacto para el ingreso" })).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Enviar código de ingreso" })).not.toBeInTheDocument();
    expect(fixture.contact.issue).not.toHaveBeenCalled();
    expect(fixture.contact.operation).not.toHaveBeenCalled();
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
