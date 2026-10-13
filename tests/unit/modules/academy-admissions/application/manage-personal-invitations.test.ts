/** @vitest-environment node */
/** Exercises actual native-fact role/resource/recency resolution with doubles only of private storage ports. @module manage-personal-invitations-tests */
import { randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { ManagePersonalInvitationsUseCases } from "@/src/modules/academy-admissions/application/use-cases/manage-personal-invitations-use-cases";
import { ResolveAdmissionContextUseCase } from "@/src/modules/academy-admissions/application/use-cases/resolve-admission-context-use-case";
import type { PersonalInvitationReader, PersonalInvitationCommandWriter } from "@/src/modules/academy-admissions/domain/repositories/personal-invitation-management";
import type { AuthenticatedAccount } from "@/src/modules/auth/domain/entities/authenticated-account";
import type { AdmissionActorFacts } from "@/src/modules/academy-admissions/domain/policies/admission-eligibility";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import { createPersonalInvitation } from "@/src/modules/academy-admissions/domain/entities/personal-invitation";
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";

/** @returns Real resolver/current-account facts and storage-only test boundaries. */
function fixture() {
  const now = new Date("2026-10-09T12:00:00Z"), tribeId = randomUUID(), userId = randomUUID(), sessionId = randomUUID(), accountId = randomUUID(), subject = randomUUID(), invitationId = randomUUID(), operationId = randomUUID();
  const account: AuthenticatedAccount = { userId, normalizedEmail: "leader@example.test", session: { id: sessionId, expiresAt: new Date("2026-10-10T12:00:00Z") }, googleAccount: { id: accountId, subject }, identityEvidence: null, recentAuthentication: [] };
  const actor: AdmissionActorFacts = { userId, tribeId, role: "leader", status: "active" };
  const resolver = new ResolveAdmissionContextUseCase({ getAuthenticatedAccount: async () => account }, { getCurrentActor: async () => actor, getResource: async (_tribeId, resource) => resource.id === invitationId ? { id: invitationId, tribeId } : null }, () => now);
  const reader: PersonalInvitationReader = { list: vi.fn(async () => ({ invitations: [], nextCursor: null })), read: vi.fn(async () => null) };
  const writer: PersonalInvitationCommandWriter = { create: vi.fn(async () => ({ state: "started" as const, operationId })), rename: vi.fn(async () => ({ state: "started" as const, operationId })), revoke: vi.fn(async () => ({ state: "started" as const, operationId })) };
  /** @param operation - Exact purpose. @param resourceId - Bound native resource. @returns Nothing after adding only genuine own resolver recency facts. */
  const sign = (operation: string, resourceId = tribeId) => { account.recentAuthentication = [{ id: randomUUID(), intentId: randomUUID(), userId, sessionId, accountId, subject, tribeId, resourceId, operation, authenticatedAt: now, verifiedAt: now, validUntil: new Date("2026-10-09T12:09:00Z"), invalidatedAt: null }]; };
  const invitation = createPersonalInvitation({ id: invitationId, tribeId, actorUserId: userId, contact: { type: "email", value: "recipient@example.test" }, internalName: "Grupo", requiresAllowlist: false, allowlistExemptionAcknowledged: true, now, policy: { contactType: "email", requiresAdditionalVerification: false } });
  return { actor, account, reader, writer, sign, invitationId, invitation, useCases: new ManagePersonalInvitationsUseCases(resolver, reader, writer), input: { tribeId, requestId: randomUUID(), operationId, confirmed: true as const } };
}

describe("personal invitation administrative authority", () => {
  it("should close crossed failure progress for each mutation and retain the actual original failure cause", async () => {
    const data = fixture();
    for (const code of ["operation_unresolved", "invitation_conflict"] as const) {
      const error = new AdmissionOperationError(code, { operationId: randomUUID(), ...(code === "invitation_conflict" ? { operationState: "completed" as const } : {}) });
      data.sign(REAUTHENTICATION_OPERATION.createPersonalInvitation);
      vi.mocked(data.writer.create).mockRejectedValue(error);
      expect(await data.useCases.create({ ...data.input, contactType: "email", identity: "recipient@example.test", internalName: "Grupo", requiresAllowlist: false, allowlistExemptionAcknowledged: true })).toMatchObject({ ok: false, failure: { code: "public_contract_unusable", cause: { cause: error } } });
      data.sign(REAUTHENTICATION_OPERATION.renamePersonalInvitation, data.invitationId);
      vi.mocked(data.writer.rename).mockRejectedValue(error);
      const rename = await data.useCases.rename({ ...data.input, invitationId: data.invitationId, expectedVersion: 1, internalName: "Otro grupo" });
      expect(rename).toMatchObject({ ok: false, failure: { code: "public_contract_unusable" } });
      if (!rename.ok) expect(rename.failure).not.toHaveProperty("operation");
      data.sign(REAUTHENTICATION_OPERATION.revokePersonalInvitation, data.invitationId);
      vi.mocked(data.writer.revoke).mockRejectedValue(error);
      expect(await data.useCases.revoke({ ...data.input, invitationId: data.invitationId, expectedVersion: 1, revokeRedeemedAuthorization: false, internalReason: "Revocación confirmada" })).toMatchObject({ ok: false, failure: { code: "public_contract_unusable" } });
    }
    data.sign(REAUTHENTICATION_OPERATION.createPersonalInvitation);
    vi.mocked(data.writer.create).mockRejectedValue(new AdmissionOperationError("operation_unresolved", { operationId: data.input.operationId.toUpperCase() }));
    expect(await data.useCases.create({ ...data.input, contactType: "email", identity: "recipient@example.test", internalName: "Grupo", requiresAllowlist: false, allowlistExemptionAcknowledged: true })).toMatchObject({ ok: false, failure: { code: "operation_unresolved", operation: { operationId: data.input.operationId.toUpperCase(), state: "started" } } });
  });
  it("should accept the same UUID in either letter case without losing a newly confirmed token or original update", async () => {
    const data = fixture(), operationId = data.input.operationId.toUpperCase();
    data.sign(REAUTHENTICATION_OPERATION.createPersonalInvitation);
    const initialToken = randomBytes(32).toString("base64url");
    vi.mocked(data.writer.create).mockResolvedValue({ state: "completed", operationId, replayed: false, result: { invitationId: data.invitationId, version: 1, changed: true, created: true }, initialToken });
    expect(await data.useCases.create({ ...data.input, operationId, contactType: "email", identity: "recipient@example.test", internalName: "Grupo", requiresAllowlist: false, allowlistExemptionAcknowledged: true })).toMatchObject({ ok: true, value: { operationId, initialToken } });
    data.sign(REAUTHENTICATION_OPERATION.renamePersonalInvitation, data.invitationId);
    vi.mocked(data.writer.rename).mockResolvedValue({ state: "completed", operationId, replayed: true, result: { invitationId: data.invitationId.toUpperCase(), version: 2, changed: true, created: false } });
    expect(await data.useCases.rename({ ...data.input, operationId, invitationId: data.invitationId, expectedVersion: 1, internalName: "Otro grupo" })).toMatchObject({ ok: true, value: { replayed: true, result: { version: 2 } } });
    data.sign(REAUTHENTICATION_OPERATION.revokePersonalInvitation, data.invitationId);
    vi.mocked(data.writer.revoke).mockResolvedValue({ state: "completed", operationId, replayed: false, result: { invitationId: data.invitationId.toUpperCase(), version: 2, changed: true, created: false } });
    expect(await data.useCases.revoke({ ...data.input, operationId, invitationId: data.invitationId, expectedVersion: 1, revokeRedeemedAuthorization: false, internalReason: "Revocación confirmada" })).toMatchObject({ ok: true, value: { result: { version: 2 } } });
    vi.mocked(data.reader.read).mockResolvedValue({ ...data.invitation, id: data.invitationId.toUpperCase(), tribeId: data.input.tribeId.toUpperCase() });
    expect(await data.useCases.read({ ...data.input, invitationId: data.invitationId })).toMatchObject({ ok: true });
  });
  it("should close crossed operation or resource results and incompatible version outcomes", async () => {
    const data = fixture(); data.sign(REAUTHENTICATION_OPERATION.createPersonalInvitation);
    vi.mocked(data.writer.create).mockResolvedValue({ state: "started", operationId: randomUUID() });
    expect(await data.useCases.create({ ...data.input, contactType: "email", identity: "recipient@example.test", internalName: "Grupo", requiresAllowlist: false, allowlistExemptionAcknowledged: true })).toMatchObject({ ok: false, failure: { code: "public_contract_unusable" } });
    data.sign(REAUTHENTICATION_OPERATION.renamePersonalInvitation, data.invitationId);
    for (const snapshot of [{ invitationId: randomUUID(), version: 3, changed: true, created: false }, { invitationId: data.invitationId, version: 2, changed: true, created: false }]) {
      vi.mocked(data.writer.rename).mockResolvedValue({ state: "completed", operationId: data.input.operationId, replayed: false, result: snapshot });
      expect(await data.useCases.rename({ ...data.input, invitationId: data.invitationId, expectedVersion: 2, internalName: "Grupo" })).toMatchObject({ ok: false, failure: { code: "public_contract_unusable" } });
    }
  });
  it("should close foreign tribe metadata before projecting private history", async () => {
    const data = fixture();
    vi.mocked(data.reader.list).mockResolvedValue({ invitations: [{ ...data.invitation, tribeId: randomUUID() }], nextCursor: null });
    expect(await data.useCases.list({ ...data.input, limit: 20 })).toMatchObject({ ok: false, failure: { code: "public_contract_unusable" } });
  });
  it("should reject another invitation or tribe returned through exact private reads", async () => {
    const data = fixture();
    for (const invitation of [{ ...data.invitation, id: randomUUID() }, { ...data.invitation, tribeId: randomUUID() }]) {
      vi.mocked(data.reader.read).mockResolvedValue(invitation);
      expect(await data.useCases.read({ ...data.input, invitationId: data.invitationId })).toMatchObject({ ok: false, failure: { code: "public_contract_unusable" } });
    }
    vi.mocked(data.reader.read).mockResolvedValue(data.invitation);
    expect(await data.useCases.read({ ...data.input, invitationId: data.invitationId })).toMatchObject({ ok: true, value: { id: data.invitationId, version: 1, internalName: "Grupo" } });
  });
  it("should reject crossed revoke operation or resource and inconsistent change versions", async () => {
    const data = fixture(); data.sign(REAUTHENTICATION_OPERATION.revokePersonalInvitation, data.invitationId);
    const input = { ...data.input, invitationId: data.invitationId, expectedVersion: 2, revokeRedeemedAuthorization: true, internalReason: "Retiro confirmado" };
    vi.mocked(data.writer.revoke).mockResolvedValue({ state: "started", operationId: randomUUID() });
    expect(await data.useCases.revoke(input)).toMatchObject({ ok: false, failure: { code: "public_contract_unusable" } });
    for (const snapshot of [
      { invitationId: randomUUID(), version: 3, changed: true, created: false },
      { invitationId: data.invitationId, version: 3, changed: false, created: false },
      { invitationId: data.invitationId, version: 2, changed: true, created: false },
      { invitationId: data.invitationId, version: 1, changed: true, created: true },
    ]) {
      vi.mocked(data.writer.revoke).mockResolvedValue({ state: "completed", operationId: data.input.operationId, replayed: false, result: snapshot });
      expect(await data.useCases.revoke(input)).toMatchObject({ ok: false, failure: { code: "public_contract_unusable" } });
    }
    vi.mocked(data.writer.revoke).mockResolvedValue({ state: "completed", operationId: data.input.operationId, replayed: true, result: { invitationId: data.invitationId, version: 3, changed: true, created: false } });
    expect(await data.useCases.revoke(input)).toMatchObject({ ok: true, value: { replayed: true, result: { version: 3 } } });
  });
  it("should allow leader history without recency and send only bounded declared filters", async () => {
    const data = fixture();
    expect(await data.useCases.list({ ...data.input, limit: 20, status: "active" })).toEqual({ ok: true, value: { items: [], nextCursor: null }, viewerId: data.account.userId });
    expect(data.reader.list).toHaveBeenCalledWith(expect.objectContaining({ userId: data.account.userId, tribeId: data.input.tribeId }), { limit: 20, status: "active" });
    expect(data.writer.create).not.toHaveBeenCalled();
  });
  it("should deny guardian or inactive leader before contacts, creation or name edits reach storage", async () => {
    for (const restriction of [{ role: "guardian" as const, status: "active" as const }, { role: "leader" as const, status: "muted" as const }]) {
      const data = fixture(); Object.assign(data.actor, restriction); data.sign(REAUTHENTICATION_OPERATION.createPersonalInvitation);
      expect(await data.useCases.list({ ...data.input, limit: 20 })).toMatchObject({ ok: false, failure: { code: "permission_denied" } });
      expect(await data.useCases.create({ ...data.input, contactType: "email", identity: "recipient@example.test", internalName: "Grupo", requiresAllowlist: false, allowlistExemptionAcknowledged: true })).toMatchObject({ ok: false, failure: { code: "permission_denied" } });
      expect(data.reader.list).not.toHaveBeenCalled(); expect(data.writer.create).not.toHaveBeenCalled();
    }
  });
  it("should require creation recency and preserve exact recipient aliases after canonicalization", async () => {
    const data = fixture(), input = { ...data.input, contactType: "email" as const, identity: " Recipient.Name+tag@Example.Test ", internalName: " Grupo ", requiresAllowlist: false, allowlistExemptionAcknowledged: true };
    expect(await data.useCases.create(input)).toMatchObject({ ok: false, failure: { code: "reauthentication_required" } });
    data.sign(REAUTHENTICATION_OPERATION.createPersonalInvitation);
    expect(await data.useCases.create(input)).toMatchObject({ ok: true, value: { state: "started" } });
    expect(data.writer.create).toHaveBeenCalledWith(expect.objectContaining({ contact: { type: "email", value: "recipient.name+tag@example.test" }, internalName: "Grupo", operationId: input.operationId, requiresAllowlist: false, allowlistExemptionAcknowledged: true }));
  });
  it("should reject empty name, wrong country and stale/nonpositive command versions before the private writer", async () => {
    const data = fixture(); data.sign(REAUTHENTICATION_OPERATION.createPersonalInvitation);
    expect(await data.useCases.create({ ...data.input, contactType: "email", identity: "recipient@example.test", internalName: " ", requiresAllowlist: true, allowlistExemptionAcknowledged: false })).toMatchObject({ ok: false, failure: { code: "invalid_input" } });
    expect(await data.useCases.create({ ...data.input, contactType: "phone", identity: "+5491155501234", country: "US", internalName: "Grupo", requiresAllowlist: true, allowlistExemptionAcknowledged: false })).toMatchObject({ ok: false, failure: { code: "invalid_input" } });
    data.sign(REAUTHENTICATION_OPERATION.renamePersonalInvitation, data.invitationId);
    expect(await data.useCases.rename({ ...data.input, invitationId: data.invitationId, expectedVersion: 0, internalName: "Grupo" })).toMatchObject({ ok: false, failure: { code: "invalid_input" } });
    expect(data.writer.create).not.toHaveBeenCalled(); expect(data.writer.rename).not.toHaveBeenCalled();
  });
  it("should tie rename and revoke to exact signed resource and preserve explicit observed state", async () => {
    const data = fixture(); data.sign(REAUTHENTICATION_OPERATION.renamePersonalInvitation, data.invitationId);
    expect(await data.useCases.rename({ ...data.input, invitationId: data.invitationId, expectedVersion: 2, internalName: " Otro grupo " })).toMatchObject({ ok: true, value: { state: "started" } });
    expect(data.writer.rename).toHaveBeenCalledWith(expect.objectContaining({ invitationId: data.invitationId, expectedVersion: 2, internalName: "Otro grupo" }));
    expect(await data.useCases.revoke({ ...data.input, invitationId: data.invitationId, expectedVersion: 2, revokeRedeemedAuthorization: true, internalReason: "Confirmado" })).toMatchObject({ ok: false, failure: { code: "reauthentication_required" } });
    data.sign(REAUTHENTICATION_OPERATION.revokePersonalInvitation, data.invitationId);
    expect(await data.useCases.revoke({ ...data.input, invitationId: data.invitationId, expectedVersion: 2, revokeRedeemedAuthorization: true, internalReason: " Confirmado " })).toMatchObject({ ok: true, value: { state: "started" } });
    expect(data.writer.revoke).toHaveBeenCalledWith(expect.objectContaining({ invitationId: data.invitationId, expectedVersion: 2, revokeRedeemedAuthorization: true, internalReason: "Confirmado" }));
  });
});
