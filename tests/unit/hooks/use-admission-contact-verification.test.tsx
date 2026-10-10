/** Exercises original contact workflow ownership through own browser ports without replacing UI, auth or platform libraries. @module admission-contact-verification-hook-tests */
import { randomUUID } from "node:crypto";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAdmissionContactVerification } from "@/hooks/use-admission-contact-verification";
import type { AdmissionContactBrowserClient, AdmissionContactBrowserResult } from "@/src/modules/academy-admissions/application/ports/admission-contact-browser-client";
import type { AdmissionOperationResult } from "@/src/modules/academy-admissions/domain/entities/admission-operation";
import type { AdmissionChallengeSnapshot } from "@/src/modules/academy-admissions/domain/repositories/admission-contact-verification";
import { writeAdmissionContactIntent } from "@/lib/academy-admissions/admission-contact-intent";
import { ADMISSION_CONTACT_BROWSER_TIMEOUT_MS } from "@/src/modules/academy-admissions/constants/admission-contact-browser";

afterEach(() => { window.sessionStorage.clear(); vi.useRealTimers(); });

/** Exhausts real browser storage without replacing a platform library; existing references stay intact. */
function exhaustStorageQuota() {
  let storageIndex = 0;
  for (const chunkSize of [1_000_000, 100_000, 1_000, 100, 1]) {
    let filled = false;
    while (!filled) {
      try { sessionStorage.setItem(`quota-${storageIndex}`, "x".repeat(chunkSize)); storageIndex += 1; }
      catch { filled = true; }
    }
  }
}

/** Supplies only own transport/authorization callbacks and native-looking original metadata. */
function hookFixture() {
  const now = Date.now(), challengeId = randomUUID(), proofId = randomUUID();
  const challenge: AdmissionChallengeSnapshot = { challengeId, purpose: "admission", channel: "email", maskedDestination: "a•••@example.test", expiresAt: new Date(now + 600_000).toISOString(), resendAllowedAt: new Date(now + 60_000).toISOString(), deliveryState: "queued" };
  const client: AdmissionContactBrowserClient = {
    issue: vi.fn<AdmissionContactBrowserClient["issue"]>(async (_slug, input) => ({ status: "ready", value: { state: "completed", operationId: input.operationId, replayed: false, result: challenge } })),
    verify: vi.fn<AdmissionContactBrowserClient["verify"]>(async (_slug, _challenge, input) => ({ status: "ready", value: { state: "completed", operationId: input.operationId, replayed: false, result: { purpose: "admission", result: "verified", proofId, applyBefore: new Date(now + 900_000).toISOString() } } })),
    resend: vi.fn<AdmissionContactBrowserClient["resend"]>(), apply: vi.fn<AdmissionContactBrowserClient["apply"]>(),
    operation: vi.fn<AdmissionContactBrowserClient["operation"]>(async () => ({ status: "failed", code: "resource_unavailable", message: "La operación no está disponible.", uncertain: false })),
    delivery: vi.fn<AdmissionContactBrowserClient["delivery"]>(),
  };
  const options = { viewerId: randomUUID(), slug: "synthetic-academy", requestId: null, requestVersion: null, policyVersion: 1, channel: "email" as const, allowedCountries: [] as readonly string[], allowSmsAlternative: false, phone: "", country: "", enabled: true, renderedAt: new Date(now).toISOString(), authorize: vi.fn(async () => true), client, onApplied: vi.fn(), onProof: vi.fn() };
  return { now, challenge, proofId, client, options };
}

