/** @vitest-environment node */
/** Exercises actual bounded minimization of temporary rows while preserving completed and partial original effects. @module allowlist-import-material-retention-tests */
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAllowlistImportRetention } from "@/tests/support/allowlist-import-retention-fixture";
import { ADMISSION_SECURITY_TEST_TIMEOUT_MS } from "@/tests/support/constants/admission-security";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native temporary import material retention", () => {
  it("should erase only due input and report material in bounded original batches without losing row results or imported entries", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAllowlistImportRetention(database), before = await fixture.snapshot();
      await database.applyMigration("20261012200000_minimize_expired_allowlist_import_material.sql");
      const first = await database.withContext({ userId: null, email: null }, async (transaction) => (await transaction.execute<{ purged_rows: number; completed_imports: number }>(sql`select * from public.purge_expired_allowlist_import_material(2)`)).rows[0]);
      expect(first.purged_rows).toBe(2);
      const observations = await database.withContext({ userId: null, email: null }, (transaction) => transaction.execute(sql`select count(*)::int as samples,sum((metadata->>'processed')::int)::int as processed,bool_and((metadata->>'remaining')::boolean) as remaining,bool_and((metadata->>'durationMs')::numeric>=0) as timed from public.academy_admission_audit_events where resource_type='retention_run' and metadata->>'owner'='allowlist_import_material'`));
      expect(observations.rows).toEqual([{ samples: 1, processed: 2, remaining: true, timed: true }]);
      const partial = await fixture.snapshot();
      expect(partial.rows.filter((row) => !row.has_input && !row.has_validation)).toHaveLength(2);
      expect(partial.entries).toEqual(before.entries); expect(partial.operations).toEqual(before.operations); expect(partial.selections).toEqual(before.selections);
      for (const limit of [2, 2]) await database.withContext({ userId: null, email: null }, (transaction) => transaction.execute(sql`select * from public.purge_expired_allowlist_import_material(${limit})`));
      const after = await fixture.snapshot(), fresh = fixture.cases.find((entry) => entry.name === "fresh")!;
      expect(after.rows.filter((row) => !row.has_input && !row.has_validation)).toHaveLength(6);
      expect(after.rows.filter((row) => row.import_id === fresh.importId)).toEqual(before.rows.filter((row) => row.import_id === fresh.importId));
      expect(after.entries).toEqual(before.entries); expect(after.operations).toEqual(before.operations); expect(after.selections).toEqual(before.selections);
      for (const originalImport of before.imports) {
        const current = after.imports.find((row) => row.id === originalImport.id)!;
        if (originalImport.id === fresh.importId || originalImport.state === "completed") expect(current).toEqual(originalImport);
        else expect(current).toEqual({ ...originalImport, state: "expired", version: 2 });
      }
      expect(after.rows.map(({ has_input: _input, has_validation: _validation, ...original }) => original)).toEqual(before.rows.map(({ has_input: _input, has_validation: _validation, ...original }) => original));
      const replay = await database.withContext({ userId: null, email: null }, async (transaction) => (await transaction.execute(sql`select * from public.purge_expired_allowlist_import_material(2)`)).rows[0]);
      expect(replay).toEqual({ purged_rows: 0, completed_imports: 0 }); expect(await fixture.snapshot()).toEqual(after);
      await expect(database.withContext(fixture.own, (transaction) => transaction.execute(sql`select * from public.purge_expired_allowlist_import_material(1)`), "non_bypass")).rejects.toMatchObject({ cause: { code: "42501" } });
    });
  }, ADMISSION_SECURITY_TEST_TIMEOUT_MS);

  it("should reject premature minimization and prevent restoring expired material or inserting it again", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAllowlistImportRetention(database);
      await database.applyMigration("20261012200000_minimize_expired_allowlist_import_material.sql");
      const fresh = fixture.cases.find((entry) => entry.name === "fresh")!, expired = fixture.cases.find((entry) => entry.name === "completed")!;
      await expect(database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.academy_allowlist_import_rows set input_data='{}',validation_result='{}',material_purged_at=clock_timestamp() where import_id=${fresh.importId} and row_number=1`))).rejects.toMatchObject({ cause: { code: "23514" } });
      await database.withContext({ userId: null, email: null }, (transaction) => transaction.execute(sql`select * from public.purge_expired_allowlist_import_material(6)`));
      const before = await fixture.snapshot();
      await expect(database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.academy_allowlist_import_rows set material_purged_at=null,input_data='{"identity":"restored@example.test"}'::jsonb where import_id=${expired.importId} and row_number=1`))).rejects.toMatchObject({ cause: { code: "23514" } });
      await expect(database.withContext(fixture.own, (transaction) => transaction.execute(sql`insert into public.academy_allowlist_import_rows(import_id,tribe_id,row_number,input_data,validation_result) values (${expired.importId},${expired.tribeId},4,'{}','{}')`))).rejects.toMatchObject({ cause: { code: "23514" } });
      await expect(database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.academy_allowlist_import_rows set outcome='skipped',confirmed_operation_id=${expired.operationId},committed_at=clock_timestamp() where import_id=${expired.importId} and row_number=1`))).rejects.toMatchObject({ cause: { code: "23514" } });
      expect(await fixture.snapshot()).toEqual(before);
    });
  }, ADMISSION_SECURITY_TEST_TIMEOUT_MS);
});
