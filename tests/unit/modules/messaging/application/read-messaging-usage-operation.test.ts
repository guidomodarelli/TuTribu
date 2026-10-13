/** Exercises original usage recovery with current leader identity and no mutation recency. @module read-messaging-usage-operation-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { ReadMessagingUsageOperationUseCase } from "@/src/modules/messaging/application/use-cases/read-messaging-usage-operation-use-case";
import type { MessagingAuthenticatedAccount, MessagingLeadershipFacts } from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import { MessagingSecretAccessError } from "@/src/modules/messaging/domain/errors/messaging-secret-access-error";

/** Own account/reader ports isolate current authority while retaining the real recovery schema. */
function fixture() {
  const now = new Date("2026-10-07T12:00:00Z"), tribeId = randomUUID(), operationId = randomUUID(), userId = randomUUID(), sessionId = randomUUID();
  const account: MessagingAuthenticatedAccount = { userId, session: { id: sessionId, expiresAt: new Date("2026-10-08T12:00:00Z") }, googleAccount: null, recentAuthentication: [] };
  const leadership: MessagingLeadershipFacts = { tribeId, leaderUserId: userId, membership: { userId, role: "leader", status: "active" } };
  const value = { type: "update_messaging_usage", state: "completed", operationId, replayed: true, result: { version: 2, allowedCountries: ["AR"], verificationDailyLimit: 0, notificationDailyLimit: 200, platformMaximums: { verificationDailyLimit: 1000, notificationDailyLimit: 5000 }, consumption: { verificationToday: 0, notificationToday: 0 } } };
  const reader = { read: vi.fn(async (): Promise<unknown | null> => value) };
  const accounts = { getAuthenticatedAccount: vi.fn(async (): Promise<MessagingAuthenticatedAccount | null> => account) }, authorization = { getCurrentLeadership: vi.fn(async (): Promise<MessagingLeadershipFacts | null> => leadership) };
  return { account, accounts, leadership, authorization, reader, value, query: { tribeId, operationId, requestId: randomUUID() }, useCase: new ReadMessagingUsageOperationUseCase(accounts, authorization, reader, () => now) };
}

describe("usage original operation recovery", () => {
  it("should return the original safe result without recency or current policy substitution", async () => {
    const data = fixture();
    expect(await data.useCase.execute(data.query)).toMatchObject({ ok: true, value: { type: "update_messaging_usage", state: "completed", operationId: data.query.operationId, result: { version: 2 } } });
    expect(data.reader.read).toHaveBeenCalledWith({ actorUserId: data.account.userId, sessionId: data.account.session.id, tribeId: data.query.tribeId, requestId: data.query.requestId }, data.query.operationId);
  });
  it("should deny a guardian before reading original work and close a session changed while recovering", async () => {
    const data = fixture(); data.leadership.membership!.role = "guardian";
    expect(await data.useCase.execute(data.query)).toMatchObject({ ok: false, failure: { code: "permission_denied" } });
    expect(data.reader.read).not.toHaveBeenCalled();
    data.leadership.membership!.role = "leader";
    data.reader.read.mockImplementationOnce(async () => { data.accounts.getAuthenticatedAccount.mockResolvedValue({ ...data.account, session: { ...data.account.session, id: randomUUID() } }); return data.value; });
    expect(await data.useCase.execute(data.query)).toMatchObject({ ok: false, failure: { code: "authentication_required" } });
  });
  it("should preserve genuine absence and reject unrelated namespaces or another original UUID", async () => {
    const data = fixture(); data.reader.read.mockResolvedValueOnce(null);
    expect(await data.useCase.execute(data.query)).toMatchObject({ ok: false, failure: { code: "resource_unavailable" } });
    data.reader.read.mockResolvedValueOnce({ ...data.value, operationId: randomUUID() });
    expect(await data.useCase.execute(data.query)).toMatchObject({ ok: false, failure: { code: "public_contract_unusable" } });
    data.reader.read.mockResolvedValueOnce({ ...data.value, type: "update_admission_policy" });
    expect(await data.useCase.execute(data.query)).toMatchObject({ ok: false, failure: { code: "public_contract_unusable" } });
  });
  it("should reject an expired initial session before consulting leadership or original work", async () => {
    const data = fixture(); data.account.session.expiresAt = new Date("2026-10-07T11:00:00Z"); data.leadership.membership!.role = "guardian";
    expect(await data.useCase.execute(data.query)).toMatchObject({ ok: false, failure: { code: "authentication_required" } });
    expect(data.authorization.getCurrentLeadership).not.toHaveBeenCalled(); expect(data.reader.read).not.toHaveBeenCalled();
  });
  it("should preserve the typed current-account checkout denial rather than translating it to an unexpected failure", async () => {
    const data = fixture(), cause = new MessagingSecretAccessError("authentication_required");
    data.reader.read.mockRejectedValueOnce(cause);
    expect(await data.useCase.execute(data.query)).toMatchObject({ ok: false, failure: { code: "authentication_required", cause } });
  });
  it("should recheck the native account before interpreting leadership absence returned during a revoked session", async () => {
    const data = fixture();
    data.authorization.getCurrentLeadership.mockImplementationOnce(async () => { data.accounts.getAuthenticatedAccount.mockResolvedValue(null); return null; });
    expect(await data.useCase.execute(data.query)).toMatchObject({ ok: false, failure: { code: "authentication_required" } });
    expect(data.reader.read).not.toHaveBeenCalled();
  });
});
