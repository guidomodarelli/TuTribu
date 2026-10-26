/** @vitest-environment node */
/** Exercises native original-delivery authority through the real management resolver. @module notification-recovery-authority-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ResolveMessagingTribeManagementUseCase } from "@/src/modules/messaging/application/use-cases/resolve-messaging-tribe-management-use-case";
import { RecoverNotificationDeliveryUseCase } from "@/src/modules/messaging/application/use-cases/recover-notification-delivery-use-case";
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";
import type { NotificationDeliveryRecoveryContext, NotificationDeliveryRecoveryInput, NotificationDeliveryRecoveryRepository } from "@/src/modules/messaging/domain/repositories/notification-delivery-recovery";
import type { AdmissionOperationResult } from "@/src/modules/academy-admissions/domain/entities/admission-operation";
import type { MessagingAuthenticatedAccount, MessagingLeadershipFacts } from "@/src/modules/messaging/domain/repositories/messaging-repositories";

/** @returns Current synthetic global identity, exact delivery scope and mutable native ports. */
function prepareAuthority() {
  const now = new Date("2026-10-11T08:00:00Z");
  const userId = randomUUID(), sessionId = randomUUID(), accountId = randomUUID();
  const subject = randomUUID(), tribeId = randomUUID(), deliveryId = randomUUID();
  const query = { tribeId, deliveryId, requestId: randomUUID() };
  const account: MessagingAuthenticatedAccount = {
    userId,
    session: { id: sessionId, expiresAt: new Date("2026-10-11T09:00:00Z") },
    googleAccount: { id: accountId, subject },
  };
  const leadership: MessagingLeadershipFacts = { tribeId, leaderUserId: userId, membership: { userId, role: "leader", status: "active" } };
  let currentAccount: MessagingAuthenticatedAccount | null = account;
  let currentTime = now;
  let accountReads = 0;
  const resolver = new ResolveMessagingTribeManagementUseCase(
    { getAuthenticatedAccount: async () => { accountReads += 1; return currentAccount; } },
    { getCurrentLeadership: async () => leadership },
    () => currentTime,
  );
  return {
    query, account, leadership, resolver,
    get accountReads() { return accountReads; },
    setAccount(value: MessagingAuthenticatedAccount | null) { currentAccount = value; },
    setTime(value: Date) { currentTime = value; },
  };
}

describe("original notification recovery authority", () => {
  it("should bind the current leader session to the original delivery without reading a credential", async () => {
    const fixture = prepareAuthority();
    const context = await fixture.resolver.execute(fixture.query, "recover_notification_delivery");
    expect(context).toMatchObject({
      actorUserId: fixture.account.userId, sessionId: fixture.account.session.id,
      tribeId: fixture.query.tribeId, deliveryId: fixture.query.deliveryId,
      resourceId: fixture.query.deliveryId, operation: "recover_notification_delivery",
    });
    expect(context).not.toHaveProperty("secretRef");
    expect(context).not.toHaveProperty("connectionId");
    expect(fixture.accountReads).toBe(3);
  });

  it("should require the Google session binding created at sign-in", async () => {
    const fixture = prepareAuthority();
    fixture.account.googleAccount = null;
    await expect(fixture.resolver.execute(fixture.query, "recover_notification_delivery")).rejects.toMatchObject({ code: "authentication_required" });
  });

  it("should reject connection and ordinary read queries for recovery before reading the account", async () => {
    const fixture = prepareAuthority();
    const connectionQuery = { tribeId: fixture.query.tribeId, connectionId: randomUUID(), requestId: fixture.query.requestId };
    await expect(fixture.resolver.execute(connectionQuery as never, "recover_notification_delivery")).rejects.toMatchObject({ code: "invalid_input" });
    await expect(fixture.resolver.execute(fixture.query)).rejects.toMatchObject({ code: "invalid_input" });
    expect(fixture.accountReads).toBe(0);
  });

  it("should reject a guardian with an otherwise valid session", async () => {
    const fixture = prepareAuthority();
    fixture.leadership.membership!.role = "guardian";
    await expect(fixture.resolver.execute(fixture.query, "recover_notification_delivery")).rejects.toMatchObject({ code: "permission_denied" });
  });

  it("should reject an expired actual session", async () => {
    const fixture = prepareAuthority();
    fixture.setTime(fixture.account.session.expiresAt);
    await expect(fixture.resolver.execute(fixture.query, "recover_notification_delivery")).rejects.toMatchObject({ code: "authentication_required" });
  });
});

/** @returns Real authority/orchestration with a controlled own persistence boundary and observable original effects. */
function prepareRecovery() {
  const authority = prepareAuthority();
  const input = { ...authority.query, operationId: randomUUID(), expectedVersion: 1, targetConnectionId: randomUUID(), expectedTargetVersion: 1, confirmed: true as const };
  const calls: { context: NotificationDeliveryRecoveryContext; input: NotificationDeliveryRecoveryInput }[] = [];
  const original = { originalDeliveryId: input.deliveryId, recoveryDeliveryId: randomUUID(), state: "queued" };
  let result: AdmissionOperationResult<typeof original> = { state: "completed", operationId: input.operationId, result: original, replayed: false };
  let writerError: unknown = null;
  const repository: NotificationDeliveryRecoveryRepository<typeof original> = {
    recover: async (context, intent) => {
      calls.push({ context, input: intent });
      if (writerError) throw writerError;
      return result;
    },
  };
  return {
    ...authority, authority, input, original, calls,
    cases: new RecoverNotificationDeliveryUseCase(authority.resolver, repository),
    setResult(value: AdmissionOperationResult<typeof original>) { result = value; },
    setWriterError(error: unknown) { writerError = error; },
  };
}

