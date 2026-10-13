/** @vitest-environment node */
/** Exercises real usage authority and HTTP input/DTO boundaries with doubles only of own storage ports. @module academy-messaging-usage-policy-routes-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { ManageMessagingUsageUseCases } from "@/src/modules/messaging/application/use-cases/manage-messaging-usage-use-cases";
import { createMessagingUsagePolicyHandlers } from "@/src/modules/messaging/infrastructure/api/messaging-usage-policy-handlers";
import { MessagingUsageOperationError } from "@/src/modules/messaging/domain/errors/messaging-usage-operation-error";
import type { MessagingAuthenticatedAccount, MessagingLeadershipFacts } from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import type { MessagingUsagePolicyResult, MessagingUsagePolicyStateResult } from "@/src/modules/messaging/application/results/messaging-usage-policy-result";
import type { MessagingUsageOperations } from "@/src/modules/messaging/domain/repositories/messaging-usage-operations";
import { ReadMessagingUsageOperationUseCase } from "@/src/modules/messaging/application/use-cases/read-messaging-usage-operation-use-case";
import { createMessagingUsageOperationHandler } from "@/src/modules/messaging/infrastructure/api/messaging-usage-operation-handler";

/** No connection/key/provider port is available to the tested use case. */
function fixture() {
  const now = new Date("2026-10-07T12:00:00Z"), tribeId = randomUUID(), userId = randomUUID(), sessionId = randomUUID(), accountId = randomUUID(), subject = randomUUID();
  const account: MessagingAuthenticatedAccount = { userId, session: { id: sessionId, expiresAt: new Date("2026-10-08T12:00:00Z") }, googleAccount: { id: accountId, subject }, recentAuthentication: ["initialize_messaging_usage", "update_messaging_usage"].map((operation) => ({ id: randomUUID(), intentId: randomUUID(), userId, sessionId, accountId, subject, tribeId, operation, resourceId: tribeId, authenticatedAt: now, verifiedAt: now, validUntil: new Date("2026-10-07T12:09:00Z"), invalidatedAt: null })) };
  const leadership: MessagingLeadershipFacts = { tribeId, leaderUserId: userId, membership: { userId, role: "leader", status: "active" } };
  const policy: MessagingUsagePolicyResult = { version: 1, allowedCountries: [], verificationDailyLimit: 100, notificationDailyLimit: 200, platformMaximums: { verificationDailyLimit: 1000, notificationDailyLimit: 5000 }, consumption: { verificationToday: 0, notificationToday: 0 } };
  const operations: MessagingUsageOperations<MessagingUsagePolicyResult, MessagingUsagePolicyStateResult> = {
    read: vi.fn<MessagingUsageOperations<MessagingUsagePolicyResult, MessagingUsagePolicyStateResult>["read"]>(async () => ({ state: "not_configured", policy: null })),
    initialize: vi.fn<MessagingUsageOperations<MessagingUsagePolicyResult, MessagingUsagePolicyStateResult>["initialize"]>(async (_context, operationId) => ({ state: "completed", operationId, replayed: false, result: policy })),
    update: vi.fn<MessagingUsageOperations<MessagingUsagePolicyResult, MessagingUsagePolicyStateResult>["update"]>(async (_context, input) => ({ state: "completed", operationId: input.operationId, replayed: false, result: { ...policy, version: input.expectedVersion + 1, allowedCountries: input.allowedCountries, verificationDailyLimit: input.verificationDailyLimit, notificationDailyLimit: input.notificationDailyLimit } })),
  };
  const usage = new ManageMessagingUsageUseCases({ getAuthenticatedAccount: async () => account }, { getCurrentLeadership: async () => leadership }, operations, () => now);
  const open = vi.fn(async () => ({ usage, resolveTribe: { execute: async () => ({ ok: true as const, value: { tribeId } }) } }));
  const request = (method: string, body?: object, query = "", origin = "https://tutribu.example.test") => new Request(`https://tutribu.example.test/api/tribes/synthetic-academy/messaging/usage-policy${query}`, { method, headers: { origin, "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const input = { operationId: randomUUID(), confirmed: true as const, expectedVersion: 1, allowedCountries: [" ar ", "us"], verificationDailyLimit: 0, notificationDailyLimit: 200 };
  return { account, leadership, tribeId, operations, policy, open, request, input, context: { params: Promise.resolve({ slug: "synthetic-academy" }) }, handlers: createMessagingUsagePolicyHandlers(open) };
}

describe("usage policy HTTP", () => {
  it("should recover only the current leader's original own DTO without recency, browser audience or private causes", async () => {
    const data = fixture(), operationId = randomUUID(); data.account.googleAccount = null; data.account.recentAuthentication = [];
    const operation = new ReadMessagingUsageOperationUseCase({ getAuthenticatedAccount: async () => data.account }, { getCurrentLeadership: async () => data.leadership }, { read: async () => ({ type: "initialize_messaging_usage", state: "completed", operationId, replayed: true, result: data.policy, privateCause: "synthetic-private" }) }, () => new Date("2026-10-07T12:00:00Z"));
    const services = await data.open(), open = vi.fn(async () => ({ operation, resolveTribe: services.resolveTribe }));
    const handler = createMessagingUsageOperationHandler(open), context = { params: Promise.resolve({ slug: "synthetic-academy", operationId }) };
    expect((await handler(data.request("GET", undefined, "?actor=foreign"), context)).status).toBe(400);
    expect(open).not.toHaveBeenCalled();
    const response = await handler(data.request("GET"), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ type: "initialize_messaging_usage", state: "completed", operationId, replayed: true, result: data.policy });
    data.leadership.membership!.role = "guardian";
    expect((await handler(data.request("GET"), context)).status).toBe(403);
  });
  it("should publish read-only absence without claiming a version, creating defaults or requiring recency", async () => {
    const data = fixture(); data.account.googleAccount = null; data.account.recentAuthentication = [];
    const response = await data.handlers.read(data.request("GET"), data.context);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ state: "not_configured", policy: null });
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(data.operations.initialize).not.toHaveBeenCalled();
    expect(data.operations.update).not.toHaveBeenCalled();
  });

  it("should reject browser authority, invalid paths and foreign origins before opening composition", async () => {
    const data = fixture();
    expect((await data.handlers.read(data.request("GET", undefined, "?role=leader"), data.context)).status).toBe(400);
    expect((await data.handlers.initialize(data.request("POST", { operationId: randomUUID(), confirmed: true, allowedCountries: ["AR"] }), data.context)).status).toBe(400);
    expect((await data.handlers.update(data.request("PUT", { ...data.input, hasRecentAuthentication: true }), data.context)).status).toBe(400);
    expect((await data.handlers.update(data.request("PUT", data.input, "", "https://foreign.example.test"), data.context)).status).toBe(403);
    expect((await data.handlers.read(data.request("GET"), { params: Promise.resolve({ slug: "../foreign" }) })).status).toBe(400);
    expect(data.open).not.toHaveBeenCalled();
  });

  it("should initialize server defaults and normalize one versioned country owner while preserving a zero quota", async () => {
    const data = fixture(), operationId = randomUUID();
    const created = await data.handlers.initialize(data.request("POST", { operationId, confirmed: true }), data.context);
    expect(created.status).toBe(200);
    expect(await created.json()).toMatchObject({ state: "completed", operationId, result: { version: 1, allowedCountries: [], verificationDailyLimit: 100 } });
    const saved = await data.handlers.update(data.request("PUT", data.input), data.context);
    expect(saved.status).toBe(200);
    expect(await saved.json()).toMatchObject({ state: "completed", operationId: data.input.operationId, result: { version: 2, allowedCountries: ["AR", "US"], verificationDailyLimit: 0 } });
  });

  it("should deny guardians and operation-crossed recency before storage while keeping reads available to a leader", async () => {
    const data = fixture(); data.leadership.membership!.role = "guardian";
    expect((await data.handlers.read(data.request("GET"), data.context)).status).toBe(403);
    expect((await data.handlers.update(data.request("PUT", data.input), data.context)).status).toBe(403);
    expect(data.operations.read).not.toHaveBeenCalled(); expect(data.operations.update).not.toHaveBeenCalled();
    data.leadership.membership!.role = "leader";
    data.account.recentAuthentication = data.account.recentAuthentication.filter((evidence) => evidence.operation === "initialize_messaging_usage");
    expect((await data.handlers.update(data.request("PUT", data.input), data.context)).status).toBe(401);
    expect((await data.handlers.read(data.request("GET"), data.context)).status).toBe(200);
  });

  it("should keep stale conflict and registered progress distinct from successful configuration", async () => {
    const data = fixture();
    data.operations.update = async () => { throw new MessagingUsageOperationError("usage_policy_conflict"); };
    expect((await data.handlers.update(data.request("PUT", data.input), data.context)).status).toBe(409);
    data.operations.update = async (_context, input) => ({ state: "started", operationId: input.operationId });
    const started = await data.handlers.update(data.request("PUT", data.input), data.context);
    expect(started.status).toBe(202);
    expect(await started.json()).toEqual({ state: "started", operationId: data.input.operationId });
    data.operations.update = async () => { throw new Error("Synthetic private storage diagnostic"); };
    const failed = await data.handlers.update(data.request("PUT", data.input), data.context);
    expect(failed.status).toBe(500);
    expect(JSON.stringify(await failed.json())).not.toContain("Synthetic private");
  });

  it("should reject a foreign operation identity or unusable owned DTO without exposing internal fields", async () => {
    const data = fixture();
    data.operations.update = async () => ({ state: "completed", operationId: randomUUID(), replayed: false, result: data.policy });
    expect((await data.handlers.update(data.request("PUT", data.input), data.context)).status).toBe(500);
    data.operations.update = async (_context, input) => ({ state: "completed", operationId: input.operationId, replayed: false, result: { ...data.policy, version: 9 } });
    expect((await data.handlers.update(data.request("PUT", data.input), data.context)).status).toBe(500);
    data.operations.read = async () => ({ state: "configured", policy: { ...data.policy, version: 0 } });
    expect((await data.handlers.read(data.request("GET"), data.context)).status).toBe(500);
  });

  it("should allow a current no-op or original changed replay without requiring today's policy version", async () => {
    const data = fixture();
    data.operations.update = async (_context, input) => ({ state: "completed", operationId: input.operationId, replayed: false, result: data.policy });
    expect(await (await data.handlers.update(data.request("PUT", data.input), data.context)).json()).toMatchObject({ result: { version: 1 } });
    data.operations.update = async (_context, input) => ({ state: "completed", operationId: input.operationId, replayed: true, result: { ...data.policy, version: 2 } });
    expect(await (await data.handlers.update(data.request("PUT", data.input), data.context)).json()).toMatchObject({ replayed: true, result: { version: 2 } });
  });
});
