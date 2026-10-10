/** @vitest-environment node */
/** Preserves admission identity and authorization until tribe deletion can archive its full scope safely. @module allowlist-binding-tribe-deletion-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAllowlistAdmission } from "@/tests/support/allowlist-admission-database-fixture";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native bound-tribe deletion", () => {
  it("should reject physical tribe deletion without losing identity, list configuration, membership or audit provenance", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const { fixture, applicant: createApplicant } = await prepareAllowlistAdmission(database), owner = await createApplicant();
      await database.applyMigration("20261010100000_minimize_deleted_admission_contact_owners.sql");
      await database.applyMigration("20261010113000_preserve_admission_tribe_namespaces.sql");
      const context = await fixture.confirm(REAUTHENTICATION_OPERATION.createAllowlistEntry);
      await fixture.writer.create({ context, operationId: randomUUID(), confirmed: true, contact: { type: "email", value: owner.email }, displayName: null });
      const submitted = await owner.commands.submit.execute(owner.input);
      expect(submitted).toMatchObject({ ok: true, value: { state: "completed", result: { outcome: "admitted" } } });
      const originalBinding = await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ id: string; owner_reference_id: string }>(sql`select id,owner_reference_id from public.academy_admission_contact_bindings where tribe_id=${fixture.tribeId}`)).rows[0]);
      const original = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select (select count(*)::int from public.academy_allowlist_entries where tribe_id=${fixture.tribeId}) as entries,(select count(*)::int from public.academy_admission_operations where tribe_id=${fixture.tribeId}) as operations,(select count(*)::int from public.academy_admission_audit_events where tribe_id=${fixture.tribeId}) as audit,(select count(*)::int from public.academy_admission_requests where tribe_id=${fixture.tribeId}) as requests`)).rows[0]);
      await expect(database.withContext(fixture.own, (transaction) => transaction.execute(sql`delete from public.tribes where id=${fixture.tribeId}`))).rejects.toMatchObject({ cause: { code: "23503", constraint: "admission_binding_tribe_fkey" } });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select count(*)::int as count from public.tribes where id=${fixture.tribeId}`)).rows).toEqual([{ count: 1 }]);
        expect((await transaction.execute(sql`select retired_at is null as active from public.academy_admission_tribe_namespaces where tribe_id=${fixture.tribeId}`)).rows).toEqual([{ active: true }]);
        expect((await transaction.execute(sql`select id=${originalBinding.id} and owner_reference_id=${originalBinding.owner_reference_id} and normalized_contact=${owner.email} and owner_user_id=${owner.userId} and first_request_id is not null and minimized_at is null as preserved from public.academy_admission_contact_bindings where id=${originalBinding.id}`)).rows).toEqual([{ preserved: true }]);
        expect((await transaction.execute(sql`select count(*)::int as count from public."user" where id in (${fixture.userId},${owner.userId})`)).rows).toEqual([{ count: 2 }]);
        expect((await transaction.execute(sql`select count(*)::int as count from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${owner.userId} and role='tribemate' and status='active'`)).rows).toEqual([{ count: 1 }]);
        expect((await transaction.execute(sql`select (select count(*)::int from public.academy_allowlist_entries where tribe_id=${fixture.tribeId}) as entries,(select count(*)::int from public.academy_admission_operations where tribe_id=${fixture.tribeId}) as operations,(select count(*)::int from public.academy_admission_audit_events where tribe_id=${fixture.tribeId}) as audit,(select count(*)::int from public.academy_admission_requests where tribe_id=${fixture.tribeId}) as requests`)).rows).toEqual([original]);
      });
    });
  }, 1_200_000);
});
