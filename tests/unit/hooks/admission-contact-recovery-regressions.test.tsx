/** Exercises recovery namespaces and local verification while own delivery observation remains pending. @module admission-contact-recovery-regressions */
import { randomUUID } from "node:crypto";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAdmissionContactVerification } from "@/hooks/use-admission-contact-verification";
import { writeAdmissionContactIntent } from "@/lib/academy-admissions/admission-contact-intent";
import type { AdmissionContactBrowserClient } from "@/src/modules/academy-admissions/application/ports/admission-contact-browser-client";
import type { z } from "zod";
import type { messageDeliverySchema } from "@/src/modules/messaging/application/results/messaging-flow-result-schemas";

afterEach(() => window.sessionStorage.clear());

/** Own ports isolate transport timing without mocking React, shared UI or auth SDK. */
function recoveryFixture() {
  const now = Date.now(), challengeId = randomUUID(), proofId = randomUUID();
  const challenge = { challengeId, deliveryId: randomUUID(), purpose: "admission" as const, channel: "email" as const, maskedDestination: "a•••@example.test", expiresAt: new Date(now + 600_000).toISOString(), resendAllowedAt: new Date(now - 1).toISOString(), deliveryState: "queued" as const };
  const client: AdmissionContactBrowserClient = {
    issue: vi.fn<AdmissionContactBrowserClient["issue"]>(async (_slug, input) => ({ status: "ready", value: { state: "completed", operationId: input.operationId, replayed: false, result: challenge } })),
    verify: vi.fn<AdmissionContactBrowserClient["verify"]>(async (_slug, _challenge, input) => ({ status: "ready", value: { state: "completed", operationId: input.operationId, replayed: false, result: { purpose: "admission", result: "verified", proofId, applyBefore: new Date(now + 900_000).toISOString() } } })),
    resend: vi.fn(), apply: vi.fn(), operation: vi.fn(), delivery: vi.fn(),
  };
  const options = { viewerId: randomUUID(), slug: "synthetic-academy", requestId: null, requestVersion: null, policyVersion: 1, channel: "email" as const, allowedCountries: [] as readonly string[], allowSmsAlternative: false, phone: "", country: "", enabled: true, renderedAt: new Date(now).toISOString(), authorize: async () => true, client, onApplied: vi.fn(), onProof: vi.fn() };
  return { challenge, proofId, client, options };
}

