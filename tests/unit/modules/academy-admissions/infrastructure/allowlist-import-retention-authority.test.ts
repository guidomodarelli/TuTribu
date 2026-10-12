/** @vitest-environment node */
/** Exercises real rollback and lost-commit behavior of the bounded temporary-material owner. @module allowlist-import-retention-authority-tests */
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAllowlistImportRetention } from "@/tests/support/allowlist-import-retention-fixture";
import { PostgresAllowlistImportMaterialRetention } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-allowlist-import-material-retention";
import { PurgeAllowlistImportMaterialUseCase } from "@/src/modules/academy-admissions/application/use-cases/purge-allowlist-import-material-use-case";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import { ADMISSION_SECURITY_TEST_TIMEOUT_MS } from "@/tests/support/constants/admission-security";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native temporary material authority", () => {
  it.each(["authority", "recovery", "authority_during_recovery"] as const)("should roll back staged material destruction when %s closes before commit", async (gate) => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAllowlistImportRetention(database);
      await database.applyMigration("20261012200000_minimize_expired_allowlist_import_material.sql");
      const before = await fixture.snapshot();
      let staged = false, authorized = true;
      /** @param transaction - Actual staged database transaction, not a synthetic state flag. @returns Whether minimization is already visible before the real commit. */
      const wasPurged = async (transaction?: RequestDatabase) => {
        if (!transaction) return false;
        const observed = (await transaction.execute(sql`select row_number from public.academy_allowlist_import_rows where material_purged_at is not null limit 1`)).rows.length > 0;
        staged ||= observed;
        return observed;
      };
      const owner = new PostgresAllowlistImportMaterialRetention((run) => database.withContext({ userId: null, email: null }, run), async (transaction) => gate === "authority" ? !await wasPurged(transaction) : authorized, async (transaction) => {
        const observed = await wasPurged(transaction);
        if (gate === "authority_during_recovery" && observed) authorized = false;
        return gate === "recovery" && observed;
      });
      await expect(new PurgeAllowlistImportMaterialUseCase(owner).execute({ limit: 2 })).rejects.toMatchObject({ code: gate === "recovery" ? "resource_unavailable" : "permission_denied" });
      expect(staged).toBe(true); expect(await fixture.snapshot()).toEqual(before);
    });
  }, ADMISSION_SECURITY_TEST_TIMEOUT_MS);

  it("should preserve an unconfirmed real commit and resume only unpurged rows without losing original effects", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAllowlistImportRetention(database);
      await database.applyMigration("20261012200000_minimize_expired_allowlist_import_material.sql");
      const before = await fixture.snapshot(); let loseResponse = true;
      const owner = new PostgresAllowlistImportMaterialRetention(async (run) => { const result = await database.withContext({ userId: null, email: null }, run); if (loseResponse) { loseResponse = false; throw new Error("Controlled temporary-import COMMIT response loss"); } return result; }, async () => true, async () => false), useCase = new PurgeAllowlistImportMaterialUseCase(owner);
      await expect(useCase.execute({ limit: 2 })).rejects.toMatchObject({ code: "operation_unresolved" });
      const committed = await fixture.snapshot(); expect(committed.rows.filter((row) => !row.has_input)).toHaveLength(2);
      expect(committed.entries).toEqual(before.entries); expect(committed.operations).toEqual(before.operations); expect(committed.selections).toEqual(before.selections);
      expect(await useCase.execute({ limit: 4 })).toMatchObject({ purgedRows: 4 });
      const after = await fixture.snapshot(); expect(after.rows.filter((row) => !row.has_input)).toHaveLength(6);
      expect(await useCase.execute()).toEqual({ purgedRows: 0, completedImports: 0 }); expect(await fixture.snapshot()).toEqual(after);
    });
  }, ADMISSION_SECURITY_TEST_TIMEOUT_MS);
});
