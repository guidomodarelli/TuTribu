/** @vitest-environment node */
/** Exercises real recovery input/output guards and safe HTTP outcomes with only own service ports. @module notification-delivery-recovery-http-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createNotificationDeliveryRecoveryHandler, type NotificationDeliveryRecoveryServices } from "@/src/modules/messaging/infrastructure/api/notification-delivery-recovery-handler";

/** @returns One coherent original/target/CAS intent and controllable own service outcome. */
function prepareHttp() {
  const tribeId = randomUUID(), deliveryId = randomUUID();
  const body = { operationId: randomUUID(), expectedVersion: 4, targetConnectionId: randomUUID(), expectedTargetVersion: 8, confirmed: true, reason: "authorized_connection_replacement" };
  const result = { originalDeliveryId: deliveryId, recoveryDeliveryId: randomUUID(), originalVersion: 5, targetConnectionId: body.targetConnectionId, targetConnectionVersion: 3 };
  let opens = 0;
  const calls: unknown[] = [];
  let outcome: Awaited<ReturnType<NotificationDeliveryRecoveryServices["recovery"]["execute"]>> = { ok: true, value: { state: "completed", operationId: body.operationId, result, replayed: false } };
  const handler = createNotificationDeliveryRecoveryHandler(async () => {
    opens += 1;
    return { resolveTribe: { execute: async () => ({ ok: true as const, value: { tribeId } }) }, recovery: { execute: async (input) => { calls.push(input); return outcome; } } };
  });
  const context = { params: Promise.resolve({ slug: "synthetic-tribe", deliveryId }) };
  const request = (input: unknown = body, query = "", origin = "https://app.example.test") => new Request(`https://app.example.test/api/tribes/synthetic-tribe/messaging/deliveries/${deliveryId}/recover${query}`, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify(input) });
  return { handler, body, result, context, request, tribeId, calls, get opens() { return opens; }, setOutcome(value: typeof outcome) { outcome = value; } };
}

describe("explicit notification recovery HTTP", () => {
  it("should return only committed metadata and keep target lifecycle CAS separate from the frozen sending version", async () => {
    const fixture = prepareHttp();
    const response = await fixture.handler(fixture.request(), fixture.context);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({ state: "completed", operationId: fixture.body.operationId, result: fixture.result, replayed: false });
    expect(fixture.calls).toHaveLength(1);
    expect(fixture.calls[0]).toMatchObject({ tribeId: fixture.tribeId, deliveryId: fixture.result.originalDeliveryId, targetConnectionId: fixture.body.targetConnectionId, expectedTargetVersion: 8 });
    expect(fixture.calls[0]).not.toHaveProperty("actorUserId");
  });

  it("should return accepted only for genuinely registered original progress", async () => {
    const fixture = prepareHttp();
    fixture.setOutcome({ ok: true, value: { state: "started", operationId: fixture.body.operationId } });
    const response = await fixture.handler(fixture.request(), fixture.context);
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ state: "started", operationId: fixture.body.operationId });
    expect(fixture.calls).toHaveLength(1);
  });

  it.each(["authority", "reason", "consent", "version", "target"])("should reject invalid %s before opening native services", async (kind) => {
    const fixture = prepareHttp();
    const extra = kind === "authority" ? { actorUserId: randomUUID(), deduplicationProven: true } : kind === "reason" ? { reason: "retry_uncertain" } : kind === "consent" ? { confirmed: false } : kind === "version" ? { expectedVersion: 0 } : { targetConnectionId: "invalid" };
    const response = await fixture.handler(fixture.request({ ...fixture.body, ...extra }), fixture.context);
    expect(response.status).toBe(400);
    expect(fixture.opens).toBe(0);
    expect(fixture.calls).toHaveLength(0);
  });

  it("should reject cross-origin requests and authority query flags without opening services", async () => {
    const fixture = prepareHttp();
    expect((await fixture.handler(fixture.request(fixture.body, "", "https://foreign.example.test"), fixture.context)).status).toBe(403);
    expect((await fixture.handler(fixture.request(fixture.body, "?verified=true"), fixture.context)).status).toBe(400);
    expect(fixture.opens).toBe(0);
  });

  it.each(["operation", "original", "target", "version", "self_child"])("should reject a valid-shaped result that crosses the requested %s", async (kind) => {
    const fixture = prepareHttp();
    const result = { ...fixture.result, ...(kind === "original" ? { originalDeliveryId: randomUUID() } : kind === "target" ? { targetConnectionId: randomUUID() } : kind === "version" ? { originalVersion: 4 } : kind === "self_child" ? { recoveryDeliveryId: fixture.result.originalDeliveryId.toUpperCase() } : {}) };
    fixture.setOutcome({ ok: true, value: { state: "completed", operationId: kind === "operation" ? randomUUID() : fixture.body.operationId, result, replayed: false } });
    const response = await fixture.handler(fixture.request(), fixture.context);
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ code: "public_contract_unusable" });
  });

  it("should map current recency failure to safe Spanish without publishing private causes", async () => {
    const fixture = prepareHttp();
    fixture.setOutcome({ ok: false, failure: { code: "reauthentication_required", cause: new Error("Synthetic private diagnostic") } });
    const response = await fixture.handler(fixture.request(), fixture.context);
    expect(response.status).toBe(401);
    const payload = await response.json();
    expect(payload).toMatchObject({ code: "reauthentication_required" });
    expect(payload.message).toMatch(/confirm/i);
    expect(payload).not.toHaveProperty("cause");
    expect(JSON.stringify(payload)).not.toContain("Synthetic private diagnostic");
  });

  it("should reject failure progress assigned to a different operation", async () => {
    const fixture = prepareHttp();
    fixture.setOutcome({ ok: false, failure: { code: "operation_unresolved", operation: { operationId: randomUUID(), state: "started" } } });
    const response = await fixture.handler(fixture.request(), fixture.context);
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ code: "public_contract_unusable" });
  });

  it("should expose an original delivery conflict as 409 without private causes", async () => {
    const fixture = prepareHttp();
    fixture.setOutcome({ ok: false, failure: { code: "delivery_conflict", cause: new Error("Synthetic private conflict detail") } });
    const response = await fixture.handler(fixture.request(), fixture.context);
    expect(response.status).toBe(409);
    const payload = await response.json();
    expect(payload).toMatchObject({ code: "delivery_conflict" });
    expect(payload).not.toHaveProperty("cause");
  });
});