describe("contact original recovery regressions", () => {
  it("should preserve safe quota feedback while a current code can still be entered and replace it with the current delivery reason", async () => {
    const fixture = recoveryFixture();
    vi.mocked(fixture.client.delivery).mockResolvedValue({ status: "ready", value: { id: fixture.challenge.deliveryId, state: "queued", channel: "email", purpose: "admission", createdAt: fixture.options.renderedAt, safeReason: "usage_limit_reached" } });
    const { result } = renderHook(() => useAdmissionContactVerification(fixture.options));
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => result.current.setConfirmed(true));
    await act(async () => { await result.current.issue(); });
    await waitFor(() => expect(result.current.delivery?.safeReason).toBe("usage_limit_reached"));
    expect(result.current.deliveryMessage).toBe("Se alcanzó el límite de nuevos envíos. Podés validar un código vigente o consultar tu solicitud.");
    act(() => result.current.setCode("123456"));
    expect(result.current.deliveryMessage).toBe("Se alcanzó el límite de nuevos envíos. Podés validar un código vigente o consultar tu solicitud.");
    expect(fixture.client.verify).not.toHaveBeenCalled();

    vi.mocked(fixture.client.delivery).mockResolvedValue({ status: "ready", value: { id: fixture.challenge.deliveryId, state: "failed", channel: "email", purpose: "admission", createdAt: fixture.options.renderedAt, safeReason: "dependency_unavailable" } });
    await act(async () => { await result.current.readDelivery(); });
    expect(result.current.deliveryMessage).toBe("La mensajería no está disponible temporalmente. Podés consultar tu solicitud.");
    expect(fixture.client.issue).toHaveBeenCalledTimes(1);
    expect(fixture.client.resend).not.toHaveBeenCalled();
  });

  it("should clear the previous delivery reason as soon as an explicit resend starts before its response settles", async () => {
    const fixture = recoveryFixture(), replacement = { ...fixture.challenge, challengeId: randomUUID(), deliveryId: randomUUID() };
    vi.mocked(fixture.client.delivery).mockResolvedValue({ status: "ready", value: { id: fixture.challenge.deliveryId, state: "queued", channel: "email", purpose: "admission", createdAt: fixture.options.renderedAt, safeReason: "usage_limit_reached" } });
    let finishResend!: () => void;
    vi.mocked(fixture.client.resend).mockImplementation((_slug, _challengeId, input) => new Promise((resolve) => { finishResend = () => resolve({ status: "ready", value: { state: "completed", operationId: input.operationId, replayed: false, result: replacement } }); }));
    const { result, unmount } = renderHook(() => useAdmissionContactVerification(fixture.options));
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => result.current.setConfirmed(true));
    await act(async () => { await result.current.issue(); });
    await waitFor(() => expect(result.current.deliveryMessage).toMatch(/límite de nuevos envíos/i));
    vi.mocked(fixture.client.delivery).mockResolvedValue({ status: "ready", value: { id: replacement.deliveryId, state: "queued", channel: "email", purpose: "admission", createdAt: fixture.options.renderedAt } });
    let resending!: Promise<void>;
    act(() => { resending = result.current.resend(); });
    try {
      await waitFor(() => expect(fixture.client.resend).toHaveBeenCalledTimes(1));
      expect(result.current.phase).toBe("resending");
      expect(result.current.deliveryMessage).toBeNull();
      expect(result.current.challenge?.challengeId).toBe(fixture.challenge.challengeId);
    } finally { await act(async () => { finishResend(); await resending; }); unmount(); }
  });

  it("should cancel the old delivery read and ignore its late reason while an explicit resend is still pending", async () => {
    const fixture = recoveryFixture(), replacement = { ...fixture.challenge, challengeId: randomUUID(), deliveryId: randomUUID() };
    const oldDelivery = { id: fixture.challenge.deliveryId, state: "queued" as const, channel: "email" as const, purpose: "admission" as const, createdAt: fixture.options.renderedAt, safeReason: "usage_limit_reached" as const };
    vi.mocked(fixture.client.delivery).mockResolvedValue({ status: "ready", value: oldDelivery });
    const { result, unmount } = renderHook(() => useAdmissionContactVerification(fixture.options));
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => result.current.setConfirmed(true));
    await act(async () => { await result.current.issue(); });
    await waitFor(() => expect(result.current.deliveryMessage).toMatch(/límite de nuevos envíos/i));
    let finishOld!: () => void, finishResend!: () => void, oldSignal!: AbortSignal;
    vi.mocked(fixture.client.delivery).mockImplementationOnce((_slug, _deliveryId, signal) => new Promise((resolve) => { oldSignal = signal; finishOld = () => resolve({ status: "ready", value: oldDelivery }); }));
    let reading!: Promise<void>, resending!: Promise<void>;
    act(() => { reading = result.current.readDelivery(); });
    await waitFor(() => expect(finishOld).toBeTypeOf("function"));
    vi.mocked(fixture.client.resend).mockImplementation((_slug, _challengeId, input) => new Promise((resolve) => { finishResend = () => resolve({ status: "ready", value: { state: "completed", operationId: input.operationId, replayed: false, result: replacement } }); }));
    vi.mocked(fixture.client.delivery).mockResolvedValue({ status: "ready", value: { ...oldDelivery, id: replacement.deliveryId, safeReason: undefined } });
    act(() => { resending = result.current.resend(); });
    try {
      await waitFor(() => expect(fixture.client.resend).toHaveBeenCalledTimes(1));
      expect(oldSignal.aborted).toBe(true);
      await act(async () => { finishOld(); await reading; });
      expect(result.current.phase).toBe("resending");
      expect(result.current.deliveryMessage).toBeNull();
    } finally { await act(async () => { finishOld(); await reading; finishResend(); await resending; }); unmount(); }
  });

  it("should recover a confirmed issuance rejection without creating another code or retaining uncertainty", async () => {
    const fixture = recoveryFixture(), operationId = randomUUID();
    writeAdmissionContactIntent({ viewerId: fixture.options.viewerId, slug: fixture.options.slug, requestId: null, issuedOperationId: null, verifiedOperationId: null, pending: { kind: "issue", operationId } });
    vi.mocked(fixture.client.operation).mockResolvedValue({ status: "ready", value: { type: "issue_contact_challenge", state: "completed", operationId, replayed: true, result: { purpose: "admission", result: "denied", code: "recipient_not_allowed" } } });
    const { result } = renderHook(() => useAdmissionContactVerification(fixture.options));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.phase).toBe("idle");
    expect(result.current.pending).toBeNull();
    expect(result.current.challenge).toBeNull();
    expect(result.current.errorMessage).toMatch(/país|teléfono/i);
    expect(fixture.client.issue).not.toHaveBeenCalled();
    expect(fixture.client.delivery).not.toHaveBeenCalled();
  });

  it("should restore a confirmed resend namespace and its replacement without another write", async () => {
    const fixture = recoveryFixture(), operationId = randomUUID();
    writeAdmissionContactIntent({ viewerId: fixture.options.viewerId, slug: fixture.options.slug, requestId: null, issuedOperationId: operationId, verifiedOperationId: null, pending: null });
    vi.mocked(fixture.client.operation).mockResolvedValue({ status: "ready", value: { type: "resend_contact_challenge", state: "completed", operationId, replayed: true, result: fixture.challenge } });
    vi.mocked(fixture.client.delivery).mockResolvedValue({ status: "failed", code: "dependency_unavailable", message: "No pudimos consultar el envío.", uncertain: false });
    const { result } = renderHook(() => useAdmissionContactVerification(fixture.options));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.challenge?.challengeId).toBe(fixture.challenge.challengeId);
    expect(result.current.phase).toBe("idle");
    expect(fixture.client.issue).not.toHaveBeenCalled();
    expect(fixture.client.resend).not.toHaveBeenCalled();
  });

  it("should verify a current code while the independent transport GET is still pending", async () => {
    const fixture = recoveryFixture();
    let finishDelivery!: () => void;
    vi.mocked(fixture.client.delivery).mockImplementation(() => new Promise((resolve) => { finishDelivery = () => resolve({ status: "failed", code: "dependency_unavailable", message: "No pudimos consultar el envío.", uncertain: false }); }));
    const { result, unmount } = renderHook(() => useAdmissionContactVerification(fixture.options));
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => result.current.setConfirmed(true));
    let issuing!: Promise<void>;
    act(() => { issuing = result.current.issue(); });
    await waitFor(() => expect(fixture.client.delivery).toHaveBeenCalledTimes(1));
    try {
      act(() => result.current.setCode("123456"));
      await act(async () => { await result.current.verify(); });
      expect(fixture.client.verify).toHaveBeenCalledTimes(1);
      expect(result.current.proof?.proofId).toBe(fixture.proofId);
    } finally { await act(async () => { finishDelivery(); await issuing; }); unmount(); }
  });

  it("should ignore an old delivery response after the current code is explicitly resent", async () => {
    const fixture = recoveryFixture(), replacement = { ...fixture.challenge, challengeId: randomUUID(), deliveryId: randomUUID() };
    const oldDelivery: z.infer<typeof messageDeliverySchema> = { id: fixture.challenge.deliveryId, state: "failed", channel: "email", purpose: "admission", createdAt: fixture.options.renderedAt };
    const newDelivery: z.infer<typeof messageDeliverySchema> = { id: replacement.deliveryId, state: "queued", channel: "email", purpose: "admission", createdAt: fixture.options.renderedAt };
    let finishOld!: () => void;
    vi.mocked(fixture.client.delivery).mockImplementation((_slug, deliveryId) => deliveryId === oldDelivery.id ? new Promise((resolve) => { finishOld = () => resolve({ status: "ready", value: oldDelivery }); }) : Promise.resolve({ status: "ready", value: newDelivery }));
    vi.mocked(fixture.client.resend).mockImplementation(async (_slug, _challengeId, input) => ({ status: "ready", value: { state: "completed", operationId: input.operationId, replayed: false, result: replacement } }));
    const { result, unmount } = renderHook(() => useAdmissionContactVerification(fixture.options));
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => result.current.setConfirmed(true));
    await act(async () => { await result.current.issue(); });
    try {
      await act(async () => { await result.current.resend(); });
      await waitFor(() => expect(result.current.delivery?.id).toBe(newDelivery.id));
      await act(async () => { finishOld(); });
      expect(result.current.challenge?.challengeId).toBe(replacement.challengeId);
      expect(result.current.delivery?.id).toBe(newDelivery.id);
      expect(result.current.delivery?.state).toBe("queued");
    } finally { finishOld(); unmount(); }
  });
});
