/** A platform refusal of a code write is definitive: the stored reference is released, the code is not treated as gone and nothing is read back. @module admission-contact-platform-security-tests */
import { randomUUID } from "node:crypto";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAdmissionContactVerification } from "@/hooks/use-admission-contact-verification";
import type { AdmissionContactBrowserClient } from "@/src/modules/academy-admissions/application/ports/admission-contact-browser-client";
import type { AdmissionChallengeSnapshot } from "@/src/modules/academy-admissions/domain/repositories/admission-contact-verification";
import { readAdmissionContactIntent, writeAdmissionContactIntent } from "@/lib/academy-admissions/admission-contact-intent";
import { ADMISSION_ERROR_CODE, ADMISSION_ERROR_MESSAGE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { ADMISSION_CONTACT_COPY } from "@/src/modules/academy-admissions/constants/admission-contact-browser";

const PLATFORM_MESSAGE = ADMISSION_ERROR_MESSAGE[ADMISSION_ERROR_CODE.platformSecurityUnavailable];
const PLATFORM_REFUSAL = { status: "failed" as const, code: ADMISSION_ERROR_CODE.platformSecurityUnavailable, message: PLATFORM_MESSAGE, uncertain: false };

afterEach(() => { window.sessionStorage.clear(); });

/** Supplies only the own transport and authorization ports; the platform refuses every code write. */
function hookFixture() {
  const now = Date.now();
  const challenge: AdmissionChallengeSnapshot = { challengeId: randomUUID(), purpose: "admission", channel: "email", maskedDestination: "a•••@example.test", expiresAt: new Date(now + 600_000).toISOString(), resendAllowedAt: new Date(now - 1).toISOString(), deliveryState: "queued" };
  const client: AdmissionContactBrowserClient = {
    current: vi.fn<AdmissionContactBrowserClient["current"]>(async () => ({ status: "ready", value: { current: null } })),
    issue: vi.fn<AdmissionContactBrowserClient["issue"]>(async () => PLATFORM_REFUSAL),
    verify: vi.fn<AdmissionContactBrowserClient["verify"]>(async () => PLATFORM_REFUSAL),
    resend: vi.fn<AdmissionContactBrowserClient["resend"]>(async () => PLATFORM_REFUSAL),
    apply: vi.fn<AdmissionContactBrowserClient["apply"]>(),
    operation: vi.fn<AdmissionContactBrowserClient["operation"]>(),
    delivery: vi.fn<AdmissionContactBrowserClient["delivery"]>(),
  };
  const options = { viewerId: randomUUID(), slug: "synthetic-platform-academy", requestId: null, requestVersion: null, policyVersion: 1, channel: "email" as const, allowedCountries: [] as readonly string[], allowSmsAlternative: false, phone: "", country: "", enabled: true, renderedAt: new Date(now).toISOString(), authorize: vi.fn(async () => true), client, onApplied: vi.fn(), onProof: vi.fn() };
  return { challenge, client, options };
}

/** @param fixture - Hook fixture whose first issue succeeds. @returns The hook after a current code was issued and confirmed again. */
async function renderWithIssuedCode(fixture: ReturnType<typeof hookFixture>) {
  vi.mocked(fixture.client.issue).mockImplementationOnce(async (_slug, input) => ({ status: "ready", value: { state: "completed", operationId: input.operationId, replayed: false, result: fixture.challenge } }));
  const hook = renderHook(() => useAdmissionContactVerification(fixture.options));
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  act(() => hook.result.current.setConfirmed(true));
  await act(async () => { await hook.result.current.issue(); });
  expect(hook.result.current.challenge?.challengeId).toBe(fixture.challenge.challengeId);
  return hook;
}

/** @param fixture - Hook fixture. @returns The stored pending reference of the hook's scope. */
function storedPending(fixture: ReturnType<typeof hookFixture>) {
  return readAdmissionContactIntent(fixture.options.viewerId, fixture.options.slug, fixture.options.requestId)?.pending ?? null;
}

describe("contact code writes the platform cannot protect", () => {
  it("should release a refused code request without reading it back or keeping it uncertain", async () => {
    const fixture = hookFixture();
    const { result } = renderHook(() => useAdmissionContactVerification(fixture.options));
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => result.current.setConfirmed(true));

    await act(async () => { await result.current.issue(); });

    expect(fixture.client.issue).toHaveBeenCalledOnce();
    expect(result.current).toMatchObject({ phase: "idle", errorMessage: PLATFORM_MESSAGE, pending: null, recoveryRequired: false, challenge: null });
    expect(storedPending(fixture)).toBeNull();
    expect(fixture.client.operation).not.toHaveBeenCalled();
  });

  it("should release a refused resend and keep the current code usable", async () => {
    const fixture = hookFixture(), { result } = await renderWithIssuedCode(fixture);
    act(() => result.current.setConfirmed(true));

    await act(async () => { await result.current.resend(); });

    expect(fixture.client.resend).toHaveBeenCalledOnce();
    expect(result.current).toMatchObject({ phase: "idle", errorMessage: PLATFORM_MESSAGE, pending: null, challengeUnavailable: false });
    expect(result.current.challenge?.challengeId).toBe(fixture.challenge.challengeId);
    expect(storedPending(fixture)).toBeNull();
    expect(fixture.client.operation).not.toHaveBeenCalled();
  });

  it("should release a refused code check without treating the code as gone", async () => {
    const fixture = hookFixture(), { result } = await renderWithIssuedCode(fixture);
    act(() => result.current.setCode("123456"));

    await act(async () => { await result.current.verify(); });

    expect(fixture.client.verify).toHaveBeenCalledOnce();
    expect(result.current).toMatchObject({ phase: "idle", errorMessage: PLATFORM_MESSAGE, pending: null, proof: null, challengeUnavailable: false, challengeMessage: null });
    expect(storedPending(fixture)).toBeNull();
    expect(fixture.client.operation).not.toHaveBeenCalled();
  });

  it("should explain a platform refusal of the current code read on restore instead of reporting the code as absent", async () => {
    const fixture = hookFixture(), previousRequestId = randomUUID();
    writeAdmissionContactIntent({ viewerId: fixture.options.viewerId, slug: fixture.options.slug, requestId: null, issuedOperationId: null, verifiedOperationId: null, pending: null, selectedOperationId: randomUUID(), previousRequestId });
    vi.mocked(fixture.client.current).mockResolvedValue(PLATFORM_REFUSAL);

    const { result } = renderHook(() => useAdmissionContactVerification({ ...fixture.options, previousRequestId }));

    await waitFor(() => expect(result.current.errorMessage).toBe(PLATFORM_MESSAGE));
    expect(result.current.errorMessage).not.toBe(ADMISSION_CONTACT_COPY.absent);
    expect(fixture.client.issue).not.toHaveBeenCalled();
  });
});
