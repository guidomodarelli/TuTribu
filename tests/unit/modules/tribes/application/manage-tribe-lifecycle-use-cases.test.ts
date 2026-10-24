/** Exercises native identity and historical original binding without controlling platform libraries. @module manage-tribe-lifecycle-use-cases-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { ManageTribeLifecycleUseCases } from "@/src/modules/tribes/application/use-cases/manage-tribe-lifecycle-use-cases";
import type { TribeLifecycleWriter } from "@/src/modules/tribes/domain/repositories/tribe-lifecycle-repository";
import type { AuthenticatedAccountProvider } from "@/src/modules/auth/domain/repositories/authenticated-account-provider";

/** @returns Native private identity and an explicit original deletion. */
function lifecycleFixture() {
  const now = new Date("2026-10-11T12:00:00Z"), userId = randomUUID(), sessionId = randomUUID();
  const account = { userId, normalizedEmail: "synthetic@example.test", session: { id: sessionId, expiresAt: new Date("2026-10-11T13:00:00Z") }, googleAccount: null, identityEvidence: null, recentAuthentication: [] };
  const command = { tribeId: randomUUID(), requestId: randomUUID(), operationId: randomUUID(), action: "delete_tribe" as const, expectedConfigVersion: 1, confirmed: true };
  const original = { state: "completed" as const, operationId: command.operationId, replayed: false, result: { action: command.action, deleted: true as const, accessModel: null, configVersion: null } };
  const change = vi.fn<TribeLifecycleWriter["change"]>(async () => original), recover = vi.fn<TribeLifecycleWriter["recover"]>(async () => original), writer = { change, recover };
  const accounts: AuthenticatedAccountProvider = { getAuthenticatedAccount: vi.fn(async () => account) };
  return { account, now, command, original, change, recover, useCases: new ManageTribeLifecycleUseCases(accounts, writer, () => now) };
}
describe("tribe lifecycle application owner", () => {
  it("should bind the real actor and session instead of accepting authority in the original command", async () => {
    const fixture = lifecycleFixture(); expect(await fixture.useCases.change(fixture.command)).toEqual(fixture.original);
    expect(fixture.change).toHaveBeenCalledWith({ tribeId: fixture.command.tribeId, requestId: fixture.command.requestId, actorUserId: fixture.account.userId, sessionId: fixture.account.session.id }, fixture.command);
  });
  it("should reject an expired session before entering the owner", async () => {
    const fixture = lifecycleFixture(); fixture.account.session.expiresAt = fixture.now;
    await expect(fixture.useCases.change(fixture.command)).rejects.toMatchObject({ code: "authentication_required" }); expect(fixture.change).not.toHaveBeenCalled();
  });
  it("should reject an unconfirmed deletion before entering the owner", async () => {
    const fixture = lifecycleFixture(); await expect(fixture.useCases.change({ ...fixture.command, confirmed: false })).rejects.toMatchObject({ code: "invalid_input" }); expect(fixture.change).not.toHaveBeenCalled();
  });
  it("should observe a deleted original without repeating the mutation", async () => {
    const fixture = lifecycleFixture(); expect(await fixture.useCases.recover(fixture.command)).toEqual(fixture.original); expect(fixture.change).not.toHaveBeenCalled();
  });
  it("should reject a result belonging to another operation", async () => {
    const fixture = lifecycleFixture(); fixture.change.mockResolvedValue({ ...fixture.original, operationId: randomUUID() });
    await expect(fixture.useCases.change(fixture.command)).rejects.toMatchObject({ code: "public_contract_unusable" });
  });
});
