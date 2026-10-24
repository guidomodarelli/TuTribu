/** Exercises the applicant's expired code in the actual route container: a status notice, a visible resend and the replacement without reload. @module academy-admission-expired-code-tests */
import { randomUUID } from "node:crypto";
import type { ReactElement } from "react";
import { render as renderView, screen, waitFor } from "@testing-library/react";
import { ThemedToaster, toast } from "@golfo/ui";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdmissionContainer } from "@/app/(admission)/admissions/[slug]/admission-container";
import type { AdmissionPageState } from "@/src/modules/academy-admissions/application/results/admission-page-state";
import type { AdmissionBrowserClient } from "@/src/modules/academy-admissions/application/ports/admission-browser-client";
import type { AdmissionContactBrowserClient } from "@/src/modules/academy-admissions/application/ports/admission-contact-browser-client";
import type { AdmissionChallengeSnapshot } from "@/src/modules/academy-admissions/domain/repositories/admission-contact-verification";
import { ADMISSION_LIMIT } from "@/src/modules/academy-admissions/constants/admission-limits";

// Sonner replays every active toast to a newly mounted toaster; dismissing them keeps each test's toasts its own.
afterEach(() => { window.sessionStorage.clear(); toast.dismiss(); });

/** @param ui - Route container. @returns The render result beside the real toaster. */
function render(ui: ReactElement) { return renderView(<>{ui}<ThemedToaster /></>); }

/** Own ports return an already expired SMS code and its confirmed replacement; @golfo/ui and browser state stay real. */
function expiredCodeFixture() {
  const viewerId = randomUUID(), now = Date.now();
  const initialState: Extract<AdmissionPageState, { kind: "ready" }> = { kind: "ready", viewerId, renderedAt: new Date(now).toISOString(), request: null, overview: { tribe: { slug: "synthetic-academy", name: "Academia sintética", accessModel: "academy" }, policy: { mode: "manual_review", contactType: "phone", requiresAdditionalVerification: true, isOpen: true, version: 1 }, state: "verification_required", nextAction: "verify_contact", safeMessage: "Comprobá tu contacto.", verification: { channel: "sms", allowedCountries: ["AR"] } } };
  const expired: AdmissionChallengeSnapshot = { challengeId: randomUUID(), purpose: "admission", channel: "sms", maskedDestination: "•••1234", expiresAt: new Date(now - 1_000).toISOString(), resendAllowedAt: new Date(now - 2_000).toISOString(), deliveryState: "accepted" };
  const replacement: AdmissionChallengeSnapshot = { ...expired, challengeId: randomUUID(), expiresAt: new Date(now + ADMISSION_LIMIT.verificationCodeValidityMs).toISOString(), resendAllowedAt: new Date(now + ADMISSION_LIMIT.verificationResendWaitMs).toISOString(), deliveryState: "queued" };
  const client: AdmissionBrowserClient = {
    viewer: vi.fn<AdmissionBrowserClient["viewer"]>(async () => ({ status: "ready", value: { id: viewerId } })),
    overview: vi.fn<AdmissionBrowserClient["overview"]>(async () => ({ status: "ready", value: initialState.overview })),
    own: vi.fn<AdmissionBrowserClient["own"]>(async () => ({ status: "ready", value: null })),
    operation: vi.fn<AdmissionBrowserClient["operation"]>(), submit: vi.fn<AdmissionBrowserClient["submit"]>(), cancel: vi.fn<AdmissionBrowserClient["cancel"]>(),
  };
  const contact: AdmissionContactBrowserClient = {
    current: vi.fn<AdmissionContactBrowserClient["current"]>(async () => ({ status: "ready", value: { current: null } })),
    issue: vi.fn<AdmissionContactBrowserClient["issue"]>(async (_slug, input) => ({ status: "ready", value: { state: "completed", operationId: input.operationId, replayed: false, result: expired } })),
    resend: vi.fn<AdmissionContactBrowserClient["resend"]>(async (_slug, _challengeId, input) => ({ status: "ready", value: { state: "completed", operationId: input.operationId, replayed: false, result: replacement } })),
    verify: vi.fn<AdmissionContactBrowserClient["verify"]>(), apply: vi.fn<AdmissionContactBrowserClient["apply"]>(), delivery: vi.fn<AdmissionContactBrowserClient["delivery"]>(), operation: vi.fn<AdmissionContactBrowserClient["operation"]>(),
  };
  return { initialState, client, contact, expired, replacement };
}

