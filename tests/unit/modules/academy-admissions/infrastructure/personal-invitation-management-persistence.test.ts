/** @vitest-environment node */
/** Exercises native leader administration, one-view token results and original CAS/replacement without product SDK mocks. @module personal-invitation-management-persistence-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAllowlistAdmission } from "@/tests/support/allowlist-admission-database-fixture";
import { PostgresPersonalInvitationRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-personal-invitation-repository";
import { createPersonalInvitationTokenCodec } from "@/src/modules/academy-admissions/infrastructure/tokens/personal-invitation-token";
import { createAdmissionContactFingerprint } from "@/src/modules/academy-admissions/infrastructure/verification/admission-contact-fingerprint";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native personal invitation administration", () => {
  it("should emit one token, keep replay metadata-only across rename and require exact confirmed replacement before a new version-one resource", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const { fixture } = await prepareAllowlistAdmission(database);
      await database.applyMigration("20261009130000_add_personal_invitation_context_digest.sql");
      let loseReply = false;
      const repository = new PostgresPersonalInvitationRepository(async (_context, run) => {
        const result = await database.withContext(fixture.own, run);
        if (loseReply && result && typeof result === "object" && "state" in result && result.state === "completed") { loseReply = false; throw new Error("Controlled personal invitation COMMIT response loss"); }
        return result;
      }, async () => fixture.config);
      const creation = await fixture.confirm(REAUTHENTICATION_OPERATION.createPersonalInvitation);
      const context = { ...creation, action: "manage_invitations" as const };
      const input = { context, operationId: randomUUID(), confirmed: true as const, contact: { type: "email" as const, value: "recipient.name+tag@example.test" }, internalName: "Grupo inicial", requiresAllowlist: false, allowlistExemptionAcknowledged: true };
      const created = await repository.create(input);
      expect(created).toMatchObject({ state: "completed", replayed: false, result: { version: 1, changed: true, created: true }, initialToken: expect.any(String) });
      if (created.state !== "completed" || !created.initialToken) throw new Error("Expected native one-view initial token");
      const invitationId = created.result.invitationId, initialToken = created.initialToken;
      const replay = await repository.create(input);
      expect(replay).toMatchObject({ state: "completed", replayed: true, result: created.result }); expect(replay).not.toHaveProperty("initialToken");
      await expect(repository.create({ ...input, internalName: "Intent cambiado con la misma clave" })).rejects.toMatchObject({ code: "idempotency_conflict" });
      const renameContext = { ...await fixture.confirm(REAUTHENTICATION_OPERATION.renamePersonalInvitation, invitationId), action: "manage_invitations" as const };
      const renamed = await repository.rename({ context: renameContext, operationId: randomUUID(), confirmed: true, invitationId, expectedVersion: 1, internalName: "Otro nombre" });
      expect(renamed).toMatchObject({ state: "completed", result: { invitationId, version: 2, changed: true, created: false } });
      expect(await repository.create(input)).toMatchObject({ state: "completed", replayed: true, result: { version: 1 } });
      expect(await repository.rename({ context: renameContext, operationId: randomUUID(), confirmed: true, invitationId, expectedVersion: 2, internalName: "Otro nombre" })).toMatchObject({ state: "completed", result: { version: 2, changed: false } });
      await expect(repository.rename({ context: renameContext, operationId: randomUUID(), confirmed: true, invitationId, expectedVersion: 1, internalName: "Otro nombre" })).rejects.toMatchObject({ code: "invitation_conflict", operationState: "completed" });
      await expect(repository.create({ ...input, operationId: randomUUID() })).rejects.toMatchObject({ code: "invitation_conflict", operationState: "completed" });
      await expect(repository.create({ ...input, operationId: randomUUID(), replacement: { invitationId, expectedVersion: 1 } })).rejects.toMatchObject({ code: "invitation_conflict", operationState: "completed" });
      const replacement = await repository.create({ ...input, operationId: randomUUID(), replacement: { invitationId, expectedVersion: 2 } });
      expect(replacement).toMatchObject({ state: "completed", result: { version: 1, created: true } });
      if (replacement.state !== "completed") throw new Error("Expected native replacement creation");
      expect(replacement.result.invitationId).not.toBe(invitationId);
      const latestId = replacement.result.invitationId;
      const revokeContext = { ...await fixture.confirm(REAUTHENTICATION_OPERATION.revokePersonalInvitation, latestId), action: "manage_invitations" as const };
      expect(await repository.revoke({ context: revokeContext, operationId: randomUUID(), confirmed: true, invitationId: latestId, expectedVersion: 1, revokeRedeemedAuthorization: false, internalReason: "Reemisión deliberada" })).toMatchObject({ state: "completed", result: { version: 2, changed: true } });
      const unchanged = { context: revokeContext, operationId: randomUUID(), confirmed: true as const, invitationId: latestId, expectedVersion: 2, revokeRedeemedAuthorization: false, internalReason: "Revocación ya vigente" };
      expect(await repository.revoke(unchanged)).toMatchObject({ state: "completed", result: { version: 2, changed: false } });
      expect(await repository.revoke(unchanged)).toMatchObject({ state: "completed", replayed: true, result: { version: 2, changed: false } });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select status,version from public.academy_personal_invitations where id=${latestId}`)).rows).toEqual([{ status: "revoked", version: 2 }]);
        expect((await transaction.execute(sql`select count(*)::int as count from public.academy_admission_audit_events where resource_id=${latestId}`)).rows).toEqual([{ count: 2 }]);
      });
      const lostInput = { ...input, operationId: randomUUID(), internalName: "Enlace cuya respuesta se perdió" };
      loseReply = true;
      const lost = await repository.create(lostInput);
      expect(lost).toMatchObject({ state: "completed", replayed: true, result: { version: 1, created: true } }); expect(lost).not.toHaveProperty("initialToken");
      await database.withContext(fixture.own, async (transaction) => {
        const original = (await transaction.execute<{ token_hash: Uint8Array; token_context_digest: Uint8Array; token_key_id: string }>(sql`select token_hash,token_context_digest,token_key_id from public.academy_personal_invitations where id=${invitationId}`)).rows[0];
        expect(await createPersonalInvitationTokenCodec(fixture.config).verify(initialToken, { tribeId: fixture.tribeId, invitationId, keyId: original.token_key_id, lookupDigest: original.token_hash, digest: original.token_context_digest })).toBe(true);
        expect((await transaction.execute(sql`select status,version,internal_name from public.academy_personal_invitations where id=${invitationId}`)).rows).toEqual([{ status: "revoked", version: 3, internal_name: "Otro nombre" }]);
        const snapshots = (await transaction.execute<{ public_result: unknown }>(sql`select public_result from public.academy_admission_operations where operation_type in ('create_personal_invitation','rename_personal_invitation','revoke_personal_invitation') and tribe_id=${fixture.tribeId}`)).rows;
        expect(snapshots.every((row) => !JSON.stringify(row.public_result).includes(initialToken))).toBe(true);
      });
      const historyContext = { ...context, sensitiveOperation: undefined };
      const history = await repository.list(historyContext, { limit: 20 });
      expect(history.invitations).toHaveLength(3); expect(JSON.stringify(history)).not.toContain(initialToken);
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.tribe_members set role='guardian' where tribe_id=${fixture.tribeId} and user_id=${fixture.userId}`));
      await expect(repository.list(historyContext, { limit: 20 })).rejects.toMatchObject({ code: "permission_denied" });
      await expect(repository.create(input)).rejects.toMatchObject({ code: "permission_denied" });
    });
  }, 1_200_000);
  it("should reject an outdated confirmed replacement after expiry before materializing expiry or issuing new token material", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const { fixture } = await prepareAllowlistAdmission(database);
      await database.applyMigration("20261009130000_add_personal_invitation_context_digest.sql");
      const repository = new PostgresPersonalInvitationRepository((_context, run) => database.withContext(fixture.own, run), async () => fixture.config);
      const invitationId = randomUUID(), contact = { type: "email" as const, value: "expired.recipient@example.test" };
      const fingerprint = await createAdmissionContactFingerprint(contact, fixture.config);
      const token = await createPersonalInvitationTokenCodec(fixture.config).issue({ tribeId: fixture.tribeId, invitationId });
      // Historical fixture dates satisfy the immutable issuance contract. Expiry
      // is left active until the real creation transaction materializes it.
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`insert into public.academy_personal_invitations(id,tribe_id,created_by_user_id,internal_name,contact_type,normalized_contact,contact_fingerprint,fingerprint_key_id,requires_allowlist,expires_at,token_hash,token_key_id,token_context_digest,created_at,updated_at) values (${invitationId},${fixture.tribeId},${fixture.userId},'Nombre histórico','email',${contact.value},${Buffer.from(fingerprint.digest)},${fingerprint.keyId},false,clock_timestamp()-interval '1 day',${Buffer.from(token.lookupDigest)},${token.keyId},${Buffer.from(token.digest)},clock_timestamp()-interval '8 days',clock_timestamp()-interval '8 days')`));
      const renameContext = { ...await fixture.confirm(REAUTHENTICATION_OPERATION.renamePersonalInvitation, invitationId), action: "manage_invitations" as const };
      expect(await repository.rename({ context: renameContext, operationId: randomUUID(), confirmed: true, invitationId, expectedVersion: 1, internalName: "Nombre observado en versión dos" })).toMatchObject({ state: "completed", result: { version: 2 } });
      const context = { ...await fixture.confirm(REAUTHENTICATION_OPERATION.createPersonalInvitation), action: "manage_invitations" as const };
      const input = { context, operationId: randomUUID(), confirmed: true as const, contact, internalName: "Nueva emisión", requiresAllowlist: false, allowlistExemptionAcknowledged: true, replacement: { invitationId, expectedVersion: 1 } };
      await expect(repository.create(input)).rejects.toMatchObject({ code: "invitation_conflict", operationState: "completed" });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select status,version from public.academy_personal_invitations where id=${invitationId}`)).rows).toEqual([{ status: "active", version: 2 }]);
        expect((await transaction.execute(sql`select count(*)::int as count from public.academy_personal_invitations where tribe_id=${fixture.tribeId} and normalized_contact=${contact.value}`)).rows).toEqual([{ count: 1 }]);
      });
      await expect(repository.create({ ...input, replacement: { invitationId, expectedVersion: 2 } })).rejects.toMatchObject({ code: "idempotency_conflict" });
      const replacement = await repository.create({ ...input, operationId: randomUUID(), replacement: { invitationId, expectedVersion: 2 } });
      expect(replacement).toMatchObject({ state: "completed", replayed: false, result: { created: true, changed: true, version: 1 }, initialToken: expect.any(String) });
      expect(await repository.create({ ...input, operationId: replacement.operationId, replacement: { invitationId, expectedVersion: 2 } })).toMatchObject({ state: "completed", replayed: true, result: { version: 1 } });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select status,version from public.academy_personal_invitations where id=${invitationId}`)).rows).toEqual([{ status: "expired", version: 3 }]);
        expect((await transaction.execute(sql`select count(*)::int as count from public.academy_personal_invitations where tribe_id=${fixture.tribeId} and normalized_contact=${contact.value} and status='active'`)).rows).toEqual([{ count: 1 }]);
      });
    });
  }, 1_200_000);
});
