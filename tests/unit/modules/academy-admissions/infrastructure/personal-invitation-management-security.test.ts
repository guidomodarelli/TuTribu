/** @vitest-environment node */
/** Exercises current authority and independent hosting failures through native SQL and the actual invitation writer. @module personal-invitation-management-security-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAllowlistManagement } from "@/tests/support/allowlist-management-database-fixture";
import { PostgresPersonalInvitationRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-personal-invitation-repository";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native personal invitation management security", () => {
  it("should deny old sensitive contexts and confirmed replay before keys after recency or canonical leadership is lost", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAllowlistManagement(database);
      await database.applyMigration("20261009130000_add_personal_invitation_context_digest.sql");
      let securityReads = 0;
      const repository = new PostgresPersonalInvitationRepository((_context, run) => database.withContext(fixture.own, run), async () => { securityReads += 1; return fixture.config; });
      const context = { ...await fixture.confirm(REAUTHENTICATION_OPERATION.createPersonalInvitation), action: "manage_invitations" as const };
      const input = { context, operationId: randomUUID(), confirmed: true as const, contact: { type: "email" as const, value: "recipient@example.test" }, internalName: "Permiso original", requiresAllowlist: false, allowlistExemptionAcknowledged: true };
      const created = await repository.create(input);
      expect(created.state).toBe("completed");
      if (created.state !== "completed") throw new Error("Personal management authority fixture did not confirm creation");
      const invitationId = created.result.invitationId;
      const renameContext = { ...await fixture.confirm(REAUTHENTICATION_OPERATION.renamePersonalInvitation, invitationId), action: "manage_invitations" as const };
      const revokeContext = { ...await fixture.confirm(REAUTHENTICATION_OPERATION.revokePersonalInvitation, invitationId), action: "manage_invitations" as const };
      const rename = { context: renameContext, operationId: randomUUID(), confirmed: true as const, invitationId, expectedVersion: 1, internalName: "Nombre no autorizado" };
      const revoke = { context: revokeContext, operationId: randomUUID(), confirmed: true as const, invitationId, expectedVersion: 1, revokeRedeemedAuthorization: false, internalReason: "Retiro no autorizado" };
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.recent_authentication_evidence set invalidated_at=clock_timestamp() where user_id=${fixture.userId} and tribe_id=${fixture.tribeId}`));
      securityReads = 0;
      for (const action of [() => repository.create(input), () => repository.rename(rename), () => repository.revoke(revoke)]) await expect(action()).rejects.toMatchObject({ code: "reauthentication_required" });
      const readContext = { ...context, sensitiveOperation: undefined };
      expect((await repository.list(readContext, { limit: 20 })).invitations.map((invitation) => invitation.id)).toEqual([invitationId]);
      expect(await repository.read({ ...readContext, resourceId: invitationId }, invitationId)).toMatchObject({ version: 1, internalName: "Permiso original" });
      expect(securityReads).toBe(0);
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.tribe_members set role='guardian' where tribe_id=${fixture.tribeId} and user_id=${fixture.userId}`));
      for (const action of [() => repository.create(input), () => repository.rename(rename), () => repository.revoke(revoke), () => repository.list(readContext, { limit: 20 }), () => repository.read({ ...readContext, resourceId: invitationId }, invitationId)]) await expect(action()).rejects.toMatchObject({ code: "permission_denied" });
      expect(securityReads).toBe(0);
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select status,version,internal_name from public.academy_personal_invitations where id=${invitationId}`)).rows).toEqual([{ status: "active", version: 1, internal_name: "Permiso original" }]);
        expect((await transaction.execute(sql`select state,count(*)::int as count from public.academy_admission_operations where tribe_id=${fixture.tribeId} group by state`)).rows).toEqual([{ state: "completed", count: 1 }]);
      });
    });
  }, 1_200_000);

  it("should close recovery and roll back a replacement when its independent token key is removed without recovering original material", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAllowlistManagement(database);
      await database.applyMigration("20261009130000_add_personal_invitation_context_digest.sql");
      let security = { ...fixture.config, recoveryLocked: true };
      const repository = new PostgresPersonalInvitationRepository((_context, run) => database.withContext(fixture.own, run), async () => security);
      const context = { ...await fixture.confirm(REAUTHENTICATION_OPERATION.createPersonalInvitation), action: "manage_invitations" as const };
      const input = { context, operationId: randomUUID(), confirmed: true as const, contact: { type: "email" as const, value: "recipient@example.test" }, internalName: "Material original", requiresAllowlist: false, allowlistExemptionAcknowledged: true };
      await expect(repository.create(input)).rejects.toMatchObject({ code: "connection_incomplete" });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select count(*)::int as count from public.academy_admission_operations where tribe_id=${fixture.tribeId}`)).rows).toEqual([{ count: 0 }]);
      });
      security = fixture.config;
      const created = await repository.create(input);
      expect(created.state).toBe("completed");
      if (created.state !== "completed" || !created.initialToken) throw new Error("Personal management key fixture did not confirm initial material");
      const invitationId = created.result.invitationId, token = created.initialToken;
      security = { ...fixture.config, keyrings: { ...fixture.config.keyrings, invitation_token: { ...fixture.config.keyrings.invitation_token, keys: new Map() } } };
      const replacement = { ...input, operationId: randomUUID(), internalName: "Reemisión bloqueada", replacement: { invitationId, expectedVersion: 1 } };
      await expect(repository.create(replacement)).rejects.toMatchObject({ code: "resource_unavailable", operationState: "completed" });
      const replay = await repository.create(input);
      expect(replay).toMatchObject({ state: "completed", replayed: true, result: { invitationId, version: 1 } });
      expect(replay).not.toHaveProperty("initialToken");
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select id,status,version,internal_name from public.academy_personal_invitations where tribe_id=${fixture.tribeId}`)).rows).toEqual([{ id: invitationId, status: "active", version: 1, internal_name: "Material original" }]);
        expect((await transaction.execute(sql`select count(*)::int as count from public.academy_admission_audit_events where tribe_id=${fixture.tribeId}`)).rows).toEqual([{ count: 1 }]);
        const snapshots = (await transaction.execute<{ public_result: unknown }>(sql`select public_result from public.academy_admission_operations where tribe_id=${fixture.tribeId}`)).rows;
        expect(snapshots.every((snapshot) => !JSON.stringify(snapshot.public_result).includes(token))).toBe(true);
      });
    });
  }, 1_200_000);
});
