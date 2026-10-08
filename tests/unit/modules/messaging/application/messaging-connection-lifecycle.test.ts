/** Exercises current native leadership and connection-scoped recency without operational credential dependencies. @module messaging-connection-lifecycle-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { ResolveMessagingTribeManagementUseCase } from "@/src/modules/messaging/application/use-cases/resolve-messaging-tribe-management-use-case";
import type { MessagingAuthenticatedAccount, MessagingLeadershipFacts } from "@/src/modules/messaging/domain/repositories/messaging-repositories";

/** @returns Real management orchestration using only its own native account/leadership ports. */
function lifecycleFixture() {
  const now = new Date("2026-10-08T15:00:00Z"), userId = randomUUID(), sessionId = randomUUID(), accountId = randomUUID(), subject = randomUUID(), tribeId = randomUUID(), connectionId = randomUUID();
  const account: MessagingAuthenticatedAccount = { userId, session: { id: sessionId, expiresAt: new Date("2026-10-08T16:00:00Z") }, googleAccount: { id: accountId, subject }, recentAuthentication: [{ id: randomUUID(), intentId: randomUUID(), userId, sessionId, accountId, subject, tribeId, resourceId: connectionId, operation: "suspend_messaging_connection", authenticatedAt: now, verifiedAt: now, validUntil: new Date("2026-10-08T15:09:00Z"), invalidatedAt: null }] };
  const leadership: MessagingLeadershipFacts = { tribeId, leaderUserId: userId, membership: { userId, role: "leader", status: "active" } };
  const getAuthenticatedAccount = vi.fn(async () => account), getCurrentLeadership = vi.fn(async () => leadership);
  const resolver = new ResolveMessagingTribeManagementUseCase({ getAuthenticatedAccount }, { getCurrentLeadership }, () => now);
  return { account, leadership, getAuthenticatedAccount, getCurrentLeadership, resolver, query: { tribeId, connectionId, requestId: randomUUID() } };
}

describe("local connection lifecycle authority", () => {
  it("should derive suspension authority for the exact connection without any secret, environment or provider lookup", async () => {
    const fixture = lifecycleFixture();
    expect(await fixture.resolver.execute(fixture.query, "suspend_messaging_connection")).toEqual({ actorUserId: fixture.account.userId, sessionId: fixture.account.session.id, tribeId: fixture.query.tribeId, connectionId: fixture.query.connectionId, requestId: fixture.query.requestId, resourceId: fixture.query.connectionId, operation: "suspend_messaging_connection", accountId: fixture.account.googleAccount!.id, subject: fixture.account.googleAccount!.subject, authenticatedAt: fixture.account.recentAuthentication[0].authenticatedAt, validUntil: fixture.account.recentAuthentication[0].validUntil });
  });
  it("should not reuse suspension recency for disconnection or another connection", async () => {
    const fixture = lifecycleFixture();
    await expect(fixture.resolver.execute(fixture.query, "disconnect_messaging_connection")).rejects.toMatchObject({ code: "reauthentication_required" });
    await expect(fixture.resolver.execute({ ...fixture.query, connectionId: randomUUID() }, "suspend_messaging_connection")).rejects.toMatchObject({ code: "reauthentication_required" });
  });
  it.each(["guardian", "changed_leader"] as const)("should reject %s before granting lifecycle authority", async (scenario) => {
    const fixture = lifecycleFixture();
    if (scenario === "guardian") fixture.leadership.membership!.role = "guardian";
    else fixture.leadership.leaderUserId = randomUUID();
    await expect(fixture.resolver.execute(fixture.query, "suspend_messaging_connection")).rejects.toMatchObject({ code: "permission_denied" });
  });
  it("should reject an expired session observed after current leadership rather than use earlier authority", async () => {
    const fixture = lifecycleFixture();
    fixture.getCurrentLeadership.mockImplementationOnce(async () => { fixture.account.session.expiresAt = new Date("2026-10-08T14:59:59Z"); return fixture.leadership; });
    await expect(fixture.resolver.execute(fixture.query, "suspend_messaging_connection")).rejects.toMatchObject({ code: "authentication_required" });
  });
});
