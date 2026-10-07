/** @vitest-environment node */
/** Exercises server-derived usage identity, scoped recency and safe mixed operation outcomes. @module manage-messaging-usage-use-cases-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ManageMessagingUsageUseCases } from "@/src/modules/messaging/application/use-cases/manage-messaging-usage-use-cases";
import { MessagingUsageOperationError } from "@/src/modules/messaging/domain/errors/messaging-usage-operation-error";
import { MessagingSecretAccessError } from "@/src/modules/messaging/domain/errors/messaging-secret-access-error";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import type { MessagingAccountProvider, MessagingAuthenticatedAccount } from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import type { MessagingUsageOperations, MessagingUsageSensitiveContext } from "@/src/modules/messaging/domain/repositories/messaging-usage-operations";
import type { MessagingUsagePolicyResult, MessagingUsagePolicyStateResult } from "@/src/modules/messaging/application/results/messaging-usage-policy-result";

/** Own ports isolate orchestration; authoritative persistence and crypto are exercised by the companion SQL suite. */
function prepareUseCases() {
  const now = new Date("2026-10-06T12:00:00.000Z");
  const userId = randomUUID(), tribeId = randomUUID(), sessionId = randomUUID(), accountId = randomUUID(), subject = randomUUID();
  let account: MessagingAuthenticatedAccount | null = { userId, session: { id: sessionId, expiresAt: new Date(now.getTime()+3_600_000) }, googleAccount: { id: accountId, subject }, recentAuthentication: [REAUTHENTICATION_OPERATION.initializeMessagingUsage, REAUTHENTICATION_OPERATION.updateMessagingUsage].map((operation) => ({ id: randomUUID(), intentId: randomUUID(), userId, sessionId, accountId, subject, tribeId, operation, resourceId: tribeId, authenticatedAt: now, validUntil: new Date(now.getTime()+540_000), verifiedAt: now, invalidatedAt: null })) };
  let role: "leader" | "guardian" = "leader";
  const calls: MessagingUsageSensitiveContext[] = [];
  const policy: MessagingUsagePolicyResult = { version: 1, allowedCountries: [], verificationDailyLimit: 100, notificationDailyLimit: 200, platformMaximums: { verificationDailyLimit: 1000, notificationDailyLimit: 5000 }, consumption: { verificationToday: 0, notificationToday: 0 } };
  const operations: MessagingUsageOperations<MessagingUsagePolicyResult, MessagingUsagePolicyStateResult> = {
    read: async () => ({ state: "not_configured", policy: null }),
    initialize: async (context, operationId) => { calls.push(context); return { state: "completed", operationId, replayed: false, result: policy }; },
    update: async (context, input) => { calls.push(context); return { state: "started", operationId: input.operationId }; },
  };
  const accounts: MessagingAccountProvider = { getAuthenticatedAccount: async () => account };
  const authorization = { getCurrentLeadership: async () => ({ tribeId, leaderUserId: userId, membership: { userId, role, status: "active" as const } }), getConnection: async () => { throw new Error("Usage must not read a connection"); } };
  const cases = new ManageMessagingUsageUseCases(accounts, authorization, operations, () => now);
  return { cases, operations, calls, tribeId, userId, policy, accounts, setAccount(value: MessagingAuthenticatedAccount | null) { account=value; }, get account() { return account; }, setRole(value: "leader" | "guardian") { role=value; } };
}

