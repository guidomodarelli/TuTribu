/** @vitest-environment node */
/** Exercises real list HTTP validation and public DTO binding with doubles only of owning use cases. @module academy-admission-allowlist-route-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createAllowlistHandlers } from "@/src/modules/academy-admissions/infrastructure/api/allowlist-handlers";
import type { AllowlistServices } from "@/src/modules/academy-admissions/infrastructure/api/allowlist-handlers";

/** @returns Own HTTP ports and actual boundary handlers without replacing framework/platform libraries. */
function fixture() {
  const tribeId = randomUUID(), entryId = randomUUID(), operationId = randomUUID();
  const operation = { state: "completed" as const, operationId, replayed: false, result: { entryId, version: 1, changed: true, created: true } };
  const entry = { id: entryId, version: 1, contactType: "email" as const, identity: "entry@example.test", displayName: null, status: "enabled" as const, source: "manual" as const, createdAt: "2026-10-09T04:00:00Z", updatedAt: "2026-10-09T04:00:00Z" };
  const services: AllowlistServices = { resolveTribe: { execute: async () => ({ ok: true, value: { tribeId } }) }, allowlist: { list: vi.fn(async () => ({ ok: true as const, value: { items: [entry], nextCursor: null } })), read: vi.fn(async () => ({ ok: true as const, value: entry })), create: vi.fn(async () => ({ ok: true as const, value: operation })), update: vi.fn(async () => ({ ok: true as const, value: { ...operation, result: { ...operation.result, version: 2, created: false } } })) } };
  const open = vi.fn(async () => services), handlers = createAllowlistHandlers(open), context = { params: Promise.resolve({ slug: "synthetic" }) }, entryContext = { params: Promise.resolve({ slug: "synthetic", entryId }) };
  /** @param method - Static route operation. @param body - Own proposal only. @param query - Explicit bounded search. @returns A native same-origin request. */
  const request = (method = "GET", body?: unknown, query = "") => new Request(`https://tutribu.example.test/api/tribes/synthetic/admissions/allowlist${query}`, { method, headers: { origin: "https://tutribu.example.test", "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { tribeId, entryId, operationId, entry, operation, services, open, handlers, context, entryContext, request };
}

describe("allowlist native HTTP contracts", () => {
  it("should return bounded list metadata without invoking a command", async () => {
    const data = fixture(), response = await data.handlers.list(data.request("GET", undefined, "?limit=1&status=enabled"), data.context);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ items: [data.entry], nextCursor: null });
    expect(data.services.allowlist.list).toHaveBeenCalledWith(expect.objectContaining({ tribeId: data.tribeId, limit: 1, status: "enabled" }));
    expect(data.services.allowlist.create).not.toHaveBeenCalled(); expect(data.services.allowlist.update).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("should reject nonpositive version, foreign authority and malformed cursor before native composition", async () => {
    const data = fixture();
    expect((await data.handlers.update(data.request("PATCH", { operationId: data.operationId, confirmed: true, expectedVersion: 0, status: "disabled" }), data.entryContext)).status).toBe(400);
    expect((await data.handlers.create(data.request("POST", { operationId: data.operationId, confirmed: true, contactType: "email", identity: "entry@example.test", ownerUserId: "foreign" }), data.context)).status).toBe(400);
    expect((await data.handlers.list(data.request("GET", undefined, "?cursor=malformed"), data.context)).status).toBe(400);
    expect(data.open).not.toHaveBeenCalled();
  });

  it("should bind canonical original creation and entry update without accepting an invented version", async () => {
    const data = fixture();
    const created = await data.handlers.create(data.request("POST", { operationId: data.operationId.toUpperCase(), confirmed: true, contactType: "email", identity: "entry@example.test" }), data.context);
    expect(created.status).toBe(201);
    expect((await created.json()).operationId).toBe(data.operationId);
    const updated = await data.handlers.update(data.request("PATCH", { operationId: data.operationId, confirmed: true, expectedVersion: 1, status: "disabled" }), data.entryContext);
    expect(updated.status).toBe(200);
    expect(data.services.allowlist.update).toHaveBeenCalledWith(expect.objectContaining({ entryId: data.entryId, expectedVersion: 1, patch: { status: "disabled" } }));
    vi.mocked(data.services.allowlist.update).mockResolvedValue({ ok: true, value: { ...data.operation, result: { ...data.operation.result, entryId: randomUUID(), version: 2, created: false } } });
    const crossed = await data.handlers.update(data.request("PATCH", { operationId: data.operationId, confirmed: true, expectedVersion: 1, status: "disabled" }), data.entryContext);
    expect(crossed.status).toBe(500);
    expect(await crossed.json()).toMatchObject({ code: "public_contract_unusable" });
  });

  it("should preserve catalogue permission denial without returning list identity", async () => {
    const data = fixture();
    vi.mocked(data.services.allowlist.list).mockResolvedValue({ ok: false, failure: { code: "permission_denied" } });
    const response = await data.handlers.list(data.request(), data.context);
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body).toMatchObject({ code: "permission_denied" });
    expect(JSON.stringify(body).includes(data.entry.identity)).toBe(false);
  });
});
