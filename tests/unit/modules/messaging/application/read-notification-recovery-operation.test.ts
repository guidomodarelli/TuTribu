/** @vitest-environment node */
/** Exercises original recovery lookup and post-read authority with own ports only. @module read-notification-recovery-operation-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ReadNotificationRecoveryOperationUseCase } from "@/src/modules/messaging/application/use-cases/read-notification-recovery-operation-use-case";
import { ResolveMessagingTribeManagementUseCase } from "@/src/modules/messaging/application/use-cases/resolve-messaging-tribe-management-use-case";
import type { MessagingAuthenticatedAccount, MessagingLeadershipFacts } from "@/src/modules/messaging/domain/repositories/messaging-repositories";

/** @returns Actual management orchestration with controllable readonly storage and current identity. */
function prepareRead() {
  const now = new Date("2026-10-11T10:00:00Z"), userId = randomUUID(), tribeId = randomUUID();
  const account: MessagingAuthenticatedAccount = { userId, session: { id: randomUUID(), expiresAt: new Date("2026-10-11T11:00:00Z") }, googleAccount: null};
  const leadership: MessagingLeadershipFacts = { tribeId, leaderUserId: userId, membership: { userId, role: "leader", status: "active" } };
  const query = { tribeId, operationId: randomUUID(), requestId: randomUUID() };
  const result = { originalDeliveryId: randomUUID(), recoveryDeliveryId: randomUUID(), originalVersion: 2, targetConnectionId: randomUUID(), targetConnectionVersion: 3 };
  let value: unknown | null = { type: "recover_notification_delivery", state: "completed", operationId: query.operationId, replayed: true, result };
  let afterRead: (() => void) | null = null;
  let reads = 0;
  const management = new ResolveMessagingTribeManagementUseCase({ getAuthenticatedAccount: async () => account }, { getCurrentLeadership: async () => leadership }, () => now);
  const useCase = new ReadNotificationRecoveryOperationUseCase(management, { read: async () => { reads += 1; afterRead?.(); return value; } });
  return { account, leadership, query, result, useCase, get reads() { return reads; }, setValue(next: unknown | null) { value = next; }, afterRead(callback: () => void) { afterRead = callback; } };
}

describe("original notification recovery read", () => {
  it("should return a historical completed original without another write", async () => {
    const fixture = prepareRead();
    expect(await fixture.useCase.execute(fixture.query)).toMatchObject({ ok: true, value: { type: "recover_notification_delivery", state: "completed", operationId: fixture.query.operationId, replayed: true, result: fixture.result } });
    expect(fixture.reads).toBe(1);
  });

  it("should preserve only registered started state", async () => {
    const fixture = prepareRead();
    fixture.setValue({ type: "recover_notification_delivery", state: "started", operationId: fixture.query.operationId, replayed: true });
    expect(await fixture.useCase.execute(fixture.query)).toMatchObject({ ok: true, value: { state: "started", operationId: fixture.query.operationId } });
  });

  it("should report actual absence without inventing progress", async () => {
    const fixture = prepareRead(); fixture.setValue(null);
    expect(await fixture.useCase.execute(fixture.query)).toMatchObject({ ok: false, failure: { code: "resource_unavailable" } });
  });

  it.each(["foreign_uuid", "private_result", "other_namespace"])("should reject public contract crossing %s", async (kind) => {
    const fixture = prepareRead();
    fixture.setValue({ type: kind === "other_namespace" ? "save_messaging_credentials" : "recover_notification_delivery", state: "completed", operationId: kind === "foreign_uuid" ? randomUUID() : fixture.query.operationId, replayed: true, result: { ...fixture.result, ...(kind === "private_result" ? { recipient: "synthetic@example.test" } : {}) } });
    expect(await fixture.useCase.execute(fixture.query)).toMatchObject({ ok: false, failure: { code: "public_contract_unusable" } });
  });

  it("should reject session replacement or leadership loss after the read", async () => {
    const session = prepareRead(); session.afterRead(() => { session.account.session.id = randomUUID(); });
    expect(await session.useCase.execute(session.query)).toMatchObject({ ok: false, failure: { code: "authentication_required" } });
    const role = prepareRead(); role.afterRead(() => { role.leadership.membership!.role = "guardian"; });
    expect(await role.useCase.execute(role.query)).toMatchObject({ ok: false, failure: { code: "permission_denied" } });
  });
});