describe("expired applicant code in the route", () => {
  it("should explain the expiry as a status with a visible resend and move to the replacement without reloading", async () => {
    // Given an applicant whose SMS code expired before it was checked.
    const fixture = expiredCodeFixture(), user = userEvent.setup();
    render(<AdmissionContainer initialState={fixture.initialState} client={fixture.client} contactClient={fixture.contact} />);
    const next = await screen.findByRole("button", { name: "Continuar" });
    await waitFor(() => expect(next).toBeEnabled());
    await user.click(next);
    await user.type(await screen.findByLabelText("Teléfono para este ingreso"), "+5491155501234");
    await waitFor(() => expect(screen.getByRole("checkbox", { name: /Confirmo el contacto y el envío del código/i })).toBeEnabled());
    await user.click(screen.getByRole("checkbox", { name: /Confirmo el contacto y el envío del código/i }));
    await user.click(screen.getByRole("button", { name: "Enviar código de ingreso" }));

    // Then the expiry is a status of the code, not a field error, and the resend is in view.
    expect(await screen.findByLabelText("Código de ingreso")).toBeDisabled();
    expect(screen.getByLabelText("Código de ingreso")).not.toHaveAttribute("aria-invalid", "true");
    const notice = await screen.findByText(/El código venció/);
    expect(notice.closest("[role='status']")).not.toBeNull();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    const resend = screen.getByRole("button", { name: "Reenviar código" });
    expect(resend).toBeVisible();

    // When the applicant resends it, with the send consent shown beside the button.
    expect(screen.getByRole("checkbox", { name: /Confirmo el contacto y el envío del código/i })).toHaveAttribute("aria-checked", "true");
    await waitFor(() => expect(resend).toBeEnabled());
    await user.click(resend);

    // Then the replacement is usable at once: the field is enabled, with its own expiry and no expired notice.
    await waitFor(() => expect(screen.getByLabelText("Código de ingreso")).toBeEnabled());
    expect(screen.queryByText(/El código venció/)).not.toBeInTheDocument();
    expect(screen.getByText(/Vence en/)).toBeVisible();
    expect(await screen.findByText("Te enviamos un código nuevo. Ingresalo antes de que venza.")).toBeVisible();
    expect(fixture.contact.resend).toHaveBeenCalledTimes(1);
    expect(fixture.contact.resend).toHaveBeenCalledWith("synthetic-academy", fixture.expired.challengeId, expect.objectContaining({ confirmed: true }), expect.any(AbortSignal));
  });

  it("should show the new code without reloading when the resend answer is lost but its original completed", async () => {
    // Given a resend the server committed while its answer did not reach the browser.
    const fixture = expiredCodeFixture(), user = userEvent.setup();
    vi.mocked(fixture.contact.resend).mockResolvedValueOnce({ status: "failed", code: "operation_unresolved", message: "La operación quedó sin confirmar.", uncertain: true });
    vi.mocked(fixture.contact.operation).mockImplementation(async (_slug, operationId) => ({ status: "ready", value: { type: "resend_contact_challenge", state: "completed", operationId, replayed: true, result: fixture.replacement } }));
    render(<AdmissionContainer initialState={fixture.initialState} client={fixture.client} contactClient={fixture.contact} />);
    const next = await screen.findByRole("button", { name: "Continuar" });
    await waitFor(() => expect(next).toBeEnabled());
    await user.click(next);
    await user.type(await screen.findByLabelText("Teléfono para este ingreso"), "+5491155501234");
    await waitFor(() => expect(screen.getByRole("checkbox", { name: /Confirmo el contacto y el envío del código/i })).toBeEnabled());
    await user.click(screen.getByRole("checkbox", { name: /Confirmo el contacto y el envío del código/i }));
    await user.click(screen.getByRole("button", { name: "Enviar código de ingreso" }));
    const resend = await screen.findByRole("button", { name: "Reenviar código" });
    await waitFor(() => expect(resend).toBeEnabled());

    // When the resend ends without an answer.
    await user.click(resend);

    // Then the page reads that original once and moves to the new code, with no consult button left behind.
    await waitFor(() => expect(screen.getByLabelText("Código de ingreso")).toBeEnabled());
    expect(screen.queryByText(/El código venció/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Consultar operación del código" })).not.toBeInTheDocument();
    expect(fixture.contact.operation).toHaveBeenCalledTimes(1);
    expect(fixture.contact.resend).toHaveBeenCalledTimes(1);
  });
});
