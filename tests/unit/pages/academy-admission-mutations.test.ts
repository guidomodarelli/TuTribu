/** @vitest-environment node */
/** Exercises native mutation HTTP with explicit application ports and real boundary schemas. @module academy-admission-mutation-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { AdmissionFailure } from "@/src/modules/academy-admissions/application/results/admission-errors";
type MutationResult = { ok: true; value: unknown } | { ok: false; failure: AdmissionFailure };
import { createAdmissionMutationHandlers } from "@/src/modules/academy-admissions/infrastructure/api/admission-mutation-handlers";

/** Creates only own application outcomes; historical request data is captured separately from current reads. */
function mutationFixture() {
  const operationId = randomUUID(), requestId = randomUUID(), tribeId = randomUUID();
  const snapshot = { id: requestId, status: "pending", version: 1, submittedAt: "2026-10-07T00:00:00Z", expiresAt: "2026-11-06T00:00:00Z", source: "common", needsVerification: false, eligibilityReasons: [], contact: { type: "email", maskedValue: "a•••@example.test", evidenceKind: "declared" }, internalReason: "Private reviewer note" };
  const submit = vi.fn(async (): Promise<MutationResult> => ({ ok: true, value: { state: "completed", operationId, replayed: false, result: { operationId, outcome: "pending", created: true, admissionRequestId: requestId, committedRequestVersion: 1, membership: null, requestSnapshot: snapshot } } }));
  const cancelOwn = vi.fn(async (): Promise<MutationResult> => ({ ok: true, value: { state: "completed", operationId, replayed: false, result: { admissionRequestId: requestId, version: 2, status: "cancelled" } } }));
  const decide = vi.fn(async (): Promise<MutationResult> => ({ ok: true, value: { state: "completed", operationId, replayed: false, result: { admissionRequestId: requestId, version: 2, status: "approved" } } }));
  const allowRetry = vi.fn(async (): Promise<MutationResult> => ({ ok: true, value: { state: "completed", operationId, replayed: false, result: { admissionRequestId: requestId, version: 3, retryAllowedAt: "2026-10-07T00:00:00Z" } } }));
  const ports = { resolveTribe: { execute: vi.fn(async () => ({ ok: true as const, value: { tribeId } })) }, submit: { execute: submit }, cancelOwn: { execute: cancelOwn }, cancelByManagement: { execute: vi.fn() }, decide: { execute: decide }, allowRetry: { execute: allowRetry } };
  const open = vi.fn(async () => ports);
  const request = (body: object) => new Request("https://tutribu.example.invalid/api/tribes/synthetic-academy/admissions/submissions", { method: "POST", headers: { "content-type": "application/json", origin: "https://tutribu.example.invalid" }, body: JSON.stringify(body) });
  return { operationId, requestId, tribeId, snapshot, submit, cancelOwn, decide, ports, open, request, handlers: createAdmissionMutationHandlers(open) };
}