describe("messaging usage use cases", () => {
  it("should prefer authentication failure before interpreting role for an expired initial session", async () => {
    const fixture = prepareUseCases(); fixture.account!.session.expiresAt = new Date("2026-10-06T11:00:00Z"); fixture.setRole("guardian");
    expect(await fixture.cases.read({ tribeId: fixture.tribeId, requestId: randomUUID() })).toMatchObject({ ok: false, failure: { code: "authentication_required" } });
    expect(fixture.calls).toEqual([]);
  });
  it("should preserve the typed native checkout denial when account identity changes before persistence", async () => {
    const fixture = prepareUseCases(), cause = new MessagingSecretAccessError("authentication_required");
    fixture.operations.initialize = async () => { throw cause; };
    expect(await fixture.cases.initialize({ tribeId: fixture.tribeId, requestId: randomUUID(), operationId: randomUUID(), confirmed: true })).toMatchObject({ ok: false, failure: { code: "authentication_required", cause } });
  });
  it("should read absence without recency, a connection or a mutation and keep presentation defaults separate", async () => {
    const fixture = prepareUseCases();
    fixture.setAccount({ ...fixture.account!, googleAccount: null, recentAuthentication: [] });
    expect(await fixture.cases.read({ tribeId: fixture.tribeId, requestId: randomUUID() })).toMatchObject({ ok: true, value: { state: "not_configured", policy: null }, defaults: { allowedCountries: [], verificationDailyLimit: 100, notificationDailyLimit: 200 } });
    expect(fixture.calls).toEqual([]);
  });

  it("should derive the canonical actor and exact sensitive operation instead of reading a key", async () => {
    const fixture = prepareUseCases();
    const operationId = randomUUID();
    expect(await fixture.cases.initialize({ tribeId: fixture.tribeId, requestId: randomUUID(), operationId, confirmed: true })).toMatchObject({ ok: true, value: { state: "completed", operationId, result: { version: 1 } } });
    expect(fixture.calls).toHaveLength(1);
    expect(fixture.calls[0]).toMatchObject({ actorUserId: fixture.userId, tribeId: fixture.tribeId, resourceId: fixture.tribeId, operation: REAUTHENTICATION_OPERATION.initializeMessagingUsage });
    fixture.setRole("guardian");
    expect(await fixture.cases.initialize({ tribeId: fixture.tribeId, requestId: randomUUID(), operationId: randomUUID(), confirmed: true })).toMatchObject({ ok: false, failure: { code: "permission_denied" } });
    expect(fixture.calls).toHaveLength(1);
  });

  it("should preserve registered unfinished work and reject missing or crossed recency before persistence", async () => {
    const fixture = prepareUseCases();
    const input = { tribeId: fixture.tribeId, requestId: randomUUID(), operationId: randomUUID(), confirmed: true as const, expectedVersion: 1, allowedCountries: ["AR"], verificationDailyLimit: 100, notificationDailyLimit: 200 };
    expect(await fixture.cases.update(input)).toMatchObject({ ok: true, value: { state: "started", operationId: input.operationId } });
    fixture.setAccount({ ...fixture.account!, recentAuthentication: fixture.account!.recentAuthentication.filter((evidence) => evidence.operation === REAUTHENTICATION_OPERATION.initializeMessagingUsage) });
    expect(await fixture.cases.update(input)).toMatchObject({ ok: false, failure: { code: "reauthentication_required" } });
    expect(fixture.calls).toHaveLength(1);
  });

  it("should retain typed conflict and proven progress while keeping an unexpected cause private", async () => {
    const fixture = prepareUseCases();
    const operationId = randomUUID();
    fixture.operations.initialize = async () => { throw new MessagingUsageOperationError("operation_unresolved", { operationId }); };
    expect(await fixture.cases.initialize({ tribeId: fixture.tribeId, requestId: randomUUID(), operationId, confirmed: true })).toMatchObject({ ok: false, failure: { code: "operation_unresolved", operation: { operationId, state: "started" } } });
    fixture.operations.initialize = async () => { throw new MessagingUsageOperationError("usage_policy_conflict"); };
    expect(await fixture.cases.initialize({ tribeId: fixture.tribeId, requestId: randomUUID(), operationId, confirmed: true })).toMatchObject({ ok: false, failure: { code: "usage_policy_conflict" } });
    fixture.operations.initialize = async () => { throw new Error("Synthetic private persistence detail"); };
    const unexpected = await fixture.cases.initialize({ tribeId: fixture.tribeId, requestId: randomUUID(), operationId, confirmed: true });
    expect(unexpected).toMatchObject({ ok: false, failure: { code: "unexpected_failure" } });
    if (!unexpected.ok) expect(unexpected.failure.operation).toBeUndefined();
  });
});
