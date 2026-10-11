/** Exercises the real JSON/origin/public-result guards with controlled owned application ports. @module tribe-membership-lifecycle-route-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createTribeMembershipLifecycleHandlers } from "@/src/modules/tribes/infrastructure/api/tribe-membership-lifecycle-handlers";
import { TribeMembershipLifecycleError } from "@/src/modules/tribes/domain/errors/tribe-membership-lifecycle-error";
import type { ManageTribeMembershipUseCases } from "@/src/modules/tribes/application/use-cases/manage-tribe-membership-use-cases";

/** @returns An explicit original and owned application ports, without mocking Zod or framework libraries. */
function routeFixture() {
  const tribeId = randomUUID(), input = { operationId: randomUUID(), memberId: randomUUID(), action: "leave" as const, expectedStatus: "muted" as const, confirmed: true };
  const original = { state: "completed" as const, operationId: input.operationId, replayed: false, result: { outcome: "changed" as const, memberId: input.memberId, action: input.action, status: "removed" as const, deleted: true } };
  const change = vi.fn<ManageTribeMembershipUseCases["change"]>(async () => original), recover = vi.fn<ManageTribeMembershipUseCases["recover"]>(async () => original), resolveTribe = { execute: vi.fn(async () => ({ ok: true as const, value: { tribeId } })) };
  const open = vi.fn(async () => ({ membership: { change, recover }, resolveTribe }));
  const handlers = createTribeMembershipLifecycleHandlers(open), context = { params: Promise.resolve({ slug: "synthetic-academy" }) };
  const request = (body: unknown = input, path = "/membership", origin = "https://synthetic.example.test") => new Request(`https://synthetic.example.test/api/tribes/synthetic-academy${path}`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
  return { tribeId, input, original, change, recover, resolveTribe, open, handlers, context, request };
}

describe("membership lifecycle HTTP boundary", () => {
  it("should validate and bind a confirmed original to internal tenant scope without refreshing any route", async () => {
    const fixture = routeFixture(), response = await fixture.handlers.change(fixture.request(), fixture.context);
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store"); expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(await response.json()).toEqual(fixture.original);
    expect(fixture.change).toHaveBeenCalledWith({ ...fixture.input, tribeId: fixture.tribeId, requestId: expect.any(String) });
  });
  it("should canonicalize valid uppercase member and operation UUIDs before invoking the owner", async () => {
    const fixture = routeFixture(), input = { ...fixture.input, memberId: fixture.input.memberId.toUpperCase(), operationId: fixture.input.operationId.toUpperCase() };
    const response = await fixture.handlers.change(fixture.request(input), fixture.context);
    expect(response.status).toBe(200); expect(fixture.change).toHaveBeenCalledWith({ ...fixture.input, tribeId: fixture.tribeId, requestId: expect.any(String) });
  });
  it.each([{ paid: true }, { actorUserId: "synthetic-other-user" }, { role: "leader" }, { sessionId: "synthetic-session" }])("should reject authority supplied in the body before composition: %j", async (authority) => {
    const fixture = routeFixture(), response = await fixture.handlers.change(fixture.request({ ...fixture.input, ...authority }), fixture.context);
    expect(response.status).toBe(400); expect(await response.json()).toMatchObject({ code: "invalid_input" }); expect(fixture.open).not.toHaveBeenCalled();
  });
  it("should reject another origin before composing a membership owner", async () => {
    const fixture = routeFixture(), response = await fixture.handlers.change(fixture.request(fixture.input, "/membership", "https://other.example.test"), fixture.context);
    expect(response.status).toBe(403); expect(fixture.open).not.toHaveBeenCalled();
  });
  it("should recover an original without invoking the mutation port", async () => {
    const fixture = routeFixture(), response = await fixture.handlers.recover(fixture.request(fixture.input, "/membership/recover"), fixture.context);
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ original: fixture.original }); expect(fixture.recover).toHaveBeenCalledTimes(1); expect(fixture.change).not.toHaveBeenCalled();
  });
  it("should preserve an unknown original as null without starting the change", async () => {
    const fixture = routeFixture(); fixture.recover.mockResolvedValue(null);
    const response = await fixture.handlers.recover(fixture.request(fixture.input, "/membership/recover"), fixture.context);
    expect(await response.json()).toEqual({ original: null }); expect(fixture.change).not.toHaveBeenCalled();
  });
  it("should reject private result fields instead of serializing native session data", async () => {
    const fixture = routeFixture(), invalidResult = { ...fixture.original, sessionId: "synthetic-sensitive-session" }; fixture.change.mockResolvedValue(invalidResult);
    const response = await fixture.handlers.change(fixture.request(), fixture.context), json = await response.json();
    expect(response.status).toBe(500); expect(json).toMatchObject({ code: "public_contract_unusable" }); expect(JSON.stringify(json)).not.toContain("synthetic-sensitive-session");
  });
  it("should map a typed unknown outcome to its same original without exposing private diagnostics", async () => {
    const fixture = routeFixture(); fixture.change.mockRejectedValue(new TribeMembershipLifecycleError("operation_unresolved", { operationId: fixture.input.operationId, cause: new Error("synthetic-sensitive-diagnostic") }));
    const response = await fixture.handlers.change(fixture.request(), fixture.context), json = await response.json();
    expect(response.status).toBe(202); expect(json).toMatchObject({ code: "operation_unresolved", operationId: fixture.input.operationId }); expect(JSON.stringify(json)).not.toContain("synthetic-sensitive-diagnostic");
  });
  it("should preserve a completed known rejection instead of reporting unresolved work", async () => {
    const fixture = routeFixture(); fixture.change.mockResolvedValue({ ...fixture.original, result: { outcome: "denied", code: "membership_conflict" } });
    const response = await fixture.handlers.change(fixture.request(), fixture.context);
    expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ state: "completed", result: { outcome: "denied", code: "membership_conflict" } });
  });
});
