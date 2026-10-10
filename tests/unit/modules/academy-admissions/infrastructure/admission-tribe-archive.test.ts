/** @vitest-environment node */
/** Exercises minimal private admission provenance during real physical tribe deletion. @module admission-tribe-archive-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAllowlistAdmission } from "@/tests/support/allowlist-admission-database-fixture";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("private retired admission tribe provenance", () => {
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
