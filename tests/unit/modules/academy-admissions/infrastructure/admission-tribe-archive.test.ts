/** @vitest-environment node */
/** Exercises minimal private admission provenance during real physical tribe deletion. @module admission-tribe-archive-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAllowlistAdmission } from "@/tests/support/allowlist-admission-database-fixture";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import { prepareContactVerificationDatabase, seedContactVerificationChallenge } from "@/tests/support/contact-verification-database-fixture";
import { TRIBE_LIFECYCLE_AUDIT_MIGRATIONS, RETIRED_DELIVERY_CANCELLATION_CAUSES } from "@/tests/support/constants/tribe-lifecycle-audit";
import { appendCancelledMessageDeliveryAudit, type MessageDeliveryAuditRow } from "@/src/modules/messaging/infrastructure/repositories/postgres-message-delivery-audit";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("private retired admission tribe provenance", () => {
  it("should preserve the closed causes and selected facts of previous queued cancellations through physical archival", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareContactVerificationDatabase(database);
      await database.applyMigration("20261005093000_guard_academy_membership_sources.sql");
      await database.applyMigration("20261006220000_extend_admission_notifications.sql");
      for (const migration of TRIBE_LIFECYCLE_AUDIT_MIGRATIONS) await database.applyMigration(migration);
      for (const cause of RETIRED_DELIVERY_CANCELLATION_CAUSES) {
        const challenge = await seedContactVerificationChallenge(database, fixture);
        const original = await database.withContext(fixture.own, async (transaction) => {
          const createdAt = new Date((await transaction.execute<{ now: Date | string }>(sql`select clock_timestamp() as now`)).rows[0].now);
          const changed = (await transaction.execute<MessageDeliveryAuditRow>(sql`update public.message_deliveries delivery set state='cancelled',last_outcome=${cause},version=version+1 where id=${challenge.deliveryId} and state='queued' and not exists(select 1 from public.message_delivery_attempts attempt where attempt.delivery_id=delivery.id) returning id,state,version,connection_id,connection_version,channel`)).rows;
          expect(changed).toHaveLength(1);
          await appendCancelledMessageDeliveryAudit(transaction, { tribeId: challenge.scope.tribeId, actorUserId: fixture.userId, operationId: null, cause, createdAt }, changed);
          return (await transaction.execute(sql`select id,operation_id,tribe_lifecycle_operation_id,event_type,rule,cause,resource_version,metadata,created_at from public.academy_admission_audit_events where resource_id=${challenge.deliveryId}`)).rows;
        });
        expect(original).toHaveLength(1);
        expect(original[0]).toMatchObject({ operation_id: null, tribe_lifecycle_operation_id: null, event_type: "delivery_cancelled", rule: cause, cause, resource_version: 2, metadata: { fromState: "queued", toState: "cancelled", previousVersion: 1, connectionId: challenge.scope.connectionId, connectionVersion: 1, channel: "email", attemptId: null, authorizedUsagePolicyVersion: null } });
        await database.withContext(fixture.own, (transaction) => transaction.execute(sql`delete from public.tribes where id=${challenge.scope.tribeId}`));
        await database.withContext(fixture.own, async (transaction) => {
          expect((await transaction.execute(sql`select id,operation_id,tribe_lifecycle_operation_id,event_type,rule,cause,resource_version,metadata,created_at from public.academy_admission_retired_audit_events where resource_id=${challenge.deliveryId}`)).rows).toEqual(original);
          expect((await transaction.execute(sql`select state,version from public.message_deliveries where id=${challenge.deliveryId}`)).rows).toEqual([{ state: "cancelled", version: 2 }]);
        });
      }
    });
  }, 240_000);

  it("should minimize a deleted admitted tribe while retaining its contact reservation, original ledger and audit without affecting global accounts", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const { fixture, applicant: createApplicant } = await prepareAllowlistAdmission(database), owner = await createApplicant();
      await database.applyMigration("20261010100000_minimize_deleted_admission_contact_owners.sql");
      await database.applyMigration("20261010113000_preserve_admission_tribe_namespaces.sql");
      await database.applyMigration("20261010120000_archive_deleted_admission_tribe_provenance.sql");
      const context = await fixture.confirm(REAUTHENTICATION_OPERATION.createAllowlistEntry);
      await fixture.writer.create({ context, operationId: randomUUID(), confirmed: true, contact: { type: "email", value: owner.email }, displayName: null });
      expect(await owner.commands.submit.execute(owner.input)).toMatchObject({ ok: true, value: { state: "completed", result: { outcome: "admitted" } } });
      const before = await database.withContext(fixture.own, async (transaction) => ({
        binding: (await transaction.execute<{ id: string; owner_reference_id: string; first_request_id: string }>(sql`select id,owner_reference_id,first_request_id from public.academy_admission_contact_bindings where tribe_id=${fixture.tribeId}`)).rows[0],
        operations: (await transaction.execute<{ total: number }>(sql`select count(*)::int as total from public.academy_admission_operations where tribe_id=${fixture.tribeId}`)).rows[0].total,
        audit: (await transaction.execute<{ total: number }>(sql`select count(*)::int as total from public.academy_admission_audit_events where tribe_id=${fixture.tribeId}`)).rows[0].total,
      }));
      await expect(database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`delete from public.tribes where id=${fixture.tribeId}`);
        throw new Error("Controlled retired tribe transaction rollback");
      })).rejects.toThrow("Controlled retired tribe transaction rollback");
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select count(*)::int as total from public.academy_admission_retired_bindings where tribe_id=${fixture.tribeId}`)).rows).toEqual([{ total: 0 }]);
        expect((await transaction.execute(sql`select count(*)::int as total from public.academy_admission_contact_bindings where id=${before.binding.id}`)).rows).toEqual([{ total: 1 }]);
        expect((await transaction.execute(sql`select retired_at is null as active from public.academy_admission_tribe_namespaces where tribe_id=${fixture.tribeId}`)).rows).toEqual([{ active: true }]);
      });
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`delete from public.tribes where id=${fixture.tribeId}`));
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select count(*)::int as total from public.tribes where id=${fixture.tribeId}`)).rows).toEqual([{ total: 0 }]);
        expect((await transaction.execute(sql`select id,owner_reference_id,first_request_reference_id from public.academy_admission_retired_bindings where tribe_id=${fixture.tribeId}`)).rows).toEqual([{ id: before.binding.id, owner_reference_id: before.binding.owner_reference_id, first_request_reference_id: before.binding.first_request_id }]);
        expect((await transaction.execute(sql`select count(*)::int as total from public.academy_admission_retired_operations where tribe_id=${fixture.tribeId}`)).rows).toEqual([{ total: before.operations }]);
        expect((await transaction.execute(sql`select count(*)::int as total from public.academy_admission_retired_audit_events where tribe_id=${fixture.tribeId}`)).rows).toEqual([{ total: before.audit }]);
        expect((await transaction.execute(sql`select count(*)::int as total from public.academy_admission_requests where tribe_id=${fixture.tribeId}`)).rows).toEqual([{ total: 0 }]);
        expect((await transaction.execute(sql`select count(*)::int as total from public.tribe_members where tribe_id=${fixture.tribeId}`)).rows).toEqual([{ total: 0 }]);
        expect((await transaction.execute(sql`select count(*)::int as total from public."user" where id in (${fixture.userId},${owner.userId})`)).rows).toEqual([{ total: 2 }]);
        const archive = (await transaction.execute<{ archive: unknown }>(sql`select jsonb_build_object('bindings',(select jsonb_agg(to_jsonb(binding)) from public.academy_admission_retired_bindings binding where tribe_id=${fixture.tribeId}),'operations',(select jsonb_agg(to_jsonb(operation)) from public.academy_admission_retired_operations operation where tribe_id=${fixture.tribeId}),'audit',(select jsonb_agg(to_jsonb(audit)) from public.academy_admission_retired_audit_events audit where tribe_id=${fixture.tribeId})) as archive`)).rows[0].archive;
        expect(JSON.stringify(archive).includes(owner.email) || JSON.stringify(archive).includes(owner.userId)).toBe(false);
      });
      await database.grantTablesToNonBypass(["academy_admission_retired_bindings", "academy_admission_retired_operations", "academy_admission_retired_audit_events"]);
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select id from public.academy_admission_retired_bindings where tribe_id=${fixture.tribeId}`)).rows).toEqual([]);
        expect((await transaction.execute(sql`select id from public.academy_admission_retired_operations where tribe_id=${fixture.tribeId}`)).rows).toEqual([]);
        expect((await transaction.execute(sql`select id from public.academy_admission_retired_audit_events where tribe_id=${fixture.tribeId}`)).rows).toEqual([]);
      }, "non_bypass");
    });
  }, 1_200_000);
});