describe("contact verification workflow hook", () => {
  it("should preserve all proof references when partial restoration fails and recover the checked proof on the next readonly attempt", async () => {
    const fixture = hookFixture(), issuedOperationId = randomUUID(), verifiedOperationId = randomUUID();
    writeAdmissionContactIntent({ viewerId: fixture.options.viewerId, slug: fixture.options.slug, requestId: null, issuedOperationId, verifiedOperationId, pending: null });
    let verificationReads = 0;
    vi.mocked(fixture.client.operation).mockImplementation(async (_slug, operationId) => {
      if (operationId === issuedOperationId) return { status: "ready", value: { type: "issue_contact_challenge", state: "completed", operationId, replayed: true, result: fixture.challenge } };
      verificationReads++;
      if (verificationReads === 1) return { status: "failed", code: "dependency_unavailable", message: "No pudimos consultar la prueba.", uncertain: false };
      return { status: "ready", value: { type: "verify_contact_challenge", state: "completed", operationId, replayed: true, result: { purpose: "admission", result: "verified", proofId: fixture.proofId, applyBefore: new Date(fixture.now + 900_000).toISOString() } } };
    });
    const { result } = renderHook(() => useAdmissionContactVerification(fixture.options));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.proof).toBeNull();
    expect(window.sessionStorage.getItem(window.sessionStorage.key(0)!)).toContain(verifiedOperationId);
    await act(async () => { await result.current.readOriginal(); });
    expect(result.current.proof?.proofId).toBe(fixture.proofId);
    expect(verificationReads).toBe(2);
    expect(fixture.client.issue).not.toHaveBeenCalled();
    expect(fixture.client.verify).not.toHaveBeenCalled();
  });

  it("should keep current recovery blocked through a deferred failed GET and allow only a readonly retry", async () => {
    const fixture = hookFixture(), previousRequestId = randomUUID(), oldOperationId = randomUUID(), issuedOperationId = randomUUID();
    writeAdmissionContactIntent({ viewerId: fixture.options.viewerId, slug: fixture.options.slug, requestId: null, issuedOperationId: null, verifiedOperationId: null, pending: { kind: "issue", operationId: oldOperationId } });
    writeAdmissionContactIntent({ viewerId: fixture.options.viewerId, slug: fixture.options.slug, requestId: null, previousRequestId, issuedOperationId, verifiedOperationId: null, pending: null });
    let finishCurrent!: () => void;
    vi.mocked(fixture.client.operation).mockImplementationOnce(async () => ({ status: "ready", value: { type: "issue_contact_challenge", state: "completed", operationId: oldOperationId, replayed: true, result: fixture.challenge } }));
    vi.mocked(fixture.client.operation).mockImplementationOnce(() => new Promise((resolve) => { finishCurrent = () => resolve({ status: "failed", code: "dependency_unavailable", message: "No pudimos consultar la operación.", uncertain: false }); }));
    vi.mocked(fixture.client.operation).mockImplementationOnce(async () => ({ status: "ready", value: { type: "issue_contact_challenge", state: "completed", operationId: issuedOperationId, replayed: true, result: fixture.challenge } }));
    const { result, unmount } = renderHook(() => useAdmissionContactVerification({ ...fixture.options, previousRequestId }));
    await waitFor(() => expect(result.current.ready).toBe(true));
    let reading!: Promise<void>;
    act(() => { reading = result.current.readOriginal(); });
    try {
      await waitFor(() => expect(fixture.client.operation).toHaveBeenCalledTimes(2));
      expect(result.current.ready).toBe(false);
      await act(async () => { finishCurrent(); await reading; });
      expect(result.current.challenge).toBeNull();
      act(() => result.current.setConfirmed(true));
      await act(async () => { await result.current.issue(); });
      expect(fixture.client.issue).not.toHaveBeenCalled();
      await act(async () => { await result.current.readOriginal(); });
      expect(fixture.client.operation).toHaveBeenCalledTimes(3);
      expect(result.current.challenge?.challengeId).toBe(fixture.challenge.challengeId);
      expect(fixture.client.issue).not.toHaveBeenCalled();
    } finally { if (result.current.phase === "reading") await act(async () => { finishCurrent(); await reading; }); unmount(); }
  });

  it("should retain an earlier uncertain original when readonly recovery returns another operation namespace", async () => {
    const fixture = hookFixture(), previousRequestId = randomUUID(), operationId = randomUUID();
    writeAdmissionContactIntent({ viewerId: fixture.options.viewerId, slug: fixture.options.slug, requestId: null, issuedOperationId: null, verifiedOperationId: null, pending: { kind: "issue", operationId } });
    vi.mocked(fixture.client.operation).mockResolvedValue({ status: "ready", value: { type: "cancel_admission_request", state: "completed", operationId, replayed: true, result: { admissionRequestId: randomUUID(), status: "cancelled", version: 2 } } });
    const { result } = renderHook(() => useAdmissionContactVerification({ ...fixture.options, previousRequestId }));
    await waitFor(() => expect(result.current.ready).toBe(true));
    await act(async () => { await result.current.readOriginal(); });
    expect(result.current.pending?.operationId).toBe(operationId);
    expect(result.current.phase).toBe("uncertain");
    expect(result.current.challenge).toBeNull();
    expect(fixture.client.issue).not.toHaveBeenCalled();
  });

  it("should restore the current presentation original after settling an earlier one without issuing another code", async () => {
    const fixture = hookFixture(), previousRequestId = randomUUID(), oldOperationId = randomUUID(), issuedOperationId = randomUUID();
    writeAdmissionContactIntent({ viewerId: fixture.options.viewerId, slug: fixture.options.slug, requestId: null, issuedOperationId: null, verifiedOperationId: null, pending: { kind: "issue", operationId: oldOperationId } });
    writeAdmissionContactIntent({ viewerId: fixture.options.viewerId, slug: fixture.options.slug, requestId: null, previousRequestId, issuedOperationId, verifiedOperationId: null, pending: null });
    vi.mocked(fixture.client.operation).mockImplementation(async (_slug, operationId) => ({ status: "ready", value: { type: "issue_contact_challenge", state: "completed", operationId, replayed: true, result: fixture.challenge } }));
    const { result } = renderHook(() => useAdmissionContactVerification({ ...fixture.options, previousRequestId }));
    await waitFor(() => expect(result.current.ready).toBe(true));
    await act(async () => { await result.current.readOriginal(); });
    expect(result.current.pending).toBeNull();
    expect(result.current.challenge?.challengeId).toBe(fixture.challenge.challengeId);
    expect(fixture.client.operation).toHaveBeenCalledTimes(2);
    expect(fixture.client.issue).not.toHaveBeenCalled();
  });

  it("should block a new presentation while an earlier original is uncertain and settle it only by readonly lookup", async () => {
    const fixture = hookFixture(), previousRequestId = randomUUID(), operationId = randomUUID();
    const previous = { viewerId: fixture.options.viewerId, slug: fixture.options.slug, requestId: null, issuedOperationId: null, verifiedOperationId: null, pending: { kind: "issue" as const, operationId } };
    writeAdmissionContactIntent(previous);
    vi.mocked(fixture.client.operation).mockImplementationOnce(async () => ({ status: "ready", value: { type: "issue_contact_challenge", state: "started", operationId } }));
    vi.mocked(fixture.client.operation).mockImplementationOnce(async () => ({ status: "ready", value: { type: "issue_contact_challenge", state: "completed", operationId, replayed: true, result: fixture.challenge } }));
    const { result } = renderHook(() => useAdmissionContactVerification({ ...fixture.options, previousRequestId }));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.pending?.operationId).toBe(operationId);
    act(() => result.current.setConfirmed(true));
    await act(async () => { await result.current.issue(); });
    expect(fixture.client.issue).not.toHaveBeenCalled();
    await act(async () => { await result.current.readOriginal(); });
    expect(result.current.pending?.operationId).toBe(operationId);
    expect(result.current.challenge).toBeNull();
    await act(async () => { await result.current.readOriginal(); });
    expect(result.current.pending).toBeNull();
    expect(result.current.challenge).toBeNull();
    expect(result.current.proof).toBeNull();
    expect(result.current.confirmed).toBe(false);
    expect(fixture.client.issue).not.toHaveBeenCalled();
    expect(fixture.client.operation).toHaveBeenCalledTimes(2);
  });

  it("should restore only the new presentation lineage while retaining an earlier completed original", async () => {
    const fixture = hookFixture(), previousRequestId = randomUUID(), oldOperationId = randomUUID(), issuedOperationId = randomUUID();
    writeAdmissionContactIntent({ viewerId: fixture.options.viewerId, slug: fixture.options.slug, requestId: null, issuedOperationId: oldOperationId, verifiedOperationId: null, pending: null });
    writeAdmissionContactIntent({ viewerId: fixture.options.viewerId, slug: fixture.options.slug, requestId: null, previousRequestId, issuedOperationId, verifiedOperationId: null, pending: null });
    vi.mocked(fixture.client.operation).mockImplementation(async (_slug, operationId) => ({ status: "ready", value: { type: "issue_contact_challenge", state: "completed", operationId, replayed: true, result: fixture.challenge } }));
    const { result } = renderHook(() => useAdmissionContactVerification({ ...fixture.options, previousRequestId }));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(fixture.client.operation).toHaveBeenCalledExactlyOnceWith(fixture.options.slug, issuedOperationId, expect.any(AbortSignal));
    expect(result.current.challenge?.challengeId).toBe(fixture.challenge.challengeId);
    expect(result.current.confirmed).toBe(false);
    expect(fixture.client.issue).not.toHaveBeenCalled();
    expect(fixture.client.verify).not.toHaveBeenCalled();
    expect(result.current.pending).toBeNull();
    expect(window.sessionStorage.length).toBe(2);
  });

  it.each(["verification_code_incorrect", "usage_limit_reached", "dependency_unavailable"] as const)("should keep local verification available after a confirmed nonterminal %s", async (failureCode) => {
    const fixture = hookFixture();
    vi.mocked(fixture.client.verify).mockImplementationOnce(async () => ({ status: "failed", code: failureCode, message: "No se confirmó la comprobación de este código.", uncertain: false }));
    const { result } = renderHook(() => useAdmissionContactVerification(fixture.options));
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => result.current.setConfirmed(true));
    await act(async () => { await result.current.issue(); });
    act(() => result.current.setCode("123456"));
    await act(async () => { await result.current.verify(); });
    expect(result.current.challengeUnavailable).toBe(false);
    act(() => result.current.setCode("654321"));
    await act(async () => { await result.current.verify(); });
    expect(fixture.client.verify).toHaveBeenCalledTimes(2);
    expect(result.current.proof?.proofId).toBe(fixture.proofId);
  });

  it("should preserve an uncertain original without treating its unconfirmed terminal code as challenge authority", async () => {
    const fixture = hookFixture();
    vi.mocked(fixture.client.verify).mockImplementationOnce(async (_slug, _challengeId, input) => ({ status: "failed", code: "challenge_invalidated", message: "El resultado de comprobación todavía es incierto.", uncertain: true, operation: { operationId: input.operationId, state: "started" } }));
    const { result } = renderHook(() => useAdmissionContactVerification(fixture.options));
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => result.current.setConfirmed(true));
    await act(async () => { await result.current.issue(); });
    act(() => result.current.setCode("123456"));
    await act(async () => { await result.current.verify(); });
    expect(result.current.challengeUnavailable).toBe(false);
    expect(result.current.challengeMessage).toBeNull();
    expect(result.current.pending?.kind).toBe("verify");
    expect(result.current.proof).toBeNull();
    act(() => result.current.setCode("654321"));
    await act(async () => { await result.current.verify(); });
    expect(fixture.client.verify).toHaveBeenCalledTimes(1);
  });

  it.each(["verification_attempts_exceeded", "challenge_expired", "challenge_invalidated"] as const)("should stop another local verification after the server confirms %s until a new challenge arrives", async (failureCode) => {
    const fixture = hookFixture();
    vi.mocked(fixture.client.verify).mockImplementationOnce(async (_slug, _challengeId, input) => ({ status: "failed", code: failureCode, message: "El código anterior ya no puede comprobarse.", uncertain: false, operation: { operationId: input.operationId, state: "completed" } }));
    const { result } = renderHook(() => useAdmissionContactVerification(fixture.options));
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => result.current.setConfirmed(true));
    await act(async () => { await result.current.issue(); });
    act(() => result.current.setCode("123456"));
    await act(async () => { await result.current.verify(); });
    expect(fixture.client.verify).toHaveBeenCalledTimes(1);
    const authorizationCalls = fixture.options.authorize.mock.calls.length;
    act(() => result.current.setCode("654321"));
    await act(async () => { await result.current.verify(); });
    expect(fixture.client.verify).toHaveBeenCalledTimes(1);
    expect(fixture.options.authorize).toHaveBeenCalledTimes(authorizationCalls);
    expect(result.current.proof).toBeNull();
    expect(result.current.challengeUnavailable).toBe(true);
  });

  it("should keep a confirmed terminal challenge blocked until the explicit replacement commits", async () => {
    const fixture = hookFixture(), replacement = { ...fixture.challenge, challengeId: randomUUID() };
    fixture.challenge.resendAllowedAt = new Date(fixture.now - 1).toISOString();
    vi.mocked(fixture.client.verify).mockImplementationOnce(async (_slug, _challengeId, input) => ({ status: "failed", code: "verification_attempts_exceeded", message: "Alcanzaste el límite de intentos de verificación. Esperá antes de intentar otra vez.", uncertain: false, operation: { operationId: input.operationId, state: "completed" } }));
    let finishResend!: () => void;
    vi.mocked(fixture.client.resend).mockImplementation((_slug, _challengeId, input) => new Promise((resolve) => { finishResend = () => resolve({ status: "ready", value: { state: "completed", operationId: input.operationId, replayed: false, result: replacement } }); }));
    const { result, unmount } = renderHook(() => useAdmissionContactVerification(fixture.options));
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => result.current.setConfirmed(true));
    await act(async () => { await result.current.issue(); });
    act(() => result.current.setCode("123456"));
    await act(async () => { await result.current.verify(); });
    expect(result.current.challengeUnavailable).toBe(true);
    let resending!: Promise<void>;
    act(() => { resending = result.current.resend(); });
    try {
      await waitFor(() => expect(fixture.client.resend).toHaveBeenCalledTimes(1));
      expect(result.current.challengeUnavailable).toBe(true);
      expect(result.current.challengeMessage).toBeNull();
      await act(async () => { finishResend(); await resending; });
      expect(result.current.challengeUnavailable).toBe(false);
      expect(result.current.challenge?.challengeId).toBe(replacement.challengeId);
      expect(result.current.code).toBe("");
      act(() => result.current.setCode("654321"));
      await act(async () => { await result.current.verify(); });
      expect(fixture.client.verify).toHaveBeenCalledTimes(2);
      expect(result.current.proof?.proofId).toBe(fixture.proofId);
    } finally { if (result.current.phase === "resending") await act(async () => { finishResend(); await resending; }); unmount(); }
  });

  it("should recover a terminal verification denial from its original without another POST or a proof", async () => {
    const fixture = hookFixture(), issuedOperationId = randomUUID(), verifiedOperationId = randomUUID();
    writeAdmissionContactIntent({ viewerId: fixture.options.viewerId, slug: fixture.options.slug, requestId: null, issuedOperationId, verifiedOperationId: null, pending: { kind: "verify", operationId: verifiedOperationId, challengeId: fixture.challenge.challengeId } });
    vi.mocked(fixture.client.operation).mockImplementation(async (_slug, operationId) => ({ status: "ready", value: operationId === issuedOperationId ? { type: "issue_contact_challenge", state: "completed", operationId, replayed: true, result: fixture.challenge } : { type: "verify_contact_challenge", state: "completed", operationId, replayed: true, result: { purpose: "admission", result: "denied", code: "challenge_invalidated" } } }));
    const { result } = renderHook(() => useAdmissionContactVerification(fixture.options));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.challengeUnavailable).toBe(true);
    expect(result.current.challengeMessage).toBe("Ese código ya no está vigente. Consultá el estado antes de pedir otro.");
    expect(result.current.proof).toBeNull();
    expect(fixture.client.issue).not.toHaveBeenCalled();
    expect(fixture.client.verify).not.toHaveBeenCalled();
    act(() => result.current.setCode("123456"));
    await act(async () => { await result.current.verify(); });
    expect(fixture.client.verify).not.toHaveBeenCalled();
  });

  it("should block dispatch on actual storage quota failure and allow an explicit retry after capacity is restored", async () => {
    const fixture = hookFixture(), { result } = renderHook(() => useAdmissionContactVerification(fixture.options));
    await waitFor(() => expect(result.current.ready).toBe(true));
    exhaustStorageQuota();
    act(() => result.current.setConfirmed(true));
    await act(async () => { await result.current.issue(); });
    expect(fixture.client.issue).not.toHaveBeenCalled(); expect(result.current.pending).toBeNull();
    expect(result.current.phase).toBe("idle"); expect(result.current.ready).toBe(true);
    expect(result.current.errorMessage).toMatch(/conservar la operación/i);
    sessionStorage.clear();
    await act(async () => { await result.current.issue(); });
    expect(fixture.client.issue).toHaveBeenCalledOnce(); expect(result.current.challenge?.challengeId).toBe(fixture.challenge.challengeId);
  });

  it("should keep the original reference in memory when storage is cleared and fills during an accepted issuance", async () => {
    const fixture = hookFixture(); let operationId = "";
    vi.mocked(fixture.client.issue).mockImplementation(async (_slug, input) => {
      operationId = input.operationId; sessionStorage.clear(); exhaustStorageQuota();
      return { status: "ready", value: { state: "completed", operationId, replayed: false, result: fixture.challenge } };
    });
    const { result } = renderHook(() => useAdmissionContactVerification(fixture.options));
    await waitFor(() => expect(result.current.ready).toBe(true)); act(() => result.current.setConfirmed(true));
    await act(async () => { await result.current.issue(); });
    expect(result.current.phase).toBe("uncertain"); expect(result.current.pending?.operationId).toBe(operationId); expect(result.current.challenge).toBeNull();
    for (let index = sessionStorage.length - 1; index >= 0; index -= 1) { const key = sessionStorage.key(index)!; if (key.startsWith("quota-")) sessionStorage.removeItem(key); }
    vi.mocked(fixture.client.operation).mockResolvedValue({ status: "ready", value: { type: "issue_contact_challenge", state: "completed", operationId, replayed: true, result: fixture.challenge } });
    await act(async () => { await result.current.readOriginal(); });
    expect(result.current.challenge?.challengeId).toBe(fixture.challenge.challengeId); expect(fixture.client.issue).toHaveBeenCalledOnce();
  });

  it("should keep restore observable if storage is removed and fills during the original GET", async () => {
    const fixture = hookFixture(), operationId = randomUUID();
    writeAdmissionContactIntent({ viewerId: fixture.options.viewerId, slug: fixture.options.slug, requestId: null, issuedOperationId: null, verifiedOperationId: null, pending: { kind: "issue", operationId } });
    vi.mocked(fixture.client.operation).mockImplementation(async () => { sessionStorage.clear(); exhaustStorageQuota(); return { status: "ready", value: { type: "issue_contact_challenge", state: "completed", operationId, replayed: true, result: fixture.challenge } }; });
    const { result } = renderHook(() => useAdmissionContactVerification(fixture.options));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.phase).toBe("uncertain"); expect(result.current.pending?.operationId).toBe(operationId);
    expect(result.current.challenge).toBeNull(); expect(fixture.client.issue).not.toHaveBeenCalled();
  });

  it("should require a personal scope and send the proposal only on explicit issue without persisting its token", async () => {
    const fixture = hookFixture(), invitationToken = "synthetic-personal-proposal", personalScope = "a".repeat(64);
    const { result } = renderHook(() => useAdmissionContactVerification({ ...fixture.options, invitationToken, personalScope }));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(fixture.client.issue).not.toHaveBeenCalled();
    act(() => result.current.setConfirmed(true));
    await act(async () => { await result.current.issue(); });
    expect(fixture.client.issue).toHaveBeenCalledExactlyOnceWith(fixture.options.slug, expect.objectContaining({ invitationToken, confirmed: true }), expect.any(AbortSignal));
    const records = Array.from({ length: window.sessionStorage.length }, (_, index) => window.sessionStorage.getItem(window.sessionStorage.key(index)!)).join("");
    expect(records).toContain(personalScope);
    expect(records).not.toContain(invitationToken);
    expect(records).not.toContain('"confirmed"');
  });

  it("should block a personal issue when the proposal lacks its isolated recovery scope", async () => {
    const fixture = hookFixture(), { result } = renderHook(() => useAdmissionContactVerification({ ...fixture.options, invitationToken: "synthetic-personal-proposal" }));
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => result.current.setConfirmed(true));
    await act(async () => { await result.current.issue(); });
    expect(fixture.client.issue).not.toHaveBeenCalled();
    expect(window.sessionStorage.length).toBe(0);
    expect(result.current.errorMessage).toMatch(/conservar la operación/i);
  });

  it("should avoid restoring common challenge or proof references in a personal proposal", async () => {
    const fixture = hookFixture();
    writeAdmissionContactIntent({ viewerId: fixture.options.viewerId, slug: fixture.options.slug, requestId: null, issuedOperationId: randomUUID(), verifiedOperationId: randomUUID(), pending: null });
    const { result } = renderHook(() => useAdmissionContactVerification({ ...fixture.options, invitationToken: "synthetic-personal-proposal", personalScope: "a".repeat(64) }));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(fixture.client.operation).not.toHaveBeenCalled();
    expect(fixture.client.issue).not.toHaveBeenCalled();
    expect(result.current.proof).toBeNull();
    expect(result.current.challenge).toBeNull();
  });

  it("should abort an old personal proposal and ignore its late result when the proposal scope changes", async () => {
    const fixture = hookFixture();
    let resolveIssue!: (value: AdmissionContactBrowserResult<AdmissionOperationResult<AdmissionChallengeSnapshot>>) => void;
    let sentOperationId = "", sentSignal: AbortSignal | null = null;
    vi.mocked(fixture.client.issue).mockImplementation((_slug, input, signal) => { sentOperationId = input.operationId; sentSignal = signal; return new Promise((resolve) => { resolveIssue = resolve; }); });
    const { result, rerender } = renderHook(({ personalScope, invitationToken }) => useAdmissionContactVerification({ ...fixture.options, personalScope, invitationToken }), { initialProps: { personalScope: "a".repeat(64), invitationToken: "first-personal-proposal" } });
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => result.current.setConfirmed(true));
    let running!: Promise<void>;
    act(() => { running = result.current.issue(); });
    await waitFor(() => expect(fixture.client.issue).toHaveBeenCalledTimes(1));
    rerender({ personalScope: "b".repeat(64), invitationToken: "second-personal-proposal" });
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect((sentSignal as AbortSignal | null)?.aborted).toBe(true);
    await act(async () => { resolveIssue({ status: "ready", value: { state: "completed", operationId: sentOperationId, replayed: false, result: fixture.challenge } }); await running; });
    expect(result.current.challenge).toBeNull();
    expect(result.current.confirmed).toBe(false);
  });

  it("should restore only confirmed original issue/proof references without another POST or persisted code", async () => {
    const fixture = hookFixture(), issuedOperationId = randomUUID(), verifiedOperationId = randomUUID();
    writeAdmissionContactIntent({ viewerId: fixture.options.viewerId, slug: fixture.options.slug, requestId: null, issuedOperationId, verifiedOperationId, pending: null });
    vi.mocked(fixture.client.operation).mockImplementation(async (_slug, operationId) => operationId === issuedOperationId ? { status: "ready", value: { type: "issue_contact_challenge", state: "completed", operationId, replayed: true, result: fixture.challenge } } : { status: "ready", value: { type: "verify_contact_challenge", state: "completed", operationId, replayed: true, result: { purpose: "admission", result: "verified", proofId: fixture.proofId, applyBefore: new Date(fixture.now + 900_000).toISOString() } } });
    const { result } = renderHook(() => useAdmissionContactVerification(fixture.options));
    await waitFor(() => expect(result.current.proof?.proofId).toBe(fixture.proofId));
    expect(result.current.challenge?.challengeId).toBe(fixture.challenge.challengeId);
    expect(result.current.code).toBe("");
    expect(result.current.confirmed).toBe(false);
    expect(fixture.client.issue).not.toHaveBeenCalled();
    expect(fixture.client.verify).not.toHaveBeenCalled();
  });
  it("should issue only after consent and a native viewer check, verify locally and retain a fresh opaque proof", async () => {
    const fixture = hookFixture(), { result } = renderHook(() => useAdmissionContactVerification(fixture.options));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(fixture.client.issue).not.toHaveBeenCalled();
    await act(async () => { await result.current.issue(); });
    expect(fixture.client.issue).not.toHaveBeenCalled();
    expect(result.current.errorMessage).toMatch(/Confirmá/i);
    act(() => result.current.setConfirmed(true));
    await act(async () => { await result.current.issue(); });
    expect(fixture.options.authorize).toHaveBeenCalledTimes(2);
    expect(fixture.client.issue).toHaveBeenCalledTimes(1);
    expect(result.current.challenge?.challengeId).toBe(fixture.challenge.challengeId);
    act(() => result.current.setCode("123456"));
    await act(async () => { await result.current.verify(); });
    expect(fixture.client.verify).toHaveBeenCalledTimes(1);
    expect(result.current.proof?.proofId).toBe(fixture.proofId);
    expect(fixture.options.onProof).toHaveBeenCalledWith(expect.objectContaining({ proofId: fixture.proofId }));
    expect(fixture.client.issue).toHaveBeenCalledTimes(1);
  });

  it("should keep a lost write as local uncertainty until a genuine original read resolves it without another POST", async () => {
    const fixture = hookFixture();
    vi.mocked(fixture.client.issue).mockResolvedValueOnce({ status: "failed", code: "dependency_unavailable", message: "La respuesta no llegó.", uncertain: true });
    const { result } = renderHook(() => useAdmissionContactVerification(fixture.options));
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => result.current.setConfirmed(true));
    await act(async () => { await result.current.issue(); });
    const pending = result.current.pending;
    expect(pending?.operationId).toEqual(expect.any(String));
    expect(result.current.phase).toBe("uncertain");
    expect(result.current.pending).not.toHaveProperty("state");
    vi.mocked(fixture.client.operation).mockResolvedValueOnce({ status: "ready", value: { type: "issue_contact_challenge", state: "completed", operationId: pending!.operationId, replayed: true, result: fixture.challenge } });
    await act(async () => { await result.current.readOriginal(); });
    expect(result.current.pending).toBeNull();
    expect(result.current.challenge?.challengeId).toBe(fixture.challenge.challengeId);
    expect(fixture.client.issue).toHaveBeenCalledTimes(1);
  });

  it("should cancel old scope and ignore its late committed result when the native viewer changes", async () => {
    const fixture = hookFixture();
    let resolveIssue!: (value: AdmissionContactBrowserResult<AdmissionOperationResult<AdmissionChallengeSnapshot>>) => void;
    let sentOperationId = "", sentSignal: AbortSignal | null = null;
    vi.mocked(fixture.client.issue).mockImplementation((_slug, input, signal) => { sentOperationId = input.operationId; sentSignal = signal; return new Promise((resolve) => { resolveIssue = resolve; }); });
    const { result, rerender } = renderHook((options) => useAdmissionContactVerification(options), { initialProps: fixture.options });
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => result.current.setConfirmed(true));
    let running!: Promise<void>;
    act(() => { running = result.current.issue(); });
    await waitFor(() => expect(fixture.client.issue).toHaveBeenCalledTimes(1));
    rerender({ ...fixture.options, viewerId: randomUUID() });
    await waitFor(() => expect(sentSignal?.aborted).toBe(true));
    await act(async () => { resolveIssue({ status: "ready", value: { state: "completed", operationId: sentOperationId, replayed: false, result: fixture.challenge } }); await running; });
    expect(result.current.challenge).toBeNull();
    expect(result.current.proof).toBeNull();
    expect(fixture.options.onProof).not.toHaveBeenCalled();
    expect(fixture.options.onApplied).not.toHaveBeenCalled();
  });

  it("should reject known expired verification and early resend before another viewer lookup or write", async () => {
    const fixture = hookFixture();
    vi.mocked(fixture.client.issue).mockImplementation(async (_slug, input) => ({ status: "ready", value: { state: "completed", operationId: input.operationId, replayed: false, result: { ...fixture.challenge, expiresAt: new Date(fixture.now - 1).toISOString() } } }));
    const { result } = renderHook(() => useAdmissionContactVerification(fixture.options));
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => result.current.setConfirmed(true));
    await act(async () => { await result.current.issue(); });
    act(() => result.current.setCode("123456"));
    await act(async () => { await result.current.verify(); });
    expect(fixture.client.verify).not.toHaveBeenCalled();
    expect(result.current.errorMessage).toMatch(/venció/i);
    await act(async () => { await result.current.resend(); });
    expect(fixture.client.resend).not.toHaveBeenCalled();
    expect(fixture.options.authorize).toHaveBeenCalledTimes(2);
  });

  it("should release controls after a native viewer denial before dispatch", async () => {
    const fixture = hookFixture();
    fixture.options.authorize.mockResolvedValueOnce(false);
    const { result } = renderHook(() => useAdmissionContactVerification(fixture.options));
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => result.current.setConfirmed(true));
    await act(async () => { await result.current.issue(); });
    expect(fixture.client.issue).not.toHaveBeenCalled();
    expect(result.current.pending).toBeNull();
    expect(result.current.phase).toBe("idle");
    expect(result.current.errorMessage).toMatch(/cuenta|sesión/i);
    await act(async () => { await result.current.issue(); });
    expect(fixture.client.issue).toHaveBeenCalledTimes(1);
  });

  it("should retain the original reference and release a canceled readonly observation", async () => {
    const fixture = hookFixture();
    vi.mocked(fixture.client.issue).mockResolvedValueOnce({ status: "failed", code: "dependency_unavailable", message: "La respuesta no llegó.", uncertain: true });
    vi.mocked(fixture.client.operation).mockResolvedValueOnce({ status: "aborted" });
    const { result } = renderHook(() => useAdmissionContactVerification(fixture.options));
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => result.current.setConfirmed(true));
    await act(async () => { await result.current.issue(); });
    const original = result.current.pending;
    await act(async () => { await result.current.readOriginal(); });
    expect(result.current.phase).toBe("uncertain");
    expect(result.current.pending).toEqual(original);
    expect(fixture.client.issue).toHaveBeenCalledTimes(1);
  });

  it("should bound restoration of a pending original and preserve it for another readonly check", async () => {
    const fixture = hookFixture(), operationId = randomUUID();
    writeAdmissionContactIntent({ viewerId: fixture.options.viewerId, slug: fixture.options.slug, requestId: null, issuedOperationId: null, verifiedOperationId: null, pending: { kind: "issue", operationId } });
    let observedSignal: AbortSignal | undefined;
    vi.mocked(fixture.client.operation).mockImplementation((_slug, _operationId, signal) => { observedSignal = signal; return new Promise((resolve) => signal.addEventListener("abort", () => resolve({ status: "aborted" }), { once: true })); });
    // Fake only browser timeout/interval scheduling; React and the own ports remain real.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    const { result } = renderHook(() => useAdmissionContactVerification(fixture.options));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(fixture.client.operation).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(ADMISSION_CONTACT_BROWSER_TIMEOUT_MS); });
    expect(observedSignal?.aborted).toBe(true);
    expect(result.current.ready).toBe(true);
    expect(result.current.phase).toBe("uncertain");
    expect(result.current.pending?.operationId).toBe(operationId);
    expect(fixture.client.issue).not.toHaveBeenCalled();
  });

  it("should cancel transport observation when the owned view unmounts", async () => {
    const fixture = hookFixture(), deliveryId = randomUUID();
    let deliverySignal: AbortSignal | undefined;
    vi.mocked(fixture.client.issue).mockImplementation(async (_slug, input) => ({ status: "ready", value: { state: "completed", operationId: input.operationId, replayed: false, result: { ...fixture.challenge, deliveryId } } }));
    vi.mocked(fixture.client.delivery).mockImplementation((_slug, _deliveryId, signal) => { deliverySignal = signal; return new Promise((resolve) => signal.addEventListener("abort", () => resolve({ status: "aborted" }), { once: true })); });
    const { result, unmount } = renderHook(() => useAdmissionContactVerification(fixture.options));
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => result.current.setConfirmed(true));
    let running!: Promise<void>;
    act(() => { running = result.current.issue(); });
    await waitFor(() => expect(fixture.client.delivery).toHaveBeenCalledTimes(1));
    unmount();
    expect(deliverySignal?.aborted).toBe(true);
    await running;
  });

  it("should retain proof until its deadline and allow an explicit same-contact resend afterwards", async () => {
    const fixture = hookFixture();
    vi.mocked(fixture.client.issue).mockImplementation(async (_slug, input) => ({ status: "ready", value: { state: "completed", operationId: input.operationId, replayed: false, result: { ...fixture.challenge, resendAllowedAt: new Date(fixture.now - 1).toISOString() } } }));
    vi.mocked(fixture.client.verify).mockImplementation(async (_slug, _challenge, input) => ({ status: "ready", value: { state: "completed", operationId: input.operationId, replayed: false, result: { purpose: "admission", result: "verified", proofId: fixture.proofId, applyBefore: new Date(fixture.now - 1).toISOString() } } }));
    vi.mocked(fixture.client.resend).mockImplementation(async (_slug, _challenge, input) => ({ status: "ready", value: { state: "completed", operationId: input.operationId, replayed: false, result: { ...fixture.challenge, challengeId: randomUUID() } } }));
    const { result } = renderHook(() => useAdmissionContactVerification(fixture.options));
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => result.current.setConfirmed(true));
    await act(async () => { await result.current.issue(); });
    act(() => result.current.setCode("123456"));
    await act(async () => { await result.current.verify(); });
    expect(result.current.proof?.proofId).toBe(fixture.proofId);
    expect(result.current.proofFresh).toBe(false);
    expect(fixture.client.resend).not.toHaveBeenCalled();
    await act(async () => { await result.current.resend(); });
    expect(fixture.client.resend).toHaveBeenCalledTimes(1);
    expect(result.current.proof).toBeNull();
    expect(result.current.challenge?.challengeId).not.toBe(fixture.challenge.challengeId);
  });
});
