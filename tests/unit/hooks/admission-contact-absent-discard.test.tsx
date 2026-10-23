/** Exercises the bounded exit for an uncertain contact write whose original never registered, through own browser ports only. @module admission-contact-absent-discard-tests */
import { randomUUID } from "node:crypto";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAdmissionContactVerification } from "@/hooks/use-admission-contact-verification";
import { readAdmissionContactIntent, writeAdmissionContactIntent } from "@/lib/academy-admissions/admission-contact-intent";
import type { AdmissionContactBrowserClient } from "@/src/modules/academy-admissions/application/ports/admission-contact-browser-client";
import type { AdmissionChallengeSnapshot } from "@/src/modules/academy-admissions/domain/repositories/admission-contact-verification";
import { ADMISSION_CONTACT_ABSENT_DISCARD_AFTER_MS, ADMISSION_CONTACT_CLOCK_INTERVAL_MS, ADMISSION_CONTACT_COPY } from "@/src/modules/academy-admissions/constants/admission-contact-browser";

afterEach(() => { window.sessionStorage.clear(); vi.useRealTimers(); });

/** The hook's clock ticks once per second, so a wait must outlast at least one late tick on a slow runner. */
const CLOCK_TICK_WAIT = { timeout: ADMISSION_CONTACT_CLOCK_INTERVAL_MS * 4 };

/** Moves only the wall clock past the discard wait; the hook's own one-second clock picks it up. */
function passDiscardWait() { vi.setSystemTime(new Date(Date.now() + ADMISSION_CONTACT_ABSENT_DISCARD_AFTER_MS + 1)); }

/** Supplies own transport/authorization doubles; the registry answers 404 until a test says otherwise. */
function discardFixture() {
  const now = Date.now();
  const challenge: AdmissionChallengeSnapshot = { challengeId: randomUUID(), purpose: "admission", channel: "email", maskedDestination: "a•••@example.test", expiresAt: new Date(now + 600_000).toISOString(), resendAllowedAt: new Date(now + 60_000).toISOString(), deliveryState: "queued" };
  const client: AdmissionContactBrowserClient = {
    current: vi.fn<AdmissionContactBrowserClient["current"]>(async () => ({ status: "ready", value: { current: null } })),
    issue: vi.fn<AdmissionContactBrowserClient["issue"]>(async () => ({ status: "failed", code: "dependency_unavailable", message: "La respuesta no llegó.", uncertain: true })),
    verify: vi.fn<AdmissionContactBrowserClient["verify"]>(), resend: vi.fn<AdmissionContactBrowserClient["resend"]>(), apply: vi.fn<AdmissionContactBrowserClient["apply"]>(),
    operation: vi.fn<AdmissionContactBrowserClient["operation"]>(async () => ({ status: "failed", code: "resource_unavailable", message: "La operación no está disponible.", uncertain: false })),
    delivery: vi.fn<AdmissionContactBrowserClient["delivery"]>(),
  };
  const options = { viewerId: randomUUID(), slug: "synthetic-academy", requestId: null, requestVersion: null, policyVersion: 1, channel: "email" as const, allowedCountries: [] as readonly string[], allowSmsAlternative: false, phone: "", country: "", enabled: true, renderedAt: new Date(now).toISOString(), authorize: vi.fn(async () => true), client, onApplied: vi.fn(), onProof: vi.fn() };
  return { challenge, client, options };
}

