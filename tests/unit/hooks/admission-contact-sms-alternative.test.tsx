/** Exercises explicit same-challenge SMS proposals and replacement code state through the own browser port. @module admission-contact-sms-alternative-tests */
import { randomUUID } from "node:crypto";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAdmissionContactVerification } from "@/hooks/use-admission-contact-verification";
import type { AdmissionContactBrowserClient } from "@/src/modules/academy-admissions/application/ports/admission-contact-browser-client";
import type { AdmissionChallengeSnapshot } from "@/src/modules/academy-admissions/domain/repositories/admission-contact-verification";
import { ADMISSION_LIMIT } from "@/src/modules/academy-admissions/constants/admission-limits";

afterEach(() => window.sessionStorage.clear());

/** @returns A fixed phone proposal and two confirmed own snapshots; no provider, session or UI library is replaced. */
function smsAlternativeFixture() {
  const now = Date.now(), challengeId = randomUUID(), replacementId = randomUUID(), proofId = randomUUID();
  const challenge: AdmissionChallengeSnapshot = { challengeId, purpose: "admission", channel: "whatsapp", maskedDestination: "•••1234", expiresAt: new Date(now + ADMISSION_LIMIT.verificationCodeValidityMs).toISOString(), resendAllowedAt: new Date(now - 1).toISOString(), deliveryState: "unknown" };
  const replacement: AdmissionChallengeSnapshot = { ...challenge, challengeId: replacementId, channel: "sms", deliveryState: "accepted" };
  const client: AdmissionContactBrowserClient = {
    current: vi.fn<AdmissionContactBrowserClient['current']>(async () => ({ status: 'ready', value: { current: null } })),
    issue: vi.fn<AdmissionContactBrowserClient["issue"]>(async (_slug, input) => ({ status: "ready", value: { state: "completed", operationId: input.operationId, replayed: false, result: challenge } })),
    resend: vi.fn<AdmissionContactBrowserClient["resend"]>(async (_slug, _challengeId, input) => ({ status: "ready", value: { state: "completed", operationId: input.operationId, replayed: false, result: replacement } })),
    verify: vi.fn<AdmissionContactBrowserClient["verify"]>(async (_slug, _challengeId, input) => ({ status: "ready", value: { state: "completed", operationId: input.operationId, replayed: false, result: { purpose: "admission", result: "verified", proofId, applyBefore: new Date(now + ADMISSION_LIMIT.verificationProofFreshnessMs).toISOString() } } })),
    apply: vi.fn(), operation: vi.fn(), delivery: vi.fn(),
  };
  const options = { viewerId: randomUUID(), slug: "synthetic-academy", requestId: null, requestVersion: null, policyVersion: 1, channel: "whatsapp" as const, allowedCountries: ["AR"], allowSmsAlternative: true, phone: "+5491155501234", country: "AR", enabled: true, renderedAt: new Date(now).toISOString(), authorize: vi.fn(async () => true), client, onApplied: vi.fn(), onProof: vi.fn() };
  return { now, challenge, replacement, proofId, client, options };
}

describe("explicit applicant SMS alternative", () => {
  it("should replace the original challenge only after explicit SMS consent and clear the old code", async () => {
    // Given an uncertain WhatsApp delivery whose code is still locally usable.
    const fixture = smsAlternativeFixture();
    const { result } = renderHook(() => useAdmissionContactVerification(fixture.options));
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => result.current.setConfirmed(true));
    await act(async () => result.current.issue());
    act(() => result.current.setCode("123456"));
    expect(fixture.client.resend).not.toHaveBeenCalled();

    // When SMS is chosen, only the original challenge carries server-owned contact authority.
    await act(async () => result.current.useSmsAlternative());
    expect(fixture.client.resend).toHaveBeenCalledWith("synthetic-academy", fixture.challenge.challengeId, { operationId: expect.any(String), confirmed: true, useSmsAlternative: true }, expect.any(AbortSignal));
    expect(fixture.client.issue).toHaveBeenCalledTimes(1);
    expect(result.current.challenge).toEqual(fixture.replacement);
    expect(result.current.code).toBe("");
    expect(result.current.proof).toBeNull();
    expect(fixture.client.verify).not.toHaveBeenCalled();

    act(() => result.current.setCode("654321"));
    await act(async () => result.current.verify());
    expect(fixture.client.verify).toHaveBeenCalledWith("synthetic-academy", fixture.replacement.challengeId, { operationId: expect.any(String), confirmed: true, verificationCode: "654321" }, expect.any(AbortSignal));
    expect(result.current.proof?.proofId).toBe(fixture.proofId);
    expect(fixture.client.resend).toHaveBeenCalledTimes(1);
  });

  it("should reject the SMS alternative before its original cooldown without authorization or another write", async () => {
    const fixture = smsAlternativeFixture();
    fixture.challenge.resendAllowedAt = new Date(fixture.now + ADMISSION_LIMIT.verificationResendWaitMs).toISOString();
    const { result } = renderHook(() => useAdmissionContactVerification(fixture.options));
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => result.current.setConfirmed(true));
    await act(async () => result.current.issue());
    const authorizationCalls = fixture.options.authorize.mock.calls.length;
    await act(async () => result.current.useSmsAlternative());
    expect(result.current.errorMessage).toBe("Esperá hasta que termine el plazo de reenvío antes de pedir otro código.");
    expect(fixture.options.authorize).toHaveBeenCalledTimes(authorizationCalls);
    expect(fixture.client.resend).not.toHaveBeenCalled();
    expect(result.current.challenge?.challengeId).toBe(fixture.challenge.challengeId);
  });

  it("should preserve the original when SMS permission is withdrawn or consent is cleared", async () => {
    const fixture = smsAlternativeFixture();
    const { result, rerender } = renderHook((options) => useAdmissionContactVerification(options), { initialProps: fixture.options });
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => result.current.setConfirmed(true));
    await act(async () => result.current.issue());
    rerender({ ...fixture.options, allowSmsAlternative: false });
    await act(async () => result.current.useSmsAlternative());
    expect(fixture.client.resend).not.toHaveBeenCalled();
    rerender(fixture.options);
    act(() => result.current.setConfirmed(false));
    await act(async () => result.current.useSmsAlternative());
    expect(result.current.errorMessage).toBe("Confirmá el contacto y el envío antes de continuar.");
    expect(result.current.challenge?.challengeId).toBe(fixture.challenge.challengeId);
    expect(fixture.client.resend).not.toHaveBeenCalled();
    expect(fixture.client.issue).toHaveBeenCalledTimes(1);
  });
});
