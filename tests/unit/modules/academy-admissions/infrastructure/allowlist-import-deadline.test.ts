/** @vitest-environment node */
/** Exercises an immutable preview deadline passing during actual row work, with a nontransactional sequence proving the wait occurred. @module allowlist-import-deadline-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAllowlistManagement } from "@/tests/support/allowlist-management-database-fixture";
import { PostgresAllowlistImportRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-allowlist-import-repository";
import { parseAllowlistCsv } from "@/src/modules/academy-admissions/infrastructure/api/allowlist-csv-parser";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native import deadline", () => {
  it("should roll back a staged entry and row outcome when the preview expires during the block", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAllowlistManagement(database);
      await database.applyMigration("20261009061000_guard_allowlist_import_progress.sql");
      const repository = new PostgresAllowlistImportRepository((_context, work) => database.withContext(fixture.own, work), async () => fixture.config), context = await fixture.confirm(REAUTHENTICATION_OPERATION.previewAllowlistImport), csvText = "identity,display_name\ndeadline@example.test,Grupo";
      const original = await repository.preview({ context, operationId: randomUUID(), confirmed: true, expectedPolicyVersion: 1, contactType: "email", csvText, rows: parseAllowlistCsv(csvText) });
      if (original.state !== "completed") throw new Error("Native deadline preview did not complete");
      const importId = randomUUID();
      const confirmContext = await fixture.confirm(REAUTHENTICATION_OPERATION.confirmAllowlistImport, importId);
      await database.withContext(fixture.own, async (transaction) => {
        // Copy genuine producer data into a short-lived immutable fixture. The
        // production deadline guard remains enabled throughout the scenario.
        await transaction.execute(sql`insert into public.academy_allowlist_imports(id,tribe_id,actor_user_id,contact_type,policy_version,file_fingerprint,fingerprint_key_id,security_environment,security_epoch,created_at,expires_at,purge_after) select ${importId},tribe_id,actor_user_id,contact_type,policy_version,file_fingerprint,fingerprint_key_id,security_environment,security_epoch,sample.deadline-interval '24 hours',sample.deadline,sample.deadline from public.academy_allowlist_imports cross join (select clock_timestamp()+interval '35 seconds' as deadline) sample where id=${original.result.importId}`);
        await transaction.execute(sql`insert into public.academy_allowlist_import_rows(import_id,tribe_id,row_number,input_data,validation_result) select ${importId},tribe_id,row_number,input_data,validation_result from public.academy_allowlist_import_rows where import_id=${original.result.importId}`);
        await transaction.execute(sql`create sequence public.test_import_deadline_probe`);
        await transaction.execute(sql`create function public.test_wait_import_deadline() returns trigger language plpgsql as $$ declare deadline timestamptz; begin select expires_at into deadline from public.academy_allowlist_imports where id=NEW.import_id; perform nextval('public.test_import_deadline_probe'); perform pg_sleep(greatest(0,extract(epoch from deadline-clock_timestamp()))+0.1); return NEW; end; $$`);
        await transaction.execute(sql`create trigger test_import_deadline_wait before update on public.academy_allowlist_import_rows for each row execute function public.test_wait_import_deadline()`);
      });
      await expect(repository.confirm({ context: confirmContext, importId, operationId: randomUUID(), confirmed: true, expectedVersion: 1, selectedRows: [1] })).rejects.toMatchObject({ code: "resource_unavailable", operationState: "completed" });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select is_called from public.test_import_deadline_probe`)).rows).toEqual([{ is_called: true }]);
        expect((await transaction.execute(sql`select count(*)::int as count from public.academy_allowlist_entries where tribe_id=${fixture.tribeId}`)).rows).toEqual([{ count: 0 }]);
        expect((await transaction.execute(sql`select outcome,committed_at from public.academy_allowlist_import_rows where import_id=${importId}`)).rows).toEqual([{ outcome: null, committed_at: null }]);
      });
    });
  }, 1_200_000);
});
