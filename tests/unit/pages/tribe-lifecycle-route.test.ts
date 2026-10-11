/** Exercises real input/output/origin guards with only owned application ports controlled. @module tribe-lifecycle-route-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createTribeLifecycleHandlers } from "@/src/modules/tribes/infrastructure/api/tribe-lifecycle-handlers";
import type { ManageTribeLifecycleUseCases } from "@/src/modules/tribes/application/use-cases/manage-tribe-lifecycle-use-cases";
import { TribeLifecycleError } from "@/src/modules/tribes/domain/errors/tribe-lifecycle-error";

/** @returns A deleted UUID scope and safe original metadata, without a live slug or caller authority. */
function routeFixture() {
  const tribeId = randomUUID(), input = { operationId: randomUUID(), action: "delete_tribe" as const, expectedConfigVersion: 1, confirmed: true };
  const original = { state: "completed" as const, operationId: input.operationId, replayed: false, result: { action: input.action, deleted: true as const, accessModel: null, configVersion: null } };
  const change = vi.fn<ManageTribeLifecycleUseCases["change"]>(async () => original), recover = vi.fn<ManageTribeLifecycleUseCases["recover"]>(async () => ({ ...original, replayed: true }));
  const open = vi.fn(async () => ({ lifecycle: { change, recover } })), handlers = createTribeLifecycleHandlers(open), context = { params: Promise.resolve({ tribeId }) };
  const request = (body: unknown = input, origin = "https://synthetic.example.test") => new Request(`https://synthetic.example.test/api/tribe-lifecycle/${tribeId}`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
  return { tribeId, input, original, change, recover, open, handlers, context, request };
}

describe("tribe lifecycle HTTP boundary", () => {
  it("should return only original safe metadata and private response headers for a confirmed deletion", async () => {
    const fixture = routeFixture(), response = await fixture.handlers.change(fixture.request(), fixture.context);
    expect(response.status).toBe(200); expect(await response.json()).toEqual(fixture.original);
    expect(response.headers.get("cache-control")).toBe("no-store"); expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(fixture.change).toHaveBeenCalledWith({ ...fixture.input, tribeId: fixture.tribeId, requestId: expect.any(String) });
  });
  it("should canonicalize the original operation and UUID scope once before invoking the owner", async () => {
    const fixture = routeFixture();
    await fixture.handlers.change(fixture.request({ ...fixture.input, operationId: fixture.input.operationId.toUpperCase() }), { params: Promise.resolve({ tribeId: fixture.tribeId.toUpperCase() }) });
    expect(fixture.change).toHaveBeenCalledWith({ ...fixture.input, tribeId: fixture.tribeId, requestId: expect.any(String) });
  });
  it.each([{ role: "leader" }, { actorUserId: "synthetic-other" }, { reauthenticated: true }, { authenticatedAt: "2026-10-11T12:00:00Z" }, { secret: "synthetic-private" }])("should reject authority flags before native composition: %j", async (authority) => {
    const fixture = routeFixture(), response = await fixture.handlers.change(fixture.request({ ...fixture.input, ...authority }), fixture.context);
    expect(response.status).toBe(400); expect(await response.json()).toMatchObject({ code: "invalid_input" }); expect(fixture.open).not.toHaveBeenCalled();
  });
  it("should recover the original after deletion without invoking a mutation or looking up a slug", async () => {
    const fixture = routeFixture(), response = await fixture.handlers.recover(fixture.request(), fixture.context);
    expect(await response.json()).toEqual({ original: { ...fixture.original, replayed: true } }); expect(fixture.change).not.toHaveBeenCalled(); expect(fixture.recover).toHaveBeenCalledTimes(1);
  });
  it("should preserve an unknown original as null without starting a lifecycle change", async () => {
    const fixture = routeFixture(); fixture.recover.mockResolvedValue(null);
    expect(await (await fixture.handlers.recover(fixture.request(), fixture.context)).json()).toEqual({ original: null }); expect(fixture.change).not.toHaveBeenCalled();
  });
  it("should reject another origin before reading input or native authority", async () => {
    const fixture = routeFixture(), response = await fixture.handlers.change(fixture.request(fixture.input, "https://other.example.test"), fixture.context);
    expect(response.status).toBe(403); expect(fixture.open).not.toHaveBeenCalled();
  });
  it("should map exact reauthentication failures to safe Spanish copy without exposing their cause", async () => {
    const fixture = routeFixture(); fixture.change.mockRejectedValue(new TribeLifecycleError("reauthentication_required", { cause: new Error("synthetic-sensitive-cause") }));
    const response = await fixture.handlers.change(fixture.request(), fixture.context), result = await response.json();
    expect(response.status).toBe(403); expect(result).toMatchObject({ code: "reauthentication_required", message: "Confirmá tu identidad para esta acción en esta tribu." }); expect(JSON.stringify(result)).not.toContain("synthetic-sensitive-cause");
  });
  it("should reject private fields in a result rather than forwarding archived resource data", async () => {
    const fixture = routeFixture(), invalid = { ...fixture.original, retiredBindings: "synthetic-sensitive-contact" }; fixture.change.mockResolvedValue(invalid);
    const response = await fixture.handlers.change(fixture.request(), fixture.context), result = await response.json();
    expect(response.status).toBe(500); expect(result).toMatchObject({ code: "public_contract_unusable" }); expect(JSON.stringify(result)).not.toContain("synthetic-sensitive-contact");
  });
});
