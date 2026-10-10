/** Exercises the real personal route container, shared controls, Next contexts and browser storage through own ports. @module academy-personal-invitation-tests */
import { randomBytes, randomUUID } from "node:crypto";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import type { ReactNode } from "react";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PersonalInvitationContainer } from "@/app/(admission)/admissions/invitations/[token]/personal-invitation-container";
import { AppUIProvider } from "@/components/providers/app-providers/app-ui-provider";
import type { PersonalInvitationPageState } from "@/src/modules/academy-admissions/application/results/personal-invitation-page-state";
import type { PersonalInvitationBrowserClient } from "@/src/modules/academy-admissions/application/ports/personal-invitation-browser-client";
import type { AdmissionContactBrowserClient } from "@/src/modules/academy-admissions/application/ports/admission-contact-browser-client";
import { createPersonalInvitationBrowserScope } from "@/lib/academy-admissions/personal-invitation-scope";
import { writePersonalInvitationSubmissionIntent } from "@/lib/academy-admissions/personal-invitation-submission-intent";

const router = { back: vi.fn(), bfcacheId: "personal-test", forward: vi.fn(), prefetch: vi.fn(), push: vi.fn(), refresh: vi.fn(), replace: vi.fn() } satisfies AppRouterInstance;

/** @param props - Real native route contexts and shared UI provider. @returns The same public boundaries used by product controls. */
function Providers({ children, token }: { children: ReactNode; token: string }) {
  return <AppRouterContext.Provider value={router}><PathParamsContext.Provider value={{ token }}><AppUIProvider>{children}</AppUIProvider></PathParamsContext.Provider></AppRouterContext.Provider>;
}

/** @param additionalVerification - Whether the own policy requires a local code. @returns Controlled own transport ports and safe native-shaped snapshots. */
function fixture(additionalVerification = false) {
  const token = randomBytes(32).toString("base64url"), viewerId = randomUUID(), now = new Date().toISOString(), requestId = randomUUID();
  const request = { id: requestId, version: 1, status: "pending" as const, source: "personal" as const, submittedAt: now, expiresAt: "2100-11-06T01:00:00Z", needsVerification: false, eligibilityReasons: [] };
  const preview = { state: "available" as const, requiresAllowlist: false, expectedOutcome: "pending" as const, overview: { tribe: { slug: "synthetic-personal", name: "Academia sintética", accessModel: "academy" as const }, policy: { mode: "manual_review" as const, contactType: "email" as const, requiresAdditionalVerification: additionalVerification, isOpen: true, version: 1 }, state: additionalVerification ? "verification_required" as const : "available" as const, nextAction: additionalVerification ? "verify_contact" as const : "request_admission" as const, safeMessage: additionalVerification ? "Comprobá tu contacto antes de confirmar esta invitación personal." : "Al confirmar, enviarás una solicitud que deberá revisar el equipo de la academia.", ...(additionalVerification ? { verification: { channel: "email" as const, allowedCountries: [] } } : {}) } };
  const state: PersonalInvitationPageState = { kind: "ready", preview, viewerId, renderedAt: now };
  const client: PersonalInvitationBrowserClient = {
    viewer: vi.fn(async () => ({ status: "ready" as const, value: { id: viewerId } })),
    overview: vi.fn(async () => ({ status: "ready" as const, value: { viewerId, preview: { ...preview, overview: { ...preview.overview, state: "pending" as const, nextAction: "view_request" as const, safeMessage: "Tu solicitud está pendiente de revisión.", request } } } })),
    submit: vi.fn(async (_slug, input) => ({ status: "ready" as const, value: { operationId: input.operationId, outcome: "pending" as const, request, safeMessage: "La solicitud quedó pendiente de revisión." } })),
    operation: vi.fn(async () => ({ status: "failed" as const, code: "resource_unavailable" as const, message: "La operación no está disponible.", uncertain: false })),
    changeAccount: vi.fn(async () => ({ status: "failed" as const, code: "dependency_unavailable" as const, message: "No pudimos cerrar la sesión. Intentá de nuevo.", uncertain: false })),
  };
  const challengeId = randomUUID(), proofId = randomUUID();
  const contactClient: AdmissionContactBrowserClient = {
    issue: vi.fn(async (_slug, input) => ({ status: "ready" as const, value: { state: "completed" as const, operationId: input.operationId, replayed: false, result: { challengeId, purpose: "admission" as const, channel: "email" as const, maskedDestination: "s•••@example.test", expiresAt: "2100-11-06T01:00:00Z", resendAllowedAt: now, deliveryState: "queued" as const } } })),
    verify: vi.fn(async (_slug, _challenge, input) => ({ status: "ready" as const, value: { state: "completed" as const, operationId: input.operationId, replayed: false, result: { purpose: "admission" as const, result: "verified" as const, proofId, applyBefore: "2100-11-06T01:00:00Z" } } })),
    resend: vi.fn(), apply: vi.fn(), operation: vi.fn(), delivery: vi.fn(),
  };
  const element = () => <Providers token={token}><PersonalInvitationContainer initialState={state} client={client} contactClient={contactClient} /></Providers>;
  return { token, viewerId, request, preview, state, client, contactClient, proofId, element };
}

