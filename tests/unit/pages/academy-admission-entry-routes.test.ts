/** @vitest-environment node */
/** Exercises the real compatibility boundary with only inward application ports replaced. @module academy-admission-entry-route-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createAcademyJoinHandler, type AcademyJoinServices } from "@/src/modules/academy-admissions/infrastructure/api/academy-join-handler";

/** Native Request/Response and Zod remain real; no SDK, framework or UI library is mocked. */
function fixture() {
  const operationId = randomUUID(), admissionRequestId = randomUUID();
  const requestSnapshot = { id: admissionRequestId, status: "pending", version: 1, submittedAt: "2026-10-07T00:00:00Z", expiresAt: "2026-11-06T00:00:00Z", source: "common", needsVerification: false, eligibilityReasons: [] };
  const services = {
    getViewer: vi.fn<AcademyJoinServices["getViewer"]>(async () => ({ id: "synthetic-account" })),
    offer: vi.fn<AcademyJoinServices["offer"]>(async () => ({ admissionEnabled: true, admissionRequiresRequest: true, title: "Academia", description: "", benefits: [], offerVersion: 1, price: null, salesEnabled: false, tribeName: "Academia" })),
    joinEntry: vi.fn<AcademyJoinServices["joinEntry"]>(async () => ({ ok: true, value: { state: "completed", operationId, replayed: false, result: { operationId, outcome: "pending", admissionRequestId, committedRequestVersion: 1, membership: null, requestSnapshot, created: true } } })),
    joinLegacy: vi.fn<AcademyJoinServices["joinLegacy"]>(async () => ({ status: "joined" })),
  };
  const open = vi.fn(async () => services), handler = createAcademyJoinHandler(open);
  const url = "https://tutribu.example.invalid/api/tribes/synthetic-academy/academy/join";
  const body = { operationId, expectedPolicyVersion: 1, confirmed: true, message: "Quiero participar." };
  return { services, handler, open, url, body, operationId, admissionRequestId, context: { params: Promise.resolve({ slug: "synthetic-academy" }) } };
}

describe("compatibility academy entry boundary", () => {
  it.each(["admitted", "already_member"] as const)("should preserve the admission owner's %s outcome without translating it to historical joined", async (outcome) => {
    const data = fixture();
    data.services.joinEntry.mockResolvedValueOnce({ ok: true, value: { state: "completed", operationId: data.operationId, replayed: false, result: { operationId: data.operationId, outcome, admissionRequestId: null, committedRequestVersion: null, membership: { role: "tribemate", status: "active" }, created: outcome === "admitted" } } });
    const response = await data.handler(new Request(data.url, { method: "POST", body: JSON.stringify(data.body) }), data.context);
    expect(await response.json()).toMatchObject({ outcome, membership: { role: "tribemate", status: "active" } });
    expect(data.services.joinLegacy).not.toHaveBeenCalled();
  });

  it("should preserve a real pending result and original key without returning joined or invoking the direct writer", async () => {
    const data = fixture(), request = new Request(data.url, { method: "POST", body: JSON.stringify(data.body), headers: { "content-type": "application/json", origin: "https://tutribu.example.invalid" } });
    const response = await data.handler(request, data.context), result = await response.json();
    expect(response.status).toBe(201);
    expect(result).toMatchObject({ outcome: "pending", operationId: data.operationId, request: { id: data.admissionRequestId, version: 1 } });
    expect(result).not.toHaveProperty("membership");
    expect(result).not.toHaveProperty("status", "joined");
    expect(data.services.joinEntry).toHaveBeenCalledWith(expect.objectContaining({ ...data.body, tribeSlug: "synthetic-academy", requestId: expect.any(String) }));
    expect(data.services.joinLegacy).not.toHaveBeenCalled();
    expect(request.bodyUsed).toBe(true);
  });

  it("should reject an empty old client after cutover instead of granting or inventing a request", async () => {
    const data = fixture(), response = await data.handler(new Request(data.url, { method: "POST" }), data.context);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "invalid_input" });
    expect(data.services.joinLegacy).not.toHaveBeenCalled();
    expect(data.services.joinEntry).not.toHaveBeenCalled();
  });

  it("should retain guarded historical entry before cutover and deny missing native identity", async () => {
    const data = fixture(); data.services.offer.mockResolvedValueOnce(null);
    const response = await data.handler(new Request(data.url, { method: "POST" }), data.context);
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ status: "joined" });
    expect(data.services.joinEntry).not.toHaveBeenCalled();
    data.services.getViewer.mockResolvedValueOnce(null);
    expect((await data.handler(new Request(data.url, { method: "POST" }), data.context)).status).toBe(401);
    expect(data.services.joinLegacy).toHaveBeenCalledTimes(1);
  });

  it("should consume an actual empty POST stream once while rejecting malformed nonempty JSON", async () => {
    const data = fixture(); data.services.offer.mockResolvedValueOnce(null);
    const request = new Request(data.url, { method: "POST", body: new ReadableStream({ start(controller) { controller.close(); } }), duplex: "half" } as RequestInit);
    expect((await data.handler(request, data.context)).status).toBe(201);
    expect(request.bodyUsed).toBe(true);
    expect((await data.handler(new Request(data.url, { method: "POST", body: "{" }), data.context)).status).toBe(400);
    expect(data.services.joinLegacy).toHaveBeenCalledTimes(1);
  });

  it("should reject role/email/proof claims, query flags, foreign origin and malformed JSON before opening application", async () => {
    const data = fixture();
    for (const body of [{ ...data.body, email: "foreign@example.test" }, { ...data.body, verified: true }, { ...data.body, paid: true }, { ...data.body, confirmed: false }]) expect((await data.handler(new Request(data.url, { method: "POST", body: JSON.stringify(body) }), data.context)).status).toBe(400);
    expect((await data.handler(new Request(`${data.url}?role=leader`, { method: "POST" }), data.context)).status).toBe(400);
    expect((await data.handler(new Request(data.url, { method: "POST", headers: { origin: "https://other.example.invalid" } }), data.context)).status).toBe(403);
    expect((await data.handler(new Request(data.url, { method: "POST", body: "{" }), data.context)).status).toBe(400);
    expect(data.open).not.toHaveBeenCalled();
  });

  it("should preserve genuinely registered started work and strip private causes from a business denial", async () => {
    const data = fixture(); data.services.joinEntry.mockResolvedValueOnce({ ok: true, value: { state: "started", operationId: data.operationId } });
    const request = () => new Request(data.url, { method: "POST", body: JSON.stringify(data.body) });
    const progress = await data.handler(request(), data.context);
    expect(progress.status).toBe(202);
    expect(await progress.json()).toEqual({ state: "started", operationId: data.operationId });
    data.services.joinEntry.mockResolvedValueOnce({ ok: false, failure: { code: "policy_conflict", cause: new Error("Synthetic private diagnostic") } });
    const denied = await data.handler(request(), data.context);
    expect(denied.status).toBe(409);
    expect(await denied.json()).not.toHaveProperty("cause");
  });
});
