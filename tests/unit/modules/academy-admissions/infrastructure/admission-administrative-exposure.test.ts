/** @vitest-environment node */
/** Exercises real fixed read facts and current native scope without provider calls or library mocks. @module admission-administrative-exposure-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAllowlistManagement } from "@/tests/support/allowlist-management-database-fixture";
import { PostgresAllowlistImportRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-allowlist-import-repository";
import { PostgresPersonalInvitationRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-personal-invitation-repository";
import { parseAllowlistCsv } from "@/src/modules/academy-admissions/infrastructure/api/allowlist-csv-parser";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import { MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS } from "@/tests/support/constants/membership-lifecycle-validation";
import { recordAdmissionAdministrativeExposure } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-administrative-exposure";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native administrative read exposure", () => {
  it("should record current import and invitation reads without copying rows, tokens, contacts or another command ledger", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAllowlistManagement(database);
      await database.applyMigration("20261009061000_guard_allowlist_import_progress.sql");
      await database.applyMigration("20261009130000_add_personal_invitation_context_digest.sql");
      const execute = <Value>(_context: unknown, run: Parameters<typeof database.withContext<Value>>[1]) => database.withContext(fixture.own, run);
      const imports = new PostgresAllowlistImportRepository(execute, async () => fixture.config);
      const invitations = new PostgresPersonalInvitationRepository(execute, async () => fixture.config);
      const csvText = "identity,display_name\nrecipient@example.test,Nombre privado";
      const importContext = await fixture.confirm(REAUTHENTICATION_OPERATION.previewAllowlistImport);
      const createdImport = await imports.preview({ context: importContext, operationId: randomUUID(), confirmed: true, expectedPolicyVersion: 1, contactType: "email", csvText, rows: parseAllowlistCsv(csvText) });
      if (createdImport.state !== "completed") throw new Error("Native exposure fixture failed: import_unavailable");
      const importId = createdImport.result.importId;
      const invitationContext = { ...await fixture.confirm(REAUTHENTICATION_OPERATION.createPersonalInvitation), action: "manage_invitations" as const };
      const createdInvitation = await invitations.create({ context: invitationContext, operationId: randomUUID(), confirmed: true, contact: { type: "email", value: "recipient@example.test" }, internalName: "Nombre privado", requiresAllowlist: false, allowlistExemptionAcknowledged: true });
      if (createdInvitation.state !== "completed") throw new Error("Native exposure fixture failed: invitation_unavailable");
      const invitationId = createdInvitation.result.invitationId;
      const before = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select count(*)::integer as count from public.academy_admission_operations where tribe_id=${fixture.tribeId}`)).rows);
      const readImportContext = await fixture.confirm(REAUTHENTICATION_OPERATION.confirmAllowlistImport, importId);
      expect((await imports.read(readImportContext, importId)).rows).toHaveLength(1);
      expect((await invitations.list(invitationContext, { limit: 25 })).invitations).toHaveLength(1);
      const readInvitationContext = { ...await fixture.confirm(REAUTHENTICATION_OPERATION.renamePersonalInvitation, invitationId), action: "manage_invitations" as const };
      expect(await invitations.read(readInvitationContext, invitationId)).toMatchObject({ id: invitationId, version: 1 });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select count(*)::integer as count from public.academy_admission_operations where tribe_id=${fixture.tribeId}`)).rows).toEqual(before);
        const events = (await transaction.execute<{ resource_id: string; resource_version: number | null; actor_user_id: string; operation_id: string | null; metadata: object }>(sql`select resource_id,resource_version,actor_user_id,operation_id,metadata from public.academy_admission_audit_events where tribe_id=${fixture.tribeId} and event_type='authorized_resource_exposure' order by created_at,id`)).rows;
        expect(events).toHaveLength(3);
        expect(events.map((event) => [event.resource_id, event.resource_version, event.metadata])).toEqual([
          [importId, 1, { surface: "allowlist_report", itemCount: 1, resourceKind: "entries" }],
          [fixture.tribeId, null, { surface: "invitations", itemCount: 1, resourceKind: "invitations" }],
          [invitationId, 1, { surface: "invitations", itemCount: 1, resourceKind: "invitations" }],
        ]);
        expect(events.every((event) => event.actor_user_id === fixture.userId && event.operation_id === null)).toBe(true);
        for (const marker of ["recipient@example.test", "Nombre privado", csvText, createdInvitation.initialToken ?? randomUUID()]) expect(JSON.stringify(events)).not.toContain(marker);
      });
    });
  }, MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS);

  it("should deny stale scope, role, version and session without granting table writes or recording a false exposure", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAllowlistManagement(database);
      await database.grantTablesToNonBypass(["academy_admission_audit_events", "session"]);
      for (const [surface, resourceId, version, count] of [["allowlist", randomUUID(), 1, 1], ["allowlist", fixture.tribeId, 1, 1], ["allowlist", fixture.tribeId, null, 51], ["allowlist_report", fixture.tribeId, null, 0], ["unapproved", fixture.tribeId, null, 1]] as const) {
        await database.withContext(fixture.own, async (transaction) => { expect((await transaction.execute(sql`select public.record_academy_admission_administrative_exposure(${fixture.tribeId},${fixture.sessionId},${surface},${resourceId},${version},${count}) as recorded`)).rows).toEqual([{ recorded: false }]); }, "non_bypass");
      }
      await database.withContext(fixture.own, async (transaction) => { expect((await transaction.execute(sql`select public.record_academy_admission_administrative_exposure(${fixture.tribeId},${fixture.sessionId},'allowlist',${fixture.tribeId},null,0) as recorded`)).rows).toEqual([{ recorded: true }]); }, "non_bypass");
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.tribe_members set role='guardian' where tribe_id=${fixture.tribeId} and user_id=${fixture.userId}`));
      await database.withContext(fixture.own, async (transaction) => { expect((await transaction.execute(sql`select public.record_academy_admission_administrative_exposure(${fixture.tribeId},${fixture.sessionId},'allowlist',${fixture.tribeId},null,0) as recorded`)).rows).toEqual([{ recorded: false }]); }, "non_bypass");
      const scope = { userId: fixture.userId, sessionId: fixture.sessionId, tribeId: fixture.tribeId };
      await expect(database.withContext(fixture.own, (transaction) => recordAdmissionAdministrativeExposure(transaction, scope, { surface: "allowlist", resourceId: fixture.tribeId, resourceVersion: null, itemCount: 0 }), "non_bypass")).rejects.toMatchObject({ code: "permission_denied" });
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.session set "expiresAt"=clock_timestamp()-interval '1 second' where id=${fixture.sessionId}`));
      await expect(database.withContext(fixture.own, (transaction) => recordAdmissionAdministrativeExposure(transaction, scope, { surface: "request_details", resourceId: fixture.tribeId, resourceVersion: null, itemCount: 0 }), "non_bypass")).rejects.toMatchObject({ code: "authentication_required" });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select public.record_academy_admission_administrative_exposure(${fixture.tribeId},${fixture.sessionId},'request_details',${fixture.tribeId},null,0) as recorded`)).rows).toEqual([{ recorded: false }]);
        expect((await transaction.execute(sql`select count(*)::integer as count from public.academy_admission_audit_events where tribe_id=${fixture.tribeId} and event_type='authorized_resource_exposure'`)).rows).toEqual([{ count: 1 }]);
      });
    });
  }, MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS);
});
