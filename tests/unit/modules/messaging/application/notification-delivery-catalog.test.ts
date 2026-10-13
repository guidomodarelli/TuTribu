/** Exercises current canonical authority and owned notification metadata without platform mocks. @module notification-delivery-catalog-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ReadNotificationDeliveryCatalogUseCase } from "@/src/modules/messaging/application/use-cases/read-notification-delivery-catalog-use-case";
import { ResolveMessagingTribeManagementUseCase } from "@/src/modules/messaging/application/use-cases/resolve-messaging-tribe-management-use-case";
import type { MessagingAuthenticatedAccount, MessagingLeadershipFacts } from "@/src/modules/messaging/domain/repositories/messaging-repositories";

/** @returns Real management policy with replaceable own account, leadership and catalog ports. */
function setupCatalog() {
  const now = new Date("2026-10-11T12:00:00Z"), tribeId = randomUUID(), actorUserId = randomUUID();
  const account: MessagingAuthenticatedAccount = { userId: actorUserId, session: { id: randomUUID(), expiresAt: new Date(now.getTime() + 60_000) }, googleAccount: null, recentAuthentication: [] };
  const leadership: MessagingLeadershipFacts = { tribeId, leaderUserId: actorUserId, membership: { userId: actorUserId, role: "leader", status: "active" } };
  const item = { id: randomUUID(), version: 3, state: "unknown" as const, connectionId: randomUUID(), createdAt: now.toISOString(), deadlineAt: new Date(now.getTime() + 60_000).toISOString(), recoveryDeliveryId: null };
  let catalog: unknown = { items: [item], nextCursor: null }, reads = 0;
  let afterRead: (() => void) | undefined;
  const management = new ResolveMessagingTribeManagementUseCase({ getAuthenticatedAccount: async () => account }, { getCurrentLeadership: async () => leadership }, () => now);
  const useCase = new ReadNotificationDeliveryCatalogUseCase(management, { read: async () => { reads++; afterRead?.(); return catalog; } });
  return { account, leadership, item, query: { tribeId, requestId: randomUUID(), cursor: null }, useCase, get reads() { return reads; }, replace(value: unknown) { catalog = value; }, afterRead(callback: () => void) { afterRead = callback; } };
}

describe("notification delivery catalog", () => {
  it("should read minimal current notification facts without fresh Google recency or another send", async () => {
    const fixture = setupCatalog();
    expect(await fixture.useCase.execute(fixture.query)).toEqual({ ok: true, value: { items: [fixture.item], nextCursor: null } });
    expect(fixture.reads).toBe(1);
  });
  it("should preserve a genuinely empty catalog without creating a notification", async () => {
    const fixture = setupCatalog(); fixture.replace({ items: [], nextCursor: null });
    expect(await fixture.useCase.execute(fixture.query)).toEqual({ ok: true, value: { items: [], nextCursor: null } });
    expect(fixture.reads).toBe(1);
  });
  it.each(["private_field", "bad_version", "same_child", "bad_cursor"] as const)("should reject unusable own %s facts safely", async (scenario) => {
    const fixture = setupCatalog();
    fixture.replace(scenario === "private_field" ? { items: [{ ...fixture.item, recipient: "private" }], nextCursor: null }
      : scenario === "bad_version" ? { items: [{ ...fixture.item, version: 0 }], nextCursor: null }
      : scenario === "same_child" ? { items: [{ ...fixture.item, recoveryDeliveryId: fixture.item.id.toUpperCase() }], nextCursor: null }
      : { items: [fixture.item], nextCursor: { deliveryId: randomUUID(), createdAt: fixture.item.createdAt } });
    expect(await fixture.useCase.execute(fixture.query)).toMatchObject({ ok: false, failure: { code: "public_contract_unusable" } });
  });
  it("should deny a guardian before reading the leader catalog", async () => {
    const fixture = setupCatalog(); fixture.leadership.leaderUserId = randomUUID();
    expect(await fixture.useCase.execute(fixture.query)).toMatchObject({ ok: false, failure: { code: "permission_denied" } });
    expect(fixture.reads).toBe(0);
  });
  it("should deny a changed native session after reading", async () => {
    const fixture = setupCatalog(); fixture.afterRead(() => { fixture.account.session.id = randomUUID(); });
    expect(await fixture.useCase.execute(fixture.query)).toMatchObject({ ok: false, failure: { code: "authentication_required" } });
  });
  it("should deny lost canonical leadership after reading", async () => {
    const fixture = setupCatalog(); fixture.afterRead(() => { fixture.leadership.leaderUserId = randomUUID(); });
    expect(await fixture.useCase.execute(fixture.query)).toMatchObject({ ok: false, failure: { code: "permission_denied" } });
  });
});
