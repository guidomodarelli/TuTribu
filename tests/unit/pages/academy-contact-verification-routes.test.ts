/** @vitest-environment node */
/** Exercises real contact verification HTTP boundaries using own application ports, never platform or schema mocks. @module academy-contact-verification-routes-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createAdmissionContactVerificationHandlers, createAdmissionProofAttachmentHandler, type AdmissionVerificationHttpOutcome } from "@/src/modules/academy-admissions/infrastructure/api/admission-contact-verification-handlers";

/** Supplies only own application ports behind actual params/query/body/public DTO validation. */
function routeFixture() {
  const tribeId = randomUUID(), challengeId = randomUUID(), proofId = randomUUID(), admissionRequestId = randomUUID(), operationId = randomUUID();
  const challenge = { purpose: "admission", challengeId, channel: "email", maskedDestination: "a•••@example.test", expiresAt: "2026-10-08T23:10:00Z", resendAllowedAt: "2026-10-08T23:01:00Z", deliveryState: "queued" };
  const issue = vi.fn(async (): Promise<AdmissionVerificationHttpOutcome> => ({ ok: true, value: { state: "completed", operationId, replayed: false, result: challenge } }));
  const verify = vi.fn(async (): Promise<AdmissionVerificationHttpOutcome> => ({ ok: true, value: { state: "completed", operationId, replayed: false, result: { purpose: "admission", result: "verified", proofId, applyBefore: "2026-10-08T23:15:00Z" } } }));
  const resend = vi.fn(async (): Promise<AdmissionVerificationHttpOutcome> => ({ ok: true, value: { state: "completed", operationId, replayed: false, result: challenge } }));
  const applyProof = vi.fn(async (): Promise<AdmissionVerificationHttpOutcome> => ({ ok: true, value: { state: "completed", operationId, replayed: false, result: { outcome: "applied", requestId: admissionRequestId, requestVersion: 2, status: "pending", proofId } } }));
  const resolveTribe = { execute: vi.fn(async () => ({ ok: true as const, value: { tribeId } })) };
  const open = vi.fn(async () => ({ verification: { issue, verify, resend }, applyProof: { execute: applyProof }, resolveTribe }));
  const handlers = { ...createAdmissionContactVerificationHandlers(open), applyProof: createAdmissionProofAttachmentHandler(open) };
  /** @param body - Exact proposed own JSON body. @param url - Optional same-origin route with query. @param origin - Optional browser authority for origin rejection. @returns Native HTTP request exercising the real boundary. */
  const request = (body: unknown, url = "https://tutribu.example.invalid/api/tribes/synthetic-academy/admissions/challenges", origin = "https://tutribu.example.invalid") => new Request(url, { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
  const body = { operationId, confirmed: true, expectedPolicyVersion: 1, channel: "email" };
  return { tribeId, challengeId, proofId, admissionRequestId, operationId, challenge, issue, verify, resend, applyProof, resolveTribe, open, handlers, request, body };
}

describe("admission contact verification routes", () => {
  it("should expose a confirmed issuance rejection with its completed original and no private cause", async () => {
    const fixture = routeFixture();
    fixture.issue.mockResolvedValueOnce({ ok: false, failure: { code: "recipient_not_allowed", operation: { operationId: fixture.operationId, state: "completed" }, cause: new Error("Private native diagnostic") } });
    const response = await fixture.handlers.issue(fixture.request(fixture.body), { params: Promise.resolve({ slug: "synthetic-academy" }) });
    expect(response.status).toBe(422);
    const result = await response.json();
    expect(result).toMatchObject({ code: "recipient_not_allowed", message: "La academia no tiene habilitado el país de ese teléfono.", operation: { operationId: fixture.operationId, state: "completed" } });
    expect(result).not.toHaveProperty("cause");
  });

  it("should issue only the confirmed own input, mask the destination and preserve registered progress", async () => {
    const fixture = routeFixture(), context = { params: Promise.resolve({ slug: "synthetic-academy" }) };
    const response = await fixture.handlers.issue(fixture.request(fixture.body), context);
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ state: "completed", operationId: fixture.operationId, replayed: false, result: fixture.challenge });
    expect(fixture.issue).toHaveBeenCalledWith({ ...fixture.body, tribeId: fixture.tribeId, requestId: expect.any(String) });
    fixture.issue.mockResolvedValueOnce({ ok: true, value: { state: "started", operationId: fixture.operationId } });
    const started = await fixture.handlers.issue(fixture.request(fixture.body), context);
    expect(started.status).toBe(202);
    expect(await started.json()).toEqual({ state: "started", operationId: fixture.operationId });
  });

  it.each(["sender", "destination", "body", "text", "purpose", "userId", "sessionId", "verified", "apiKey", "connectionId"])("should reject browser authority %s before composition", async (field) => {
    const fixture = routeFixture();
    const response = await fixture.handlers.issue(fixture.request({ ...fixture.body, [field]: "synthetic-override" }), { params: Promise.resolve({ slug: "synthetic-academy" }) });
    expect(response.status).toBe(400);
    expect(fixture.open).not.toHaveBeenCalled();
  });

  it("should reject a foreign origin, query overrides, malformed JSON and a code with the wrong shape before ports", async () => {
    const fixture = routeFixture(), context = { params: Promise.resolve({ slug: "synthetic-academy", challengeId: fixture.challengeId }) };
    expect((await fixture.handlers.verify(fixture.request({ operationId: fixture.operationId, confirmed: true, verificationCode: "123456" }, undefined, "https://foreign.example.invalid"), context)).status).toBe(403);
    expect((await fixture.handlers.issue(fixture.request(fixture.body, "https://tutribu.example.invalid/api/tribes/synthetic-academy/admissions/challenges?userId=foreign"), { params: Promise.resolve({ slug: "synthetic-academy" }) })).status).toBe(400);
    expect((await fixture.handlers.verify(fixture.request({ operationId: fixture.operationId, confirmed: true, verificationCode: "12345" }), context)).status).toBe(400);
    const malformed = new Request("https://tutribu.example.invalid/api/tribes/synthetic-academy/admissions/challenges", { method: "POST", headers: { origin: "https://tutribu.example.invalid", "content-type": "application/json" }, body: "{" });
    expect((await fixture.handlers.issue(malformed, { params: Promise.resolve({ slug: "synthetic-academy" }) })).status).toBe(400);
    expect(fixture.open).not.toHaveBeenCalled();
  });

  it("should validate locally and expose a proof only under admission purpose without provider material", async () => {
    const fixture = routeFixture(), context = { params: Promise.resolve({ slug: "synthetic-academy", challengeId: fixture.challengeId }) };
    const response = await fixture.handlers.verify(fixture.request({ operationId: fixture.operationId, confirmed: true, verificationCode: "123456" }), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ state: "completed", result: { purpose: "admission", result: "verified", proofId: fixture.proofId } });
    fixture.verify.mockResolvedValueOnce({ ok: true, value: { state: "completed", operationId: fixture.operationId, replayed: false, result: { purpose: "connection_diagnostic", result: "verified", diagnosticId: randomUUID(), connectionVersion: 1, channel: "email" } } });
    expect((await fixture.handlers.verify(fixture.request({ operationId: fixture.operationId, confirmed: true, verificationCode: "123456" }), context)).status).toBe(500);
    expect(fixture.issue).not.toHaveBeenCalled();
    expect(fixture.resend).not.toHaveBeenCalled();
  });

  it("should forward only the explicit SMS alternative for the original challenge and reject another channel or UUID", async () => {
    const fixture = routeFixture(), context = { params: Promise.resolve({ slug: "synthetic-academy", challengeId: fixture.challengeId }) };
    fixture.resend.mockResolvedValueOnce({ ok: true, value: { state: "completed", operationId: fixture.operationId, replayed: false, result: { ...fixture.challenge, channel: "sms" } } });
    expect((await fixture.handlers.resend(fixture.request({ operationId: fixture.operationId, confirmed: true, useSmsAlternative: true }), context)).status).toBe(201);
    expect(fixture.resend).toHaveBeenCalledWith({ tribeId: fixture.tribeId, challengeId: fixture.challengeId, requestId: expect.any(String), operationId: fixture.operationId, useSmsAlternative: true });
    fixture.resend.mockResolvedValueOnce({ ok: true, value: { state: "started", operationId: randomUUID() } });
    expect((await fixture.handlers.resend(fixture.request({ operationId: fixture.operationId, confirmed: true }), context)).status).toBe(500);
  });

  it("should attach only the opaque proof to the routed own pending and reject a crossed request result", async () => {
    const fixture = routeFixture(), context = { params: Promise.resolve({ slug: "synthetic-academy", requestId: fixture.admissionRequestId }) }, body = { operationId: fixture.operationId, confirmed: true, expectedVersion: 1, proofId: fixture.proofId };
    const response = await fixture.handlers.applyProof(fixture.request(body), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ state: "completed", result: { outcome: "applied", requestId: fixture.admissionRequestId, requestVersion: 2, status: "pending" } });
    expect(fixture.applyProof).toHaveBeenCalledWith({ operationId: fixture.operationId, expectedRequestVersion: 1, proofId: fixture.proofId, tribeId: fixture.tribeId, admissionRequestId: fixture.admissionRequestId, requestId: expect.any(String) });
    fixture.applyProof.mockResolvedValueOnce({ ok: true, value: { state: "completed", operationId: fixture.operationId, replayed: false, result: { outcome: "applied", requestId: randomUUID(), requestVersion: 2, status: "pending", proofId: fixture.proofId } } });
    expect((await fixture.handlers.applyProof(fixture.request(body), context)).status).toBe(500);
  });

  it("should canonicalize valid uppercase proof references before the atomic application intent", async () => {
    const fixture = routeFixture(), context = { params: Promise.resolve({ slug: "synthetic-academy", requestId: fixture.admissionRequestId.toUpperCase() }) };
    const response = await fixture.handlers.applyProof(fixture.request({ operationId: fixture.operationId.toUpperCase(), confirmed: true, expectedVersion: 1, proofId: fixture.proofId.toUpperCase() }), context);
    expect(response.status).toBe(200);
    expect(fixture.applyProof).toHaveBeenCalledWith({ operationId: fixture.operationId, expectedRequestVersion: 1, proofId: fixture.proofId, tribeId: fixture.tribeId, admissionRequestId: fixture.admissionRequestId, requestId: expect.any(String) });
  });

  it.each(["verify", "resend"] as const)("should canonicalize uppercase challenge identity before %s", async (action) => {
    const fixture = routeFixture(), context = { params: Promise.resolve({ slug: "synthetic-academy", challengeId: fixture.challengeId.toUpperCase() }) };
    const body = action === "verify" ? { operationId: fixture.operationId, confirmed: true, verificationCode: "123456" } : { operationId: fixture.operationId, confirmed: true };
    const response = await fixture.handlers[action](fixture.request(body), context);
    expect(response.status).toBe(action === "verify" ? 200 : 201);
    expect(fixture[action]).toHaveBeenCalledWith(expect.objectContaining({ challengeId: fixture.challengeId }));
  });

  it.each(["issue", "verify", "resend"] as const)("should canonicalize the original operation UUID before %s and its replay", async (action) => {
    const fixture = routeFixture();
    const body = action === "issue" ? { ...fixture.body, operationId: fixture.operationId.toUpperCase() } : action === "verify" ? { operationId: fixture.operationId.toUpperCase(), confirmed: true, verificationCode: "123456" } : { operationId: fixture.operationId.toUpperCase(), confirmed: true };
    const context = action === "issue" ? { params: Promise.resolve({ slug: "synthetic-academy" }) } : { params: Promise.resolve({ slug: "synthetic-academy", challengeId: fixture.challengeId }) };
    const response = action === "issue" ? await fixture.handlers.issue(fixture.request(body), context) : await fixture.handlers[action](fixture.request(body), { params: Promise.resolve({ slug: "synthetic-academy", challengeId: fixture.challengeId }) });
    expect(response.status).toBe(action === "verify" ? 200 : 201);
    expect(fixture[action]).toHaveBeenCalledWith(expect.objectContaining({ operationId: fixture.operationId }));
    fixture[action].mockResolvedValueOnce({ ok: true, value: { state: "started", operationId: fixture.operationId } });
    const replay = action === "issue" ? await fixture.handlers.issue(fixture.request({ ...body, operationId: fixture.operationId }), context) : await fixture.handlers[action](fixture.request({ ...body, operationId: fixture.operationId }), { params: Promise.resolve({ slug: "synthetic-academy", challengeId: fixture.challengeId }) });
    expect(replay.status).toBe(202);
    expect(fixture[action]).toHaveBeenNthCalledWith(2, expect.objectContaining({ operationId: fixture.operationId }));
  });

  it.each(["issue", "verify", "resend", "applyProof"] as const)("should require explicit confirmation before composing %s", async (action) => {
    const fixture = routeFixture(), params = { slug: "synthetic-academy", challengeId: fixture.challengeId, requestId: fixture.admissionRequestId };
    const body = action === "issue" ? { operationId: fixture.operationId, expectedPolicyVersion: 1, channel: "email" } : action === "verify" ? { operationId: fixture.operationId, verificationCode: "123456" } : action === "applyProof" ? { operationId: fixture.operationId, expectedVersion: 1, proofId: fixture.proofId } : { operationId: fixture.operationId };
    // Exact native route params prevent unrelated resource fields from becoming hidden input authority.
    const response = action === "issue" ? await fixture.handlers.issue(fixture.request(body), { params: Promise.resolve({ slug: params.slug }) }) : action === "applyProof" ? await fixture.handlers.applyProof(fixture.request(body), { params: Promise.resolve({ slug: params.slug, requestId: params.requestId }) }) : await fixture.handlers[action](fixture.request(body), { params: Promise.resolve({ slug: params.slug, challengeId: params.challengeId }) });
    expect(response.status).toBe(400);
    expect(fixture.open).not.toHaveBeenCalled();
  });

  it("should allowlist public challenge fields and map private application failures to safe Spanish copy", async () => {
    const fixture = routeFixture(), context = { params: Promise.resolve({ slug: "synthetic-academy" }) };
    fixture.issue.mockResolvedValueOnce({ ok: true, value: { state: "completed", operationId: fixture.operationId, replayed: false, result: { ...fixture.challenge, destination: "synthetic-private@example.test", code: "123456", envelope: "synthetic-private" } } });
    expect(await (await fixture.handlers.issue(fixture.request(fixture.body), context)).json()).toEqual({ state: "completed", operationId: fixture.operationId, replayed: false, result: fixture.challenge });
    fixture.issue.mockResolvedValueOnce({ ok: false, failure: { code: "authentication_required", cause: new Error("Synthetic private native identity detail") } });
    const response = await fixture.handlers.issue(fixture.request(fixture.body), context), error = await response.json();
    expect(response.status).toBe(401);
    expect(error).toMatchObject({ code: "authentication_required", message: "Iniciá sesión para continuar con el ingreso.", requestId: expect.any(String) });
    expect(error).not.toHaveProperty("cause");
    expect(error).not.toHaveProperty("stack");
  });
});
