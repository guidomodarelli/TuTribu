/** Exercises explicit applicant verification presentation with the actual shared UI and controlled application callbacks. @module academy-admissions-verification-tests */
import { randomUUID } from "node:crypto";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ContactVerification } from "@/components/academy-admissions/contact-verification";

/** @returns Only controlled form proposals and safe original metadata; HTTP, viewer and operation ownership remain in the container. */
function verificationProps() {
  return { channel: "email" as const, phone: "", country: "", verificationCode: "", confirmed: false, busy: false, canIssue: false, canVerify: false, canResend: false, canUseSmsAlternative: false, contactLocked: false, allowedCountries: [] as readonly string[], challenge: null, proofReady: false, expiresInSeconds: null, resendInSeconds: null, errorMessage: null, feedback: null, fieldErrors: {}, onPhoneChange: vi.fn(), onCountryChange: vi.fn(), onCodeChange: vi.fn(), onConfirm: vi.fn(), onIssue: vi.fn(), onResend: vi.fn(), onVerify: vi.fn(), onUseSmsAlternative: vi.fn() };
}

describe("applicant contact verification presentation", () => {
  it("should require explicit consent and issue only on the applicant action without sending on render", async () => {
    const props = verificationProps(), user = userEvent.setup(), { rerender } = render(<ContactVerification {...props} />);
    expect(screen.getByText(/correo actual de tu cuenta/i)).toBeVisible();
    expect(screen.getByRole("button", { name: "Enviar código de ingreso" })).toBeDisabled();
    expect(props.onIssue).not.toHaveBeenCalled();
    await user.click(screen.getByRole("checkbox", { name: /Confirmo el contacto y el envío del código/i }));
    expect(props.onConfirm).toHaveBeenCalledWith(true);
    expect(props.onIssue).not.toHaveBeenCalled();
    rerender(<ContactVerification {...props} confirmed canIssue />);
    await user.click(screen.getByRole("button", { name: "Enviar código de ingreso" }));
    expect(props.onIssue).toHaveBeenCalledTimes(1);
  });

  it("should explain a missing country list and block phone issuance even if the container requests an enabled action", () => {
    const props = verificationProps();
    render(<ContactVerification {...props} channel="whatsapp" confirmed canIssue />);
    expect(screen.getByText(/La academia todavía no tiene países habilitados/i)).toBeVisible();
    expect(screen.getByRole("button", { name: "Enviar código de ingreso" })).toBeDisabled();
    expect(props.onIssue).not.toHaveBeenCalled();
  });

  it("should associate phone/country validation with their controls and remove feedback replaced by the container", () => {
    const props = verificationProps(), { rerender } = render(<ContactVerification {...props} channel="sms" allowedCountries={["AR"]} fieldErrors={{ phone: "Revisá el teléfono con su prefijo.", country: "Elegí un país habilitado." }} />);
    const phone = screen.getByLabelText("Teléfono para este ingreso"), country = screen.getByRole("combobox", { name: "País del teléfono" });
    expect(phone).toHaveAttribute("aria-invalid", "true");
    expect(phone).toHaveAccessibleDescription("Revisá el teléfono con su prefijo.");
    expect(country).toHaveAccessibleDescription("Elegí un país habilitado.");
    rerender(<ContactVerification {...props} channel="sms" allowedCountries={["AR"]} phone="+5491155501234" country="AR" fieldErrors={{}} />);
    expect(screen.queryByText("Revisá el teléfono con su prefijo.")).not.toBeInTheDocument();
    expect(phone).not.toHaveAttribute("aria-invalid", "true");
  });

  it("should distinguish queued transport from proof and validate a six-digit code without a new send", async () => {
    const props = verificationProps(), user = userEvent.setup();
    const challenge = { challengeId: randomUUID(), purpose: "admission" as const, channel: "email" as const, maskedDestination: "a•••@example.test", expiresAt: "2026-10-08T23:10:00Z", resendAllowedAt: "2026-10-08T23:01:00Z", deliveryState: "queued" as const };
    const { rerender } = render(<ContactVerification {...props} challenge={challenge} canVerify verificationCode="12345" expiresInSeconds={300} resendInSeconds={30} />);
    expect(screen.getByText("a•••@example.test")).toBeVisible();
    expect(screen.queryByText("Código comprobado para este ingreso.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Comprobar código" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reenviar código" })).toBeDisabled();
    rerender(<ContactVerification {...props} challenge={challenge} canVerify verificationCode="123456" expiresInSeconds={300} resendInSeconds={30} />);
    await user.click(screen.getByRole("button", { name: "Comprobar código" }));
    expect(props.onVerify).toHaveBeenCalledTimes(1);
    expect(props.onIssue).not.toHaveBeenCalled();
    expect(props.onResend).not.toHaveBeenCalled();
  });

  it("should block an expired code, expose persistent safe errors and clear the replaced operation feedback", () => {
    const props = verificationProps(), challenge = { challengeId: randomUUID(), purpose: "admission" as const, channel: "sms" as const, maskedDestination: "•••1234", expiresAt: "2026-10-08T23:10:00Z", resendAllowedAt: "2026-10-08T23:01:00Z", deliveryState: "unknown" as const };
    const { rerender } = render(<ContactVerification {...props} channel="sms" allowedCountries={["AR"]} challenge={challenge} verificationCode="123456" canVerify expiresInSeconds={0} errorMessage="No pudimos confirmar el envío. Consultá la operación original." />);
    expect(screen.getByRole("button", { name: "Comprobar código" })).toBeDisabled();
    expect(screen.getByText(/El código venció/i)).toBeVisible();
    expect(screen.getByText(/No pudimos confirmar el envío/i)).toBeVisible();
    rerender(<ContactVerification {...props} channel="sms" allowedCountries={["AR"]} challenge={challenge} proofReady feedback="La prueba quedó disponible." />);
    expect(screen.queryByText(/No pudimos confirmar el envío/i)).not.toBeInTheDocument();
    expect(screen.getByText("Código comprobado para este ingreso.")).toBeVisible();
    expect(props.onIssue).not.toHaveBeenCalled();
  });

  it("should expose SMS only as an explicit allowed alternative and preserve a locked phone contact", async () => {
    const props = verificationProps(), user = userEvent.setup(), challenge = { challengeId: randomUUID(), purpose: "admission" as const, channel: "whatsapp" as const, maskedDestination: "•••1234", expiresAt: "2026-10-08T23:10:00Z", resendAllowedAt: "2026-10-08T23:01:00Z", deliveryState: "failed" as const };
    const { rerender } = render(<ContactVerification {...props} channel="whatsapp" allowedCountries={["AR"]} phone="+5491155501234" country="AR" contactLocked challenge={challenge} />);
    expect(screen.getByLabelText("Teléfono para este ingreso")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Usar SMS para el mismo teléfono" })).not.toBeInTheDocument();
    rerender(<ContactVerification {...props} channel="whatsapp" allowedCountries={["AR"]} phone="+5491155501234" country="AR" contactLocked challenge={challenge} confirmed canUseSmsAlternative />);
    await user.click(screen.getByRole("button", { name: "Usar SMS para el mismo teléfono" }));
    expect(props.onUseSmsAlternative).toHaveBeenCalledTimes(1);
    expect(props.onPhoneChange).not.toHaveBeenCalled();
    expect(props.onIssue).not.toHaveBeenCalled();
  });

  it("should show expired proof recovery without requesting a code until explicit resend", async () => {
    const props = verificationProps(), user = userEvent.setup(), challenge = { challengeId: randomUUID(), purpose: "admission" as const, channel: "email" as const, maskedDestination: "a•••@example.test", expiresAt: "2026-10-08T23:10:00Z", resendAllowedAt: "2026-10-08T23:01:00Z", deliveryState: "accepted" as const };
    render(<ContactVerification {...props} challenge={challenge} confirmed canResend proofExpired expiresInSeconds={0} resendInSeconds={0} />);
    expect(screen.getByText(/La prueba venció. Reenviá un código/i)).toBeVisible();
    expect(screen.getByLabelText("Código de ingreso")).toBeDisabled();
    expect(props.onResend).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Reenviar código" }));
    expect(props.onResend).toHaveBeenCalledTimes(1);
    expect(props.onIssue).not.toHaveBeenCalled();
  });
});
