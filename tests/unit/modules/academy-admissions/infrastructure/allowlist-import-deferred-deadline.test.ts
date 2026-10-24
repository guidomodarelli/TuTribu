/** @vitest-environment node */
/** Proves the versioned deferred guard rolls back a row whose deadline passes after staging and before commit. @module allowlist-import-deferred-deadline-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAllowlistManagement } from "@/tests/support/allowlist-management-database-fixture";
import { PostgresAllowlistImportRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-allowlist-import-repository";
import { parseAllowlistCsv } from "@/src/modules/academy-admissions/infrastructure/api/allowlist-csv-parser";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native deferred import deadline", () => {
  it("should reject commit after a later wait without persisting a confirmed row", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAllowlistManagement(database);
      await database.applyMigration("20261009061000_guard_allowlist_import_progress.sql");
      const repository = new PostgresAllowlistImportRepository((_context, work) => database.withContext(fixture.own, work), async () => fixture.config), context = await fixture.confirm(REAUTHENTICATION_OPERATION.previewAllowlistImport), csvText = "identity,display_name\ndeferred@example.test,Grupo", operationId = randomUUID();
      const original = await repository.preview({ context, operationId, confirmed: true, expectedPolicyVersion: 1, contactType: "email", csvText, rows: parseAllowlistCsv(csvText) });
      if (original.state !== "completed") throw new Error("Native deferred preview did not complete");
      const ledgerId = await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ id: string }>(sql`select id from public.academy_admission_operations where actor_user_id=${fixture.userId} and tribe_id=${fixture.tribeId} and idempotency_key=${operationId}`)).rows[0].id), importId = randomUUID();
      let databaseCode: unknown;
      try { await database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`insert into public.academy_allowlist_imports(id,tribe_id,actor_user_id,contact_type,policy_version,file_fingerprint,fingerprint_key_id,security_environment,security_epoch,created_at,expires_at,purge_after) select ${importId},tribe_id,actor_user_id,contact_type,policy_version,file_fingerprint,fingerprint_key_id,security_environment,security_epoch,sample.deadline-interval '24 hours',sample.deadline,sample.deadline from public.academy_allowlist_imports cross join (select clock_timestamp()+interval '2 seconds' as deadline) sample where id=${original.result.importId}`);
        await transaction.execute(sql`insert into public.academy_allowlist_import_rows(import_id,tribe_id,row_number,input_data,validation_result) select ${importId},tribe_id,row_number,input_data,validation_result from public.academy_allowlist_import_rows where import_id=${original.result.importId}`);
        await transaction.execute(sql`update public.academy_allowlist_import_rows set outcome='skipped',confirmed_operation_id=${ledgerId},committed_at=clock_timestamp() where import_id=${importId}`);
        await transaction.execute(sql`select pg_sleep(2.2)`);
      }); } catch (error) { databaseCode = typeof error === "object" && error !== null && "code" in error ? error.code : typeof error === "object" && error !== null && "cause" in error && typeof error.cause === "object" && error.cause !== null && "code" in error.cause ? error.cause.code : undefined; }
      expect(databaseCode).toBe("23514");
      await database.withContext(fixture.own, async (transaction) => { expect((await transaction.execute(sql`select count(*)::int as count from public.academy_allowlist_import_rows where import_id=${importId}`)).rows).toEqual([{ count: 0 }]); });
    });
  }, 1_200_000);
});