describe("contact original confirmed absent", () => {
  it("should offer discarding only after the wait, re-read the original first and let a new confirmation request another code with a new reference", async () => {
    const fixture = discardFixture();
    const { result } = renderHook(() => useAdmissionContactVerification(fixture.options));
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => result.current.setConfirmed(true));
    await act(async () => { await result.current.issue(); });
    const original = vi.mocked(fixture.client.issue).mock.calls[0][1].operationId;
    expect(readAdmissionContactIntent(fixture.options.viewerId, fixture.options.slug, null)?.pending).toMatchObject({ kind: "issue", operationId: original, startedAt: expect.any(String) });

    // The uncertain send already read its original once and found it absent.
    expect(fixture.client.operation).toHaveBeenCalledTimes(1);
    expect(result.current.errorMessage).toBe(ADMISSION_CONTACT_COPY.absent);
    await act(async () => { await result.current.readOriginal(); });
    expect(result.current.errorMessage).toBe(ADMISSION_CONTACT_COPY.absent);
    expect(result.current.canDiscardAbsent).toBe(false);
    await act(async () => { await result.current.discardAbsent(); });
    expect(fixture.client.operation).toHaveBeenCalledTimes(2);
    expect(result.current.pending?.operationId).toBe(original);

    passDiscardWait();
    await waitFor(() => expect(result.current.canDiscardAbsent).toBe(true), CLOCK_TICK_WAIT);
    expect(result.current.errorMessage).toBe(ADMISSION_CONTACT_COPY.absentDiscardable);
    await act(async () => { await result.current.discardAbsent(); });
    expect(fixture.client.operation).toHaveBeenCalledTimes(3);
    expect(result.current.pending).toBeNull();
    expect(result.current.phase).toBe("idle");
    expect(result.current.confirmed).toBe(false);
    expect(result.current.feedback).toBe(ADMISSION_CONTACT_COPY.discarded);
    expect(result.current.canDiscardAbsent).toBe(false);
    expect(readAdmissionContactIntent(fixture.options.viewerId, fixture.options.slug, null)?.pending).toBeNull();
    expect(fixture.client.issue).toHaveBeenCalledTimes(1);

    vi.mocked(fixture.client.issue).mockImplementationOnce(async (_slug, input) => ({ status: "ready", value: { state: "completed", operationId: input.operationId, replayed: false, result: fixture.challenge } }));
    act(() => result.current.setConfirmed(true));
    await act(async () => { await result.current.issue(); });
    expect(fixture.client.issue).toHaveBeenCalledTimes(2);
    expect(vi.mocked(fixture.client.issue).mock.calls[1][1].operationId).not.toBe(original);
    expect(result.current.challenge?.challengeId).toBe(fixture.challenge.challengeId);
  });

  it("should keep the reference and recover the original when it appears during the discard read", async () => {
    const fixture = discardFixture();
    const { result } = renderHook(() => useAdmissionContactVerification(fixture.options));
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => result.current.setConfirmed(true));
    await act(async () => { await result.current.issue(); });
    await act(async () => { await result.current.readOriginal(); });
    passDiscardWait();
    await waitFor(() => expect(result.current.canDiscardAbsent).toBe(true), CLOCK_TICK_WAIT);

    vi.mocked(fixture.client.operation).mockImplementationOnce(async (_slug, operationId) => ({ status: "ready", value: { type: "issue_contact_challenge", state: "completed", operationId, replayed: true, result: fixture.challenge } }));
    await act(async () => { await result.current.discardAbsent(); });
    expect(result.current.challenge?.challengeId).toBe(fixture.challenge.challengeId);
    expect(result.current.pending).toBeNull();
    expect(result.current.feedback).not.toBe(ADMISSION_CONTACT_COPY.discarded);
    expect(fixture.client.issue).toHaveBeenCalledTimes(1);
  });

  it("should not offer discarding after transport uncertainty without a confirmed absence", async () => {
    const fixture = discardFixture();
    vi.mocked(fixture.client.operation).mockResolvedValue({ status: "failed", code: "dependency_unavailable", message: "La consulta no respondió.", uncertain: true });
    const { result } = renderHook(() => useAdmissionContactVerification(fixture.options));
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => result.current.setConfirmed(true));
    await act(async () => { await result.current.issue(); });
    await act(async () => { await result.current.readOriginal(); });
    passDiscardWait();
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 1_100)); });
    expect(result.current.canDiscardAbsent).toBe(false);
    expect(result.current.errorMessage).toBe(ADMISSION_CONTACT_COPY.uncertain);
    expect(result.current.pending).not.toBeNull();
  });

  it("should count the wait from the first observed absence when a restored reference predates the dispatch instant", async () => {
    const fixture = discardFixture(), operationId = randomUUID();
    writeAdmissionContactIntent({ viewerId: fixture.options.viewerId, slug: fixture.options.slug, requestId: null, issuedOperationId: null, verifiedOperationId: null, pending: { kind: "issue", operationId } });
    const { result } = renderHook(() => useAdmissionContactVerification(fixture.options));
    await waitFor(() => expect(result.current.errorMessage).toBe(ADMISSION_CONTACT_COPY.absent));
    expect(result.current.recoveryRequired).toBe(true);
    expect(result.current.canDiscardAbsent).toBe(false);

    passDiscardWait();
    await waitFor(() => expect(result.current.canDiscardAbsent).toBe(true), CLOCK_TICK_WAIT);
    await act(async () => { await result.current.discardAbsent(); });
    expect(result.current.pending).toBeNull();
    expect(result.current.recoveryRequired).toBe(false);
    expect(result.current.ready).toBe(true);
    expect(fixture.client.issue).not.toHaveBeenCalled();
  });
});
