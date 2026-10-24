/** Covers the applicant's expired code moving to its replacement without a reload, including a resend whose answer was lost. @module admission-contact-expired-resend-tests */
import { randomUUID } from "node:crypto";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAdmissionContactVerification } from "@/hooks/use-admission-contact-verification";
import type { AdmissionContactBrowserClient } from "@/src/modules/academy-admissions/application/ports/admission-contact-browser-client";
import type { AdmissionChallengeSnapshot } from "@/src/modules/academy-admissions/domain/repositories/admission-contact-verification";
import { ADMISSION_LIMIT } from "@/src/modules/academy-admissions/constants/admission-limits";
import { ADMISSION_CONTACT_BROWSER_TIMEOUT_MS, ADMISSION_CONTACT_COPY } from "@/src/modules/academy-admissions/constants/admission-contact-browser";
import { ADMISSION_ERROR_MESSAGE } from "@/src/modules/academy-admissions/constants/admission-errors";

afterEach(() => window.sessionStorage.clear());

/** @returns An SMS code that already expired, its confirmed replacement and own ports; no provider, session or UI library is replaced. */
function expiredFixture() {
  const now = Date.now();
  const expired: AdmissionChallengeSnapshot = { challengeId: randomUUID(), purpose: "admission", channel: "sms", maskedDestination: "•••1234", expiresAt: new Date(now - 1_000).toISOString(), resendAllowedAt: new Date(now - 2_000).toISOString(), deliveryState: "accepted" };
  const replacement: AdmissionChallengeSnapshot = { ...expired, challengeId: randomUUID(), expiresAt: new Date(now + ADMISSION_LIMIT.verificationCodeValidityMs).toISOString(), resendAllowedAt: new Date(now + ADMISSION_LIMIT.verificationResendWaitMs).toISOString(), deliveryState: "queued" };
  const client: AdmissionContactBrowserClient = {
    current: vi.fn<AdmissionContactBrowserClient["current"]>(async () => ({ status: "ready", value: { current: null } })),
    issue: vi.fn<AdmissionContactBrowserClient["issue"]>(async (_slug, input) => ({ status: "ready", value: { state: "completed", operationId: input.operationId, replayed: false, result: expired } })),
    resend: vi.fn<AdmissionContactBrowserClient["resend"]>(async (_slug, _challengeId, input) => ({ status: "ready", value: { state: "completed", operationId: input.operationId, replayed: false, result: replacement } })),
    verify: vi.fn<AdmissionContactBrowserClient["verify"]>(), apply: vi.fn<AdmissionContactBrowserClient["apply"]>(), operation: vi.fn<AdmissionContactBrowserClient["operation"]>(), delivery: vi.fn<AdmissionContactBrowserClient["delivery"]>(),
  };
  const options = { viewerId: randomUUID(), slug: "synthetic-academy", requestId: null, requestVersion: null, policyVersion: 1, channel: "sms" as const, allowedCountries: ["AR"], allowSmsAlternative: false, phone: "+5491155501234", country: "AR", enabled: true, renderedAt: new Date(now).toISOString(), authorize: vi.fn(async () => true), client, onApplied: vi.fn(), onProof: vi.fn() };
  return { expired, replacement, client, options };
}

/** @param fixture - Own ports and options. @returns The hook after the applicant received a code that already expired. */
async function renderExpired(fixture: ReturnType<typeof expiredFixture>) {
  const view = renderHook(() => useAdmissionContactVerification(fixture.options));
  await waitFor(() => expect(view.result.current.ready).toBe(true));
  act(() => view.result.current.setConfirmed(true));
  await act(async () => view.result.current.issue());
  return view;
}

