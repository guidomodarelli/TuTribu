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
