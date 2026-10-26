/** @vitest-environment node */
/** Exercises real occupied-scope skipping before the global temporary-row ceiling. @module allowlist-import-retention-lock-tests */
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAllowlistImportRetention } from "@/tests/support/allowlist-import-retention-fixture";
import { buildAdmissionImportRetentionModule } from "@/src/modules/academy-admissions/setup";
import { ADMISSION_SECURITY_TEST_TIMEOUT_MS } from "@/tests/support/constants/admission-security";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native temporary import lock boundaries", () => {
  it("should skip an occupied eligible tribe before the total row limit and leave its material untouched", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAllowlistImportRetention(database);
      await database.applyMigration("20261012200000_minimize_expired_allowlist_import_material.sql");
      const held = fixture.cases.filter((entry) => entry.name !== "fresh").sort((left, right) => left.tribeId.localeCompare(right.tribeId))[0];
      const locked = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
      const blocker = database.withContext(fixture.own, async (transaction) => { await transaction.execute(sql`select id from public.tribes where id=${held.tribeId} for update`); locked.resolve(); await release.promise; });
      void blocker.catch((error: unknown) => locked.reject(error));
      try {
        await locked.promise;
        const maintenance = buildAdmissionImportRetentionModule({ execute: (run) => database.withContext({ userId: null, email: null }, run), authorize: async () => true, readRecoveryLock: async () => false });
        expect(await maintenance.useCases.purgeImportMaterial.execute({ limit: 1 })).toEqual({ purgedRows: 1, completedImports: 0 });
        const after = await fixture.snapshot();
        expect(after.rows.filter((row) => row.import_id === held.importId).every((row) => row.has_input && row.has_validation)).toBe(true);
        expect(after.rows.filter((row) => !row.has_input)).toHaveLength(1);
      } finally { release.resolve(); await blocker; }
    }, { concurrentTransactions: 2 });
  }, ADMISSION_SECURITY_TEST_TIMEOUT_MS);
});
