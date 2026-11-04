/** @vitest-environment node */
/** Preserves admission identity and authorization until tribe deletion can archive its full scope safely. @module allowlist-binding-tribe-deletion-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAllowlistAdmission } from "@/tests/support/allowlist-admission-database-fixture";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native bound-tribe deletion", () => {
  it("should retire a bound tribe on physical deletion keeping its binding and operations as private provenance and the accounts intact", async () => {
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
      // Physical deletion is wired to the retirement transaction: it commits and keeps only private provenance under the retired namespace.
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`delete from public.tribes where id=${fixture.tribeId}`));
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select count(*)::int as count from public.tribes where id=${fixture.tribeId}`)).rows).toEqual([{ count: 0 }]);
        expect((await transaction.execute(sql`select retired_at is not null as retired from public.academy_admission_tribe_namespaces where tribe_id=${fixture.tribeId}`)).rows).toEqual([{ retired: true }]);
        expect((await transaction.execute(sql`select count(*)::int as count from public.academy_admission_contact_bindings where tribe_id=${fixture.tribeId}`)).rows).toEqual([{ count: 0 }]);
        expect((await transaction.execute(sql`select owner_reference_id=${originalBinding.owner_reference_id} as preserved from public.academy_admission_retired_bindings where id=${originalBinding.id} and tribe_id=${fixture.tribeId}`)).rows).toEqual([{ preserved: true }]);
        // Accounts outlive the tribe; the retired history names them only by reference.
        expect((await transaction.execute(sql`select count(*)::int as count from public."user" where id in (${fixture.userId},${owner.userId})`)).rows).toEqual([{ count: 2 }]);
        expect((await transaction.execute(sql`select count(*)::int as count from public.tribe_members where tribe_id=${fixture.tribeId}`)).rows).toEqual([{ count: 0 }]);
        expect((await transaction.execute<{ operations: number }>(sql`select count(*)::int as operations from public.academy_admission_retired_operations where tribe_id=${fixture.tribeId}`)).rows[0].operations).toBe(original.operations);
      });
    });
  }, 1_200_000);
});
