/** Exercises the applicant's code step with real shared controls and the guided flow. @module admission-request-steps-tests */
import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdmissionRequestSteps } from "@/components/academy-admissions/admission-request-steps";
import type { ContactVerificationProps } from "@/components/academy-admissions/contact-verification";
import { AppUIProvider } from "@/components/providers/app-providers/app-ui-provider";

/** @param overrides - Facts of the code under test. @returns Controlled verification props with callbacks to observe. */
function verification(overrides: Partial<ContactVerificationProps> = {}): ContactVerificationProps {
  return {
    channel: "sms", phone: "+5491155501234", country: "AR", verificationCode: "", confirmed: false, busy: false, ready: true, canIssue: false, canVerify: true, canResend: true, canUseSmsAlternative: false, contactLocked: true, allowedCountries: ["AR"],
    challenge: { challengeId: "synthetic-challenge", purpose: "admission", channel: "sms", maskedDestination: "•••1234", expiresAt: "2100-01-01T00:00:00Z", resendAllowedAt: "2000-01-01T00:00:00Z", deliveryState: "accepted" },
    proofReady: false, expiresInSeconds: 600, resendInSeconds: 0, errorMessage: null, feedback: null, fieldErrors: {},
    onPhoneChange: vi.fn(), onCountryChange: vi.fn(), onCodeChange: vi.fn(), onConfirm: vi.fn(), onIssue: vi.fn(), onResend: vi.fn(), onVerify: vi.fn(), onUseSmsAlternative: vi.fn(),
    ...overrides,
  };
}

/** @param props - Verification facts on the code step. @returns The apply flow opened on its code step. */
function CodeStep({ facts }: { facts: ContactVerificationProps }) {
  const [step, setStep] = useState(1);
  return <AppUIProvider><AdmissionRequestSteps mode="apply" step={step} onStepChange={setStep} busy={false} issuing={false} verifying={false} verification={facts}
    form={{ draft: { phone: "", country: "", message: "" }, contactType: "phone", confirmed: false, disabled: false, busy: false, errorMessage: null, onChange: vi.fn(), onConfirm: vi.fn() }}
    finalAction={{ label: "Aplicar prueba a esta solicitud", onRun: vi.fn() }} /></AppUIProvider>;
}

describe("applicant code step", () => {
  it("should make the confirmed resend the next action when the current code must be replaced", () => {
    const facts = verification({ requiresReplacement: true });
    const view = render(<CodeStep facts={facts} />);
    expect(screen.getByRole("button", { name: "Comprobar código" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "Confirmo el contacto y el envío del código para este ingreso." }));
    expect(facts.onConfirm).toHaveBeenCalledWith(true);
    view.rerender(<CodeStep facts={{ ...facts, confirmed: true }} />);
    fireEvent.click(screen.getByRole("button", { name: "Reenviar código" }));
    expect(facts.onResend).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("¿No te llegó el código?")).not.toBeInTheDocument();
  });

  it("should keep the confirmed resend collapsed while the current code can still be checked", () => {
    const facts = verification({ confirmed: true });
    render(<CodeStep facts={facts} />);
    const summary = screen.getByText("¿No te llegó el código?");
    expect(summary.closest("details")).not.toHaveAttribute("open");
    fireEvent.click(summary);
    fireEvent.click(screen.getByRole("button", { name: "Reenviar código" }));
    expect(facts.onResend).toHaveBeenCalledTimes(1);
  });
});
