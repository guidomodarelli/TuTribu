/** @vitest-environment node */
/** Exercises actual leader/resource/recency resolution and proposal normalization through owned storage ports. @module manage-allowlist-use-cases-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { ManageAllowlistUseCases } from "@/src/modules/academy-admissions/application/use-cases/manage-allowlist-use-cases";
import { ResolveAdmissionContextUseCase } from "@/src/modules/academy-admissions/application/use-cases/resolve-admission-context-use-case";
import type { AllowlistCommandWriter, AllowlistReader } from "@/src/modules/academy-admissions/domain/repositories/allowlist-management";
import type { AuthenticatedAccount } from "@/src/modules/auth/domain/entities/authenticated-account";
import type { AdmissionActorFacts } from "@/src/modules/academy-admissions/domain/policies/admission-eligibility";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";

/** @returns Native resolver facts and owned repository doubles; no platform library is replaced. */
function fixture() {
  const now = new Date("2026-10-09T03:00:00Z"), tribeId = randomUUID(), userId = randomUUID(), sessionId = randomUUID(), accountId = randomUUID(), subject = randomUUID(), entryId = randomUUID(), operationId = randomUUID();
  const account: AuthenticatedAccount = { userId, normalizedEmail: "leader@example.test", session: { id: sessionId, expiresAt: new Date("2026-10-10T03:00:00Z") }, googleAccount: { id: accountId, subject }, identityEvidence: null, recentAuthentication: [] };
  const actor: AdmissionActorFacts = { userId, tribeId, role: "leader", status: "active" };
  const resolver = new ResolveAdmissionContextUseCase({ getAuthenticatedAccount: async () => account }, { getCurrentActor: async () => actor, getResource: async (_tribeId, resource) => resource.id === entryId ? { id: entryId, tribeId } : null }, () => now);
  const reader: AllowlistReader = { list: vi.fn(async () => ({ entries: [], nextCursor: null })), read: vi.fn(async () => null) };
  const writer: AllowlistCommandWriter = { create: vi.fn(async () => ({ state: "started" as const, operationId })), update: vi.fn(async () => ({ state: "started" as const, operationId })) };
  /** @param operation - Exact signed global purpose. @param resourceId - Resource bound to that confirmation. @returns Nothing after seeding only current resolver evidence. */
  const sign = (operation: string, resourceId = tribeId) => { account.recentAuthentication = [{ id: randomUUID(), intentId: randomUUID(), userId, sessionId, accountId, subject, tribeId, resourceId, operation, authenticatedAt: now, verifiedAt: now, validUntil: new Date("2026-10-09T03:09:00Z"), invalidatedAt: null }]; };
  return { actor, account, reader, writer, sign, entryId, useCases: new ManageAllowlistUseCases(resolver, reader, writer), input: { tribeId, requestId: randomUUID(), operationId, confirmed: true as const } };
}

describe("allowlist management authority", () => {
  it("should allow a current leader to read filters without requiring mutation recency", async () => {
    const data = fixture();
    await data.useCases.list({ ...data.input, limit: 20, search: "grupo", status: "disabled" });
    expect(data.reader.list).toHaveBeenCalledWith(expect.objectContaining({ userId: data.account.userId, role: "leader", action: "manage_allowlist" }), { limit: 20, search: "grupo", status: "disabled" });
    expect(data.writer.create).not.toHaveBeenCalled();
    expect(data.writer.update).not.toHaveBeenCalled();
  });

  it("should deny guardian or inactive leader before returning list contacts or changing an entry", async () => {
    const data = fixture();
    data.actor.role = "guardian";
    expect(await data.useCases.list({ ...data.input, limit: 20 })).toMatchObject({ ok: false, failure: { code: "permission_denied" } });
    expect(await data.useCases.create({ ...data.input, contactType: "email", identity: "valid@example.test" })).toMatchObject({ ok: false, failure: { code: "permission_denied" } });
    data.actor.role = "leader"; data.actor.status = "muted";
    expect(await data.useCases.read({ ...data.input, entryId: data.entryId })).toMatchObject({ ok: false, failure: { code: "permission_denied" } });
    expect(data.reader.list).not.toHaveBeenCalled(); expect(data.reader.read).not.toHaveBeenCalled(); expect(data.writer.create).not.toHaveBeenCalled();
  });

  it("should require creation recency and preserve aliases while normalizing the authorized proposal", async () => {
    const data = fixture(), input = { ...data.input, contactType: "email" as const, identity: "  First.Last+tag@Example.Test ", displayName: "  Grupo  " };
    expect(await data.useCases.create(input)).toMatchObject({ ok: false, failure: { code: "reauthentication_required" } });
    data.sign(REAUTHENTICATION_OPERATION.updateAdmissionPolicy);
    expect(await data.useCases.create(input)).toMatchObject({ ok: false, failure: { code: "reauthentication_required" } });
    expect(data.writer.create).not.toHaveBeenCalled();
    data.sign(REAUTHENTICATION_OPERATION.createAllowlistEntry);
    await data.useCases.create(input);
    expect(data.writer.create).toHaveBeenCalledWith({ context: expect.objectContaining({ sensitiveOperation: "create_allowlist_entry", resourceId: input.tribeId }), operationId: input.operationId, confirmed: true, contact: { type: "email", value: "first.last+tag@example.test" }, displayName: "Grupo" });
  });

  it("should reject an incoherent country or oversized name without reaching the writer", async () => {
    const data = fixture(); data.sign(REAUTHENTICATION_OPERATION.createAllowlistEntry);
    expect(await data.useCases.create({ ...data.input, contactType: "phone", identity: "+5491155501234", country: "US" })).toMatchObject({ ok: false, failure: { code: "invalid_input" } });
    expect(await data.useCases.create({ ...data.input, contactType: "email", identity: "valid@example.test", displayName: "a".repeat(101) })).toMatchObject({ ok: false, failure: { code: "invalid_input" } });
    expect(data.writer.create).not.toHaveBeenCalled();
  });

  it("should bind an edit to its exact signed entry and preserve the observed version", async () => {
    const data = fixture(), input = { ...data.input, entryId: data.entryId, expectedVersion: 7, patch: { displayName: "  Nuevo nombre  ", status: "disabled" as const } };
    data.sign(REAUTHENTICATION_OPERATION.updateAllowlistEntry);
    expect(await data.useCases.update(input)).toMatchObject({ ok: false, failure: { code: "reauthentication_required" } });
    expect(data.writer.update).not.toHaveBeenCalled();
    data.sign(REAUTHENTICATION_OPERATION.updateAllowlistEntry, data.entryId);
    await data.useCases.update(input);
    expect(data.writer.update).toHaveBeenCalledWith({ context: expect.objectContaining({ resourceId: data.entryId, sensitiveOperation: "update_allowlist_entry" }), operationId: input.operationId, confirmed: true, entryId: data.entryId, expectedVersion: 7, patch: { displayName: "Nuevo nombre", status: "disabled" } });
  });

  it("should deny an absent or foreign entry before its repository read", async () => {
    const data = fixture();
    expect(await data.useCases.read({ ...data.input, entryId: randomUUID() })).toMatchObject({ ok: false, failure: { code: "resource_unavailable" } });
    expect(data.reader.read).not.toHaveBeenCalled();
  });
});