describe("expired applicant code", () => {
  it("should keep an expired code out of the alerts and refuse a check without another request", async () => {
    // Given a code whose validity already ended.
    const fixture = expiredFixture();
    const { result } = await renderExpired(fixture);
    expect(result.current.expiresInSeconds).toBe(0);

    // When the applicant still tries to check a typed code.
    act(() => result.current.setCode("123456"));
    await act(async () => result.current.verify());

    // Then no request leaves and the expiry is not turned into an alert.
    expect(fixture.client.verify).not.toHaveBeenCalled();
    expect(result.current.errorMessage).toBeNull();
    expect(result.current.challengeMessage).toBeNull();
  });

  it("should treat a server-confirmed expiry as an expired code instead of an alert", async () => {
    // Given a code the browser still counts as valid but the server already expired.
    const fixture = expiredFixture();
    fixture.expired.expiresAt = new Date(Date.now() + ADMISSION_LIMIT.verificationCodeValidityMs).toISOString();
    vi.mocked(fixture.client.verify).mockResolvedValueOnce({ status: "failed", code: "challenge_expired", message: ADMISSION_ERROR_MESSAGE.challenge_expired, uncertain: false });
    const { result } = await renderExpired(fixture);

    // When the check is rejected as expired.
    act(() => result.current.setCode("123456"));
    await act(async () => result.current.verify());

    // Then the step counts the code as expired, with no alert, so its resend becomes the next action.
    expect(result.current.expiresInSeconds).toBe(0);
    expect(result.current.errorMessage).toBeNull();
    expect(result.current.challengeMessage).toBeNull();
  });

  it("should switch to the replacement challenge after a confirmed resend without reloading", async () => {
    // Given an expired code and a consented resend.
    const fixture = expiredFixture();
    const { result } = await renderExpired(fixture);

    // When the resend is confirmed by the server.
    await act(async () => result.current.resend());

    // Then the replacement is current: a new countdown, an empty code and no stale message.
    expect(result.current.challenge?.challengeId).toBe(fixture.replacement.challengeId);
    expect(result.current.expiresInSeconds).toBeGreaterThan(0);
    expect(result.current.code).toBe("");
    expect(result.current.errorMessage).toBeNull();
    expect(result.current.pending).toBeNull();
    expect(fixture.client.resend).toHaveBeenCalledWith("synthetic-academy", fixture.expired.challengeId, { operationId: expect.any(String), confirmed: true }, expect.any(AbortSignal));
  });

  it("should read the original once when the resend answer is lost and adopt the new code it registered", async () => {
    // Given a resend the server committed although its answer never reached the browser.
    const fixture = expiredFixture();
    vi.mocked(fixture.client.resend).mockResolvedValueOnce({ status: "failed", code: "operation_unresolved", message: ADMISSION_ERROR_MESSAGE.operation_unresolved, uncertain: true });
    vi.mocked(fixture.client.operation).mockImplementation(async (_slug, operationId) => ({ status: "ready", value: { type: "resend_contact_challenge", state: "completed", operationId, replayed: true, result: fixture.replacement } }));
    const { result } = await renderExpired(fixture);

    // When the applicant resends the expired code.
    await act(async () => result.current.resend());

    // Then one read of that original shows the replacement without a reload and without another send.
    await waitFor(() => expect(result.current.challenge?.challengeId).toBe(fixture.replacement.challengeId));
    expect(result.current.expiresInSeconds).toBeGreaterThan(0);
    expect(result.current.pending).toBeNull();
    expect(result.current.phase).toBe("idle");
    expect(result.current.errorMessage).toBeNull();
    const resentOperationId = vi.mocked(fixture.client.resend).mock.calls[0][2].operationId;
    expect(fixture.client.operation).toHaveBeenCalledExactlyOnceWith("synthetic-academy", resentOperationId, expect.any(AbortSignal));
    expect(fixture.client.resend).toHaveBeenCalledTimes(1);
  });

  it("should read the original once when the resend outlives the browser deadline and adopt the code it registered", async () => {
    // Given a resend the server commits but whose answer arrives after the browser deadline.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const fixture = expiredFixture();
      vi.mocked(fixture.client.resend).mockImplementationOnce((_slug, _challengeId, _input, signal) => new Promise((resolve) => signal.addEventListener("abort", () => resolve({ status: "aborted" }), { once: true })));
      vi.mocked(fixture.client.operation).mockImplementation(async (_slug, operationId) => ({ status: "ready", value: { type: "resend_contact_challenge", state: "completed", operationId, replayed: true, result: fixture.replacement } }));
      const { result } = await renderExpired(fixture);

      // When the deadline aborts the pending resend.
      let resending!: Promise<void>;
      act(() => { resending = result.current.resend(); });
      await waitFor(() => expect(fixture.client.resend).toHaveBeenCalledTimes(1));
      await act(async () => { await vi.advanceTimersByTimeAsync(ADMISSION_CONTACT_BROWSER_TIMEOUT_MS); await resending; });

      // Then that original is read once and its new code replaces the expired one without another send.
      await waitFor(() => expect(result.current.challenge?.challengeId).toBe(fixture.replacement.challengeId));
      expect(result.current.pending).toBeNull();
      expect(result.current.errorMessage).toBeNull();
      expect(fixture.client.operation).toHaveBeenCalledTimes(1);
      expect(fixture.client.resend).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });

  it("should keep the explicit recovery when the lost resend is still absent from the registry", async () => {
    // Given a lost answer whose original the registry does not show yet.
    const fixture = expiredFixture();
    vi.mocked(fixture.client.resend).mockResolvedValueOnce({ status: "aborted" });
    vi.mocked(fixture.client.operation).mockResolvedValue({ status: "failed", code: "resource_unavailable", message: ADMISSION_ERROR_MESSAGE.resource_unavailable, uncertain: false });
    const { result } = await renderExpired(fixture);

    // When the resend ends without an answer.
    await act(async () => result.current.resend());

    // Then the original stays pending with its safe explanation, after a single read and no second send.
    await waitFor(() => expect(result.current.errorMessage).toBe(ADMISSION_CONTACT_COPY.absent));
    expect(result.current.phase).toBe("uncertain");
    expect(result.current.pending?.kind).toBe("resend");
    expect(result.current.challenge?.challengeId).toBe(fixture.expired.challengeId);
    expect(fixture.client.operation).toHaveBeenCalledTimes(1);
    expect(fixture.client.resend).toHaveBeenCalledTimes(1);
  });
});
