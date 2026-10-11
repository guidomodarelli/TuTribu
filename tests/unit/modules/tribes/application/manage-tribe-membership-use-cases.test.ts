/** Exercises membership command identity, confirmation and recovery through owned ports. @module manage-tribe-membership-use-cases-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { ManageTribeMembershipUseCases } from "@/src/modules/tribes/application/use-cases/manage-tribe-membership-use-cases";
import type { TribeMembershipLifecycleWriter } from "@/src/modules/tribes/domain/repositories/tribe-membership-lifecycle-repository";
import type { AuthenticatedAccountProvider } from "@/src/modules/auth/domain/repositories/authenticated-account-provider";

/** @returns Native account facts, an explicit original and controllable own writer ports. */
function membershipFixture() {
  const now = new Date("2026-10-11T12:00:00Z"), userId = randomUUID(), sessionId = randomUUID();
  const account = { userId, normalizedEmail: "synthetic@example.test", session: { id: sessionId, expiresAt: new Date("2026-10-11T13:00:00Z") }, googleAccount: null, identityEvidence: null, recentAuthentication: [] };
  const command = { tribeId: randomUUID(), requestId: randomUUID(), operationId: randomUUID(), memberId: randomUUID(), action: "leave" as const, expectedStatus: "muted" as const, confirmed: true };
  const original = { state: "completed" as const, operationId: command.operationId, replayed: false, result: { outcome: "changed" as const, memberId: command.memberId, action: command.action, status: "removed" as const, deleted: true } };
  const change = vi.fn<TribeMembershipLifecycleWriter["change"]>(async () => original), recover = vi.fn<TribeMembershipLifecycleWriter["recover"]>(async () => original);
  const accounts: AuthenticatedAccountProvider = { getAuthenticatedAccount: vi.fn(async () => account) };
  const writer: TribeMembershipLifecycleWriter = { change, recover };
  return { now, userId, sessionId, account, command, original, accounts, writer, change, recover, useCases: new ManageTribeMembershipUseCases(accounts, writer, () => now) };
}

describe("membership command application owner", () => {
  it("should bind native identity and original state when a member explicitly leaves", async () => {
    const fixture = membershipFixture();
    await expect(fixture.useCases.change(fixture.command)).resolves.toEqual(fixture.original);
    expect(fixture.change).toHaveBeenCalledWith({ tribeId: fixture.command.tribeId, requestId: fixture.command.requestId, actorUserId: fixture.userId, sessionId: fixture.sessionId }, fixture.command);
  });
  it("should reject an expired native session before invoking the membership writer", async () => {
    const fixture = membershipFixture(); fixture.account.session.expiresAt = fixture.now;
    await expect(fixture.useCases.change(fixture.command)).rejects.toMatchObject({ code: "authentication_required" });
    expect(fixture.change).not.toHaveBeenCalled();
  });
  it("should reject an unconfirmed action before invoking the membership writer", async () => {
    const fixture = membershipFixture();
    await expect(fixture.useCases.change({ ...fixture.command, confirmed: false })).rejects.toMatchObject({ code: "invalid_input" });
    expect(fixture.change).not.toHaveBeenCalled();
  });
  it("should recover the original without repeating a membership mutation", async () => {
    const fixture = membershipFixture();
    await expect(fixture.useCases.recover(fixture.command)).resolves.toEqual(fixture.original);
    expect(fixture.recover).toHaveBeenCalledTimes(1); expect(fixture.change).not.toHaveBeenCalled();
  });
  it("should reject a result for another member instead of confirming the wrong mutation", async () => {
    const fixture = membershipFixture(); fixture.change.mockResolvedValue({ ...fixture.original, result: { ...fixture.original.result, memberId: randomUUID() } });
    await expect(fixture.useCases.change(fixture.command)).rejects.toMatchObject({ code: "public_contract_unusable" });
  });
  it("should preserve private cause without treating an unexpected failure as durable progress", async () => {
    const fixture = membershipFixture(), error = new Error("Synthetic membership owner failed"); fixture.change.mockRejectedValue(error);
    await expect(fixture.useCases.change(fixture.command)).rejects.toMatchObject({ code: "unexpected_failure", cause: error, operationId: undefined });
  });
});