describe("explicit notification recovery orchestration", () => {
  it("should write one explicit recovery with original-delivery authority and a separate target intent", async () => {
    const fixture = prepareRecovery();
    const result = await fixture.cases.execute(fixture.input);
    expect(result).toMatchObject({ ok: true, value: { state: "completed", operationId: fixture.input.operationId, result: fixture.original, replayed: false } });
    expect(fixture.calls).toHaveLength(1);
    expect(fixture.calls[0].context).toMatchObject({ deliveryId: fixture.input.deliveryId, resourceId: fixture.input.deliveryId, operation: "recover_notification_delivery" });
    expect(fixture.calls[0].input).toEqual({ operationId: fixture.input.operationId, expectedVersion: 1, targetConnectionId: fixture.input.targetConnectionId, expectedTargetVersion: 1, confirmed: true });
    expect(fixture.calls[0].input).not.toHaveProperty("actorUserId");
    expect(fixture.calls[0].context).not.toHaveProperty("secretRef");
  });

  it("should preserve the historical original result when the writer confirms replay", async () => {
    const fixture = prepareRecovery();
    fixture.setResult({ state: "completed", operationId: fixture.input.operationId, result: fixture.original, replayed: true });
    expect(await fixture.cases.execute(fixture.input)).toMatchObject({ ok: true, value: { result: fixture.original, replayed: true } });
    expect(fixture.calls).toHaveLength(1);
  });

  it("should preserve registered started work without creating another operation", async () => {
    const fixture = prepareRecovery();
    fixture.setResult({ state: "started", operationId: fixture.input.operationId });
    expect(await fixture.cases.execute(fixture.input)).toEqual({ ok: true, value: { state: "started", operationId: fixture.input.operationId } });
    expect(fixture.calls).toHaveLength(1);
  });

  it("should keep confirmed original uncertainty without retrying a potentially committed writer", async () => {
    const fixture = prepareRecovery();
    const error = new AdmissionOperationError("operation_unresolved", { operationId: fixture.input.operationId, cause: new Error("Synthetic lost commit response") });
    fixture.setWriterError(error);
    const result = await fixture.cases.execute(fixture.input);
    expect(result).toMatchObject({ ok: false, failure: { code: "operation_unresolved", operation: { operationId: fixture.input.operationId, state: "started" } } });
    expect(fixture.calls).toHaveLength(1);
  });

  it.each(["operation_unresolved", "permission_denied"] as const)("should preserve confirmed completed original metadata for %s", async (code) => {
    const fixture = prepareRecovery();
    fixture.setWriterError(new AdmissionOperationError(code, { operationId: fixture.input.operationId, operationState: "completed" }));
    expect(await fixture.cases.execute(fixture.input)).toMatchObject({
      ok: false, failure: { code, operation: { operationId: fixture.input.operationId, state: "completed" } },
    });
    expect(fixture.calls).toHaveLength(1);
  });

  it.each([undefined, "foreign"])("should not publish completed metadata for unproven identity %s", async (identity) => {
    const fixture = prepareRecovery();
    fixture.setWriterError(new AdmissionOperationError("permission_denied", {
      ...(identity ? { operationId: randomUUID() } : {}), operationState: "completed",
    }));
    const result = await fixture.cases.execute(fixture.input);
    expect(result).toMatchObject({ ok: false, failure: { code: "permission_denied" } });
    if (result.ok) throw new Error("Expected unproven completed recovery denial");
    expect(result.failure).not.toHaveProperty("operation");
    expect(fixture.calls).toHaveLength(1);
  });

  it.each([undefined, "foreign"])("should omit progress for unproven operation identity %s", async (identity) => {
    const fixture = prepareRecovery();
    fixture.setWriterError(new AdmissionOperationError("operation_unresolved", identity ? { operationId: randomUUID() } : undefined));
    const result = await fixture.cases.execute(fixture.input);
    expect(result).toMatchObject({ ok: false, failure: { code: "unexpected_failure" } });
    if (result.ok) throw new Error("Expected unproven recovery failure");
    expect(result.failure).not.toHaveProperty("operation");
    expect(fixture.calls).toHaveLength(1);
  });

  it("should preserve a current writer denial without creating registered progress", async () => {
    const fixture = prepareRecovery();
    fixture.setWriterError(new AdmissionOperationError("permission_denied"));
    const result = await fixture.cases.execute(fixture.input);
    expect(result).toMatchObject({ ok: false, failure: { code: "permission_denied" } });
    if (result.ok) throw new Error("Expected current recovery denial");
    expect(result.failure).not.toHaveProperty("operation");
    expect(fixture.calls).toHaveLength(1);
  });

  it("should classify an original delivery CAS conflict separately from unexpected storage failures", async () => {
    const fixture = prepareRecovery();
    const conflict = new AdmissionOperationError("request_conflict");
    fixture.setWriterError(conflict);
    const result = await fixture.cases.execute(fixture.input);
    expect(result).toMatchObject({ ok: false, failure: { code: "delivery_conflict", cause: conflict } });
    fixture.setWriterError(new Error("Synthetic storage failure"));
    expect(await fixture.cases.execute(fixture.input)).toMatchObject({ ok: false, failure: { code: "unexpected_failure" } });
  });

  it("should stop before persistence when the current account or its leadership is unavailable", async () => {
    const fixture = prepareRecovery();
    fixture.authority.setAccount(null);
    expect(await fixture.cases.execute(fixture.input)).toMatchObject({ ok: false, failure: { code: "authentication_required" } });
    fixture.authority.setAccount(fixture.account);
    fixture.authority.leadership.membership!.role = "guardian";
    expect(await fixture.cases.execute(fixture.input)).toMatchObject({ ok: false, failure: { code: "permission_denied" } });
    expect(fixture.calls).toHaveLength(0);
  });
});