describe("admission mutation handlers", () => {
  it("should canonicalize the submission operation and opaque proof before the original atomic intent", async () => {
    const fixture = mutationFixture(), proofId = randomUUID();
    const response = await fixture.handlers.submit(fixture.request({ operationId: fixture.operationId.toUpperCase(), confirmed: true, expectedPolicyVersion: 1, proofId: proofId.toUpperCase() }), { params: Promise.resolve({ slug: "synthetic-academy" }) });
    expect(response.status).toBe(201);
    expect(fixture.submit).toHaveBeenCalledWith({ operationId: fixture.operationId, confirmed: true, expectedPolicyVersion: 1, proofId, tribeId: fixture.tribeId, requestId: expect.any(String) });
  });
  it("should expose the original pending snapshot at 201/200 and strip private fields without querying today's request", async () => {
    const fixture = mutationFixture(), context = { params: Promise.resolve({ slug: "synthetic-academy" }) };
    const body = { operationId: fixture.operationId, confirmed: true, expectedPolicyVersion: 1 };
    const response = await fixture.handlers.submit(fixture.request(body), context);
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ outcome: "pending", operationId: fixture.operationId, request: { id: fixture.requestId, status: "pending", version: 1 } });
    fixture.submit.mockResolvedValueOnce({ ok: true, value: { state: "completed", operationId: fixture.operationId, replayed: true, result: { operationId: fixture.operationId, outcome: "pending", created: true, admissionRequestId: fixture.requestId, committedRequestVersion: 1, membership: null, requestSnapshot: fixture.snapshot } } });
    const replayed = await fixture.handlers.submit(fixture.request(body), context);
    expect(replayed.status).toBe(200);
    expect(await replayed.json()).not.toHaveProperty("request.internalReason");
  });

  it("should validate input once before composition and never accept browser actor, role or unconfirmed mutations", async () => {
    const fixture = mutationFixture(), context = { params: Promise.resolve({ slug: "synthetic-academy" }) };
    for (const body of [{ operationId: fixture.operationId, confirmed: false, expectedPolicyVersion: 1 }, { operationId: fixture.operationId, confirmed: true, expectedPolicyVersion: 1, userId: "foreign", role: "leader" }]) expect((await fixture.handlers.submit(fixture.request(body), context)).status).toBe(400);
    expect(fixture.open).not.toHaveBeenCalled();
    expect(fixture.submit).not.toHaveBeenCalled();
  });

  it("should publish 202 only for the original registered operation and reject mismatched operation progress", async () => {
    const fixture = mutationFixture(), context = { params: Promise.resolve({ slug: "synthetic-academy" }) };
    fixture.submit.mockResolvedValueOnce({ ok: true, value: { state: "started", operationId: fixture.operationId } });
    const response = await fixture.handlers.submit(fixture.request({ operationId: fixture.operationId, confirmed: true, expectedPolicyVersion: 1 }), context);
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ state: "started", operationId: fixture.operationId });
    fixture.submit.mockResolvedValueOnce({ ok: true, value: { state: "started", operationId: randomUUID() } });
    expect((await fixture.handlers.submit(fixture.request({ operationId: fixture.operationId, confirmed: true, expectedPolicyVersion: 1 }), context)).status).toBe(500);
  });

  it("should keep cancellation/decision results scoped to their actual resource and preserve current permission failures", async () => {
    const fixture = mutationFixture(), context = { params: Promise.resolve({ slug: "synthetic-academy", requestId: fixture.requestId }) };
    expect((await fixture.handlers.cancel(fixture.request({ operationId: fixture.operationId, confirmed: true, expectedVersion: 1 }), context)).status).toBe(200);
    fixture.decide.mockResolvedValueOnce({ ok: false, failure: { code: "permission_denied", cause: new Error("Synthetic private authorization context") } });
    const denied = await fixture.handlers.decide(fixture.request({ operationId: fixture.operationId, confirmed: true, expectedVersion: 1, decision: "approve", internalReason: "Revisión" }), context);
    expect(denied.status).toBe(403);
    expect(await denied.json()).toMatchObject({ code: "permission_denied" });
    expect(fixture.ports.cancelByManagement.execute).not.toHaveBeenCalled();
  });

  it("should return a stale decision conflict without presenting a transition or leaking its private cause", async () => {
    const fixture = mutationFixture(), context = { params: Promise.resolve({ slug: "synthetic-academy", requestId: fixture.requestId }) };
    fixture.decide.mockResolvedValueOnce({ ok: false, failure: { code: "request_conflict", cause: new Error("Private database decision metadata") } });
    const response = await fixture.handlers.decide(fixture.request({ operationId: fixture.operationId, confirmed: true, expectedVersion: 1, decision: "approve", internalReason: "Revisión" }), context);
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body).toMatchObject({ code: "request_conflict", message: "La solicitud cambió. Revisala antes de confirmar.", requestId: expect.any(String) });
    expect(body).not.toHaveProperty("status");
    expect(body).not.toHaveProperty("cause");
    expect(fixture.decide).toHaveBeenCalledTimes(1);
  });

  it("should reject a confirmed transition with the wrong action even when its request and operation ids match", async () => {
    const fixture = mutationFixture(), context = { params: Promise.resolve({ slug: "synthetic-academy", requestId: fixture.requestId }) };
    fixture.cancelOwn.mockResolvedValueOnce({ ok: true, value: { state: "completed", operationId: fixture.operationId, replayed: false, result: { admissionRequestId: fixture.requestId, version: 2, status: "approved" } } });
    expect((await fixture.handlers.cancel(fixture.request({ operationId: fixture.operationId, confirmed: true, expectedVersion: 1 }), context)).status).toBe(500);
    fixture.decide.mockResolvedValueOnce({ ok: true, value: { state: "completed", operationId: fixture.operationId, replayed: false, result: { admissionRequestId: fixture.requestId, version: 2, status: "cancelled" } } });
    expect((await fixture.handlers.decide(fixture.request({ operationId: fixture.operationId, confirmed: true, expectedVersion: 1, decision: "approve", internalReason: "Revisión" }), context)).status).toBe(500);
  });

  it("should reject a foreign browser origin before composing native session or executing any mutation", async () => {
    const fixture = mutationFixture();
    const request = new Request("https://tutribu.example.invalid/api/tribes/synthetic-academy/admissions/submissions", { method: "POST", headers: { "content-type": "application/json", origin: "https://foreign.example.invalid" }, body: JSON.stringify({ operationId: fixture.operationId, confirmed: true, expectedPolicyVersion: 1 }) });
    expect((await fixture.handlers.submit(request, { params: Promise.resolve({ slug: "synthetic-academy" }) })).status).toBe(403);
    expect(fixture.open).not.toHaveBeenCalled();
    expect(fixture.submit).not.toHaveBeenCalled();
  });

  it("should recognize the actual browser host when Next's normalized request URL uses an internal hostname", async () => {
    const fixture = mutationFixture();
    const request = new Request("http://localhost:3999/api/tribes/synthetic-academy/admissions/submissions", { method: "POST", headers: { "content-type": "application/json", host: "127.0.0.1:3999", origin: "http://127.0.0.1:3999" }, body: JSON.stringify({ operationId: fixture.operationId, confirmed: true, expectedPolicyVersion: 1 }) });
    expect((await fixture.handlers.submit(request, { params: Promise.resolve({ slug: "synthetic-academy" }) })).status).toBe(201);
  });

  it("should expose only retry eligibility/version and delegate current recency failure without changing the request decision", async () => {
    const fixture = mutationFixture(), context = { params: Promise.resolve({ slug: "synthetic-academy", requestId: fixture.requestId }) };
    const body = { operationId: fixture.operationId, confirmed: true, expectedVersion: 2, internalReason: "Corrección" };
    const response = await fixture.handlers.retry(fixture.request(body), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ admissionRequestId: fixture.requestId, version: 3, retryAllowedAt: "2026-10-07T00:00:00Z" });
    fixture.ports.allowRetry.execute.mockResolvedValueOnce({ ok: false, failure: { code: "reauthentication_required" } });
    expect((await fixture.handlers.retry(fixture.request(body), context)).status).toBe(401);
    expect(fixture.decide).not.toHaveBeenCalled();
  });
});