beforeEach(() => { window.sessionStorage.clear(); router.refresh.mockClear(); router.push.mockClear(); });
afterEach(() => window.sessionStorage.clear());

describe("personal invitation page workflow", () => {
  it("should retain a terminal code denial and disable its controls in the personal invitation route", async () => {
    const data = fixture(true);
    vi.mocked(data.contactClient.verify).mockImplementationOnce(async (_slug, _challengeId, input) => ({ status: "failed", code: "challenge_invalidated", message: "Ese código ya no está vigente. Consultá el estado antes de pedir otro.", uncertain: false, operation: { operationId: input.operationId, state: "completed" } }));
    render(data.element());
    const consent = await screen.findByRole("checkbox", { name: /Confirmo el contacto y el envío del código/i });
    await waitFor(() => expect(consent).toBeEnabled());
    fireEvent.click(consent);
    fireEvent.click(screen.getByRole("button", { name: "Enviar código de ingreso" }));
    const codeInput = await screen.findByLabelText("Código de ingreso", { exact: true });
    await waitFor(() => expect(codeInput).toBeEnabled());
    fireEvent.change(codeInput, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Comprobar código" }));
    await screen.findByText("Ese código ya no está vigente. Consultá el estado antes de pedir otro.", { exact: true });
    await waitFor(() => expect(consent).toBeEnabled());
    expect(codeInput).toBeDisabled();
    expect(screen.getByRole("button", { name: "Comprobar código" })).toBeDisabled();
    fireEvent.click(consent);
    expect(screen.getByText("Ese código ya no está vigente. Consultá el estado antes de pedir otro.", { exact: true })).toBeVisible();
    expect(data.contactClient.verify).toHaveBeenCalledOnce();
    expect(data.client.submit).not.toHaveBeenCalled();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("should offer explicit render recovery when the initial SSR read failed without starting a browser workflow", () => {
    const data = fixture(), state: PersonalInvitationPageState = { kind: "unavailable", code: "unexpected_failure", message: "No pudimos completar la operación. Conservá los datos e intentá nuevamente." };
    render(<Providers token={data.token}><PersonalInvitationContainer initialState={state} client={data.client} contactClient={data.contactClient} /></Providers>);
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Consultar estado" })).toBeNull();
    expect(data.client.viewer).not.toHaveBeenCalled(); expect(data.client.submit).not.toHaveBeenCalled();
  });
  it("should render deterministic safe SSR and hydrate without requesting a code or redeeming the invitation", async () => {
    const data = fixture(), container = document.createElement("div"), errors: unknown[] = [];
    container.innerHTML = renderToString(data.element()); document.body.append(container);
    const serverText = container.textContent;
    expect(serverText).toContain("Invitación personal");
    expect(serverText).not.toContain(data.token);
    const root = hydrateRoot(container, data.element(), { onRecoverableError: (error) => errors.push(error) });
    await waitFor(() => expect(data.client.viewer).toHaveBeenCalled());
    expect(errors).toEqual([]);
    expect(data.client.overview).not.toHaveBeenCalled();
    expect(data.client.submit).not.toHaveBeenCalled();
    expect(data.contactClient.issue).not.toHaveBeenCalled();
    await act(async () => root.unmount()); container.remove();
  });

  it("should submit OFF only after explicit confirmation and update the own request without a route refresh", async () => {
    const data = fixture(); render(data.element());
    const confirmation = screen.getByRole("checkbox", { name: /Confirmo que quiero usar esta invitación/i });
    await waitFor(() => expect(confirmation).toBeEnabled());
    expect(screen.getByRole("button", { name: "Confirmar invitación" })).toBeDisabled();
    fireEvent.click(confirmation); fireEvent.click(screen.getByRole("button", { name: "Confirmar invitación" }));
    await screen.findByRole("link", { name: "Ver mi solicitud" });
    expect(data.client.submit).toHaveBeenCalledExactlyOnceWith("synthetic-personal", expect.objectContaining({ invitationToken: data.token, confirmed: true, expectedPolicyVersion: 1 }), expect.any(AbortSignal));
    expect(data.contactClient.issue).not.toHaveBeenCalled();
    expect(router.refresh).not.toHaveBeenCalled();
    const stored = Array.from({ length: sessionStorage.length }, (_, index) => sessionStorage.getItem(sessionStorage.key(index)!)).join("");
    expect(stored).not.toContain(data.token);
  });

  it("should keep an anonymous link generic and preserve the exact internal return for sign-in without effects", async () => {
    const data = fixture();
    data.state = { kind: "ready", viewerId: null, renderedAt: data.state.kind === "ready" ? data.state.renderedAt : "", preview: { state: "sign_in_required", safeMessage: "Iniciá sesión para consultar esta invitación personal." } };
    vi.mocked(data.client.viewer).mockResolvedValue({ status: "ready", value: null });
    render(<Providers token={data.token}><PersonalInvitationContainer initialState={data.state} client={data.client} contactClient={data.contactClient} /></Providers>);
    expect(screen.getByRole("link", { name: "Iniciar sesión" })).toHaveAttribute("href", `/auth/signin?callbackUrl=${encodeURIComponent(`/admissions/invitations/${data.token}`)}`);
    expect(screen.queryByText("Academia sintética")).toBeNull();
    expect(data.client.submit).not.toHaveBeenCalled(); expect(data.contactClient.issue).not.toHaveBeenCalled();
  });

  it("should keep an incorrect-account view generic without recipient, academy, code or silent common submission", async () => {
    const data = fixture(), state: PersonalInvitationPageState = { kind: "ready", viewerId: data.viewerId, renderedAt: new Date().toISOString(), preview: { state: "unavailable", safeMessage: "No podemos continuar con esta invitación desde esta cuenta. Podés cambiar de cuenta o usar otra vía de ingreso." } };
    render(<Providers token={data.token}><PersonalInvitationContainer initialState={state} client={data.client} contactClient={data.contactClient} /></Providers>);
    expect(screen.queryByText("Academia sintética")).toBeNull(); expect(screen.queryByRole("button", { name: "Confirmar invitación" })).toBeNull();
    const changeAccount = screen.getByRole("button", { name: "Cambiar de cuenta" }); await waitFor(() => expect(changeAccount).toBeEnabled()); fireEvent.click(changeAccount);
    await screen.findByRole("alert");
    expect(data.client.changeAccount).toHaveBeenCalledOnce(); expect(data.client.submit).not.toHaveBeenCalled(); expect(data.contactClient.issue).not.toHaveBeenCalled();
  });

  it("should complete ON locally and require a separate confirmed canje without auto-submitting after verification", async () => {
    const data = fixture(true); render(data.element());
    const codeConfirmation = await screen.findByRole("checkbox", { name: /Confirmo el contacto y el envío del código/i });
    await waitFor(() => expect(codeConfirmation).toBeEnabled());
    expect(data.contactClient.issue).not.toHaveBeenCalled();
    fireEvent.click(codeConfirmation); fireEvent.click(screen.getByRole("button", { name: "Enviar código de ingreso" }));
    const code = await screen.findByLabelText("Código de ingreso", { exact: true }); fireEvent.change(code, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Comprobar código" }));
    await screen.findByText("Código comprobado para este ingreso.");
    expect(data.client.submit).not.toHaveBeenCalled();
    expect(data.contactClient.issue).toHaveBeenCalledExactlyOnceWith("synthetic-personal", expect.objectContaining({ invitationToken: data.token }), expect.any(AbortSignal));
    fireEvent.click(screen.getByRole("checkbox", { name: /Confirmo que quiero usar esta invitación/i }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar invitación" }));
    await screen.findByRole("link", { name: "Ver mi solicitud" });
    expect(data.client.submit).toHaveBeenCalledWith("synthetic-personal", expect.objectContaining({ proofId: data.proofId, invitationToken: data.token }), expect.any(AbortSignal));
    expect(data.contactClient.apply).not.toHaveBeenCalled(); expect(router.refresh).not.toHaveBeenCalled();
  });

  it("should recover a lost response from the exact original operation and block another submit", async () => {
    const data = fixture(); vi.mocked(data.client.submit).mockResolvedValue({ status: "failed", code: "dependency_unavailable", message: "La respuesta no llegó.", uncertain: true }); render(data.element());
    const confirmation = screen.getByRole("checkbox", { name: /Confirmo que quiero usar esta invitación/i }); await waitFor(() => expect(confirmation).toBeEnabled()); fireEvent.click(confirmation); fireEvent.click(screen.getByRole("button", { name: "Confirmar invitación" }));
    const read = await screen.findByRole("button", { name: "Consultar operación original" });
    const operationId = vi.mocked(data.client.submit).mock.calls[0]![1].operationId;
    vi.mocked(data.client.operation).mockResolvedValue({ status: "ready", value: { type: "submit_admission", state: "completed", operationId, replayed: true, result: { operationId, outcome: "pending", admissionRequestId: data.request.id, committedRequestVersion: 1, membership: null, requestSnapshot: data.request, created: true } } });
    fireEvent.click(read); await screen.findByRole("link", { name: "Ver mi solicitud" });
    expect(data.client.operation).toHaveBeenCalledExactlyOnceWith("synthetic-personal", operationId, expect.any(AbortSignal));
    expect(data.client.submit).toHaveBeenCalledOnce(); expect(router.refresh).not.toHaveBeenCalled();
  });

  it("should restore only original references after remount without restoring consent or another POST", async () => {
    const data = fixture(), personalScope = await createPersonalInvitationBrowserScope(data.token), operationId = randomUUID();
    writePersonalInvitationSubmissionIntent({ viewerId: data.viewerId, slug: "synthetic-personal", personalScope, operationId });
    vi.mocked(data.client.operation).mockResolvedValue({ status: "ready", value: { type: "submit_admission", state: "started", operationId } });
    render(data.element());
    await waitFor(() => expect(data.client.operation).toHaveBeenCalledOnce());
    expect(screen.getByRole("checkbox", { name: /Confirmo que quiero usar esta invitación/i })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Confirmar invitación" })).toBeDisabled(); expect(data.client.submit).not.toHaveBeenCalled();
  });

  it("should hide the previous academy when the actual viewer changes before confirmation", async () => {
    const data = fixture(); render(data.element());
    const confirmation = screen.getByRole("checkbox", { name: /Confirmo que quiero usar esta invitación/i }); await waitFor(() => expect(confirmation).toBeEnabled());
    vi.mocked(data.client.viewer).mockResolvedValue({ status: "ready", value: { id: randomUUID() } });
    fireEvent.click(confirmation); fireEvent.click(screen.getByRole("button", { name: "Confirmar invitación" }));
    await screen.findByRole("button", { name: "Continuar con la cuenta actual" });
    expect(screen.queryByText("Academia sintética")).toBeNull(); expect(data.client.submit).not.toHaveBeenCalled(); expect(data.contactClient.issue).not.toHaveBeenCalled();
  });

  it("should make common admission a separate navigation without submitting or issuing a code", async () => {
    const data = fixture(); render(data.element());
    expect(screen.getByRole("link", { name: "Elegir la vía común de ingreso" })).toHaveAttribute("href", "/admissions/synthetic-personal");
    expect(data.client.submit).not.toHaveBeenCalled(); expect(data.contactClient.issue).not.toHaveBeenCalled();
  });

  it("should return to an actionable state after a failed account read before dispatch and clear feedback on a new confirmation", async () => {
    const data = fixture(); render(data.element());
    const confirmation = screen.getByRole("checkbox", { name: /Confirmo que quiero usar esta invitación/i }); await waitFor(() => expect(confirmation).toBeEnabled());
    vi.mocked(data.client.viewer).mockResolvedValueOnce({ status: "failed", code: "dependency_unavailable", message: "No pudimos comprobar la cuenta.", uncertain: false });
    fireEvent.click(confirmation); fireEvent.click(screen.getByRole("button", { name: "Confirmar invitación" }));
    const alert = await screen.findByRole("alert"); expect(alert).toHaveTextContent("No pudimos comprobar la cuenta."); expect(alert).toHaveFocus();
    await waitFor(() => expect(screen.getByRole("button", { name: "Confirmar invitación" })).toBeEnabled());
    expect(data.client.submit).not.toHaveBeenCalled();
    fireEvent.click(confirmation); expect(screen.queryByRole("alert")).toBeNull();
  });

  it("should restore readiness after a failed initial native viewer read and a successful explicit observation", async () => {
    const data = fixture();
    vi.mocked(data.client.viewer).mockResolvedValueOnce({ status: "failed", code: "dependency_unavailable", message: "No pudimos comprobar la cuenta.", uncertain: false });
    vi.mocked(data.client.overview).mockResolvedValue({ status: "ready", value: { preview: data.preview, viewerId: data.viewerId } });
    render(data.element());
    await screen.findByRole("alert");
    const confirmation = screen.getByRole("checkbox", { name: /Confirmo que quiero usar esta invitación/i }); expect(confirmation).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Consultar estado" }));
    await waitFor(() => expect(confirmation).toBeEnabled());
    expect(screen.queryByRole("alert")).toBeNull(); expect(confirmation).not.toBeChecked();
    expect(data.client.submit).not.toHaveBeenCalled(); expect(data.contactClient.issue).not.toHaveBeenCalled();
  });

  it("should reject an intermediate account's preview even when the surrounding native reads return the original viewer", async () => {
    const data = fixture(), otherViewerId = randomUUID(); render(data.element());
    await waitFor(() => expect(screen.getByRole("checkbox", { name: /Confirmo que quiero usar esta invitación/i })).toBeEnabled());
    vi.mocked(data.client.overview).mockResolvedValue({ status: "ready", value: { viewerId: otherViewerId, preview: { ...data.preview, overview: { ...data.preview.overview, tribe: { ...data.preview.overview.tribe, name: "Academia privada de otra cuenta" } } } } });
    fireEvent.click(screen.getByRole("button", { name: "Consultar estado" }));
    await screen.findByRole("button", { name: "Continuar con la cuenta actual" });
    expect(screen.queryByText("Academia privada de otra cuenta")).toBeNull();
    expect(screen.queryByText("Academia sintética")).toBeNull();
    expect(data.client.submit).not.toHaveBeenCalled();
  });

  it("should retain a confirmed pending when the subsequent own GET fails without enabling another canje", async () => {
    const data = fixture(); vi.mocked(data.client.overview).mockResolvedValue({ status: "failed", code: "dependency_unavailable", message: "No pudimos consultar el estado.", uncertain: false }); render(data.element());
    const confirmation = screen.getByRole("checkbox", { name: /Confirmo que quiero usar esta invitación/i }); await waitFor(() => expect(confirmation).toBeEnabled());
    fireEvent.click(confirmation); fireEvent.click(screen.getByRole("button", { name: "Confirmar invitación" }));
    await screen.findByRole("link", { name: "Ver mi solicitud" });
    expect(screen.queryByRole("button", { name: "Confirmar invitación" })).toBeNull();
    expect(data.client.submit).toHaveBeenCalledOnce(); expect(router.refresh).not.toHaveBeenCalled();
  });

  it("should require new canje consent after re-reading the current policy instead of restoring an earlier confirmation", async () => {
    const data = fixture(); render(data.element());
    const confirmation = screen.getByRole("checkbox", { name: /Confirmo que quiero usar esta invitación/i }); await waitFor(() => expect(confirmation).toBeEnabled()); fireEvent.click(confirmation);
    vi.mocked(data.client.overview).mockResolvedValue({ status: "ready", value: { viewerId: data.viewerId, preview: { ...data.preview, overview: { ...data.preview.overview, policy: { ...data.preview.overview.policy, version: 2 } } } } });
    fireEvent.click(screen.getByRole("button", { name: "Consultar estado" }));
    await waitFor(() => expect(confirmation).toBeEnabled());
    expect(confirmation).not.toBeChecked(); expect(screen.getByRole("button", { name: "Confirmar invitación" })).toBeDisabled();
    expect(data.client.submit).not.toHaveBeenCalled();
  });

  it("should reconcile a reference from another document before issuing a new canje", async () => {
    const data = fixture(); render(data.element());
    const confirmation = screen.getByRole("checkbox", { name: /Confirmo que quiero usar esta invitación/i }); await waitFor(() => expect(confirmation).toBeEnabled());
    const operationId = randomUUID(), personalScope = await createPersonalInvitationBrowserScope(data.token);
    writePersonalInvitationSubmissionIntent({ viewerId: data.viewerId, slug: "synthetic-personal", personalScope, operationId });
    fireEvent.click(confirmation); fireEvent.click(screen.getByRole("button", { name: "Confirmar invitación" }));
    await screen.findByRole("button", { name: "Consultar operación original" });
    expect(data.client.submit).not.toHaveBeenCalled(); expect(confirmation).not.toBeChecked();
  });

  it("should abort an unmounted canje and leave its original durable reference for recovery", async () => {
    const data = fixture(); let signal: AbortSignal | null = null;
    vi.mocked(data.client.submit).mockImplementation((_slug, _input, requestSignal) => { signal = requestSignal; return new Promise(() => {}); });
    const view = render(data.element());
    const confirmation = screen.getByRole("checkbox", { name: /Confirmo que quiero usar esta invitación/i }); await waitFor(() => expect(confirmation).toBeEnabled());
    fireEvent.click(confirmation); fireEvent.click(screen.getByRole("button", { name: "Confirmar invitación" }));
    await waitFor(() => expect(data.client.submit).toHaveBeenCalledOnce()); view.unmount();
    expect((signal as AbortSignal | null)?.aborted).toBe(true);
    expect(sessionStorage.length).toBeGreaterThan(0);
  });

  it.each(["pending", "already_member"] as const)("should prioritize %s without redeeming or offering another confirmation", async (status) => {
    const data = fixture();
    const preview = { ...data.preview, overview: { ...data.preview.overview, state: status, nextAction: status === "pending" ? "view_request" as const : "open_academy" as const, ...(status === "pending" ? { request: data.request } : {}) } };
    const state: PersonalInvitationPageState = { kind: "ready", viewerId: data.viewerId, renderedAt: new Date().toISOString(), preview };
    render(<Providers token={data.token}><PersonalInvitationContainer initialState={state} client={data.client} contactClient={data.contactClient} /></Providers>);
    expect(screen.getByRole("link", { name: status === "pending" ? "Ver mi solicitud" : "Abrir academia" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirmar invitación" })).toBeNull();
    expect(data.client.submit).not.toHaveBeenCalled(); expect(data.contactClient.issue).not.toHaveBeenCalled();
  });
});
