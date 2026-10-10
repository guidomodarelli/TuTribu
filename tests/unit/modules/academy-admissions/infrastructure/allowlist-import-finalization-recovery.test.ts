/** @vitest-environment node */
/** Exercises original finalization after all row effects commit but the current write confirmation is lost. @module allowlist-import-finalization-recovery-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAllowlistManagement } from "@/tests/support/allowlist-management-database-fixture";
import { PostgresAllowlistImportRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-allowlist-import-repository";
import { parseAllowlistCsv } from "@/src/modules/academy-admissions/infrastructure/api/allowlist-csv-parser";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native import finalization recovery", () => {
  it("should finalize the same original selection after its row committed and recency was withdrawn without repeating that row", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAllowlistManagement(database);
      await database.applyMigration("20261009061000_guard_allowlist_import_progress.sql");
      let importId: string | null = null, withdrawAfterCommit = true;
      const repository = new PostgresAllowlistImportRepository(async (_context, work) => {
        const result = await database.withContext(fixture.own, work);
        if (importId && withdrawAfterCommit && typeof result === "object" && result !== null && "state" in result && result.state === "claimed") {
          const rowCommitted = await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ committed: boolean }>(sql`select completed_rows=1 as committed from public.academy_allowlist_imports where id=${importId}`)).rows[0]?.committed);
          if (rowCommitted) {
            withdrawAfterCommit = false;
            await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.recent_authentication_evidence set invalidated_at=clock_timestamp() where user_id=${fixture.userId} and tribe_id=${fixture.tribeId} and operation='confirm_allowlist_import' and resource_id=${importId} and invalidated_at is null`));
          }
        }
        return result;
      }, async () => fixture.config);
      const csvText = "identity,display_name\nfinalization@example.test,Entrada confirmada\n";
      const preview = await repository.preview({ context: await fixture.confirm(REAUTHENTICATION_OPERATION.previewAllowlistImport), operationId: randomUUID(), confirmed: true, expectedPolicyVersion: 1, contactType: "email", csvText, rows: parseAllowlistCsv(csvText) });
      if (preview.state !== "completed") throw new Error("Import finalization fixture failed: preview_unavailable");
      importId = preview.result.importId;
      const original = { context: await fixture.confirm(REAUTHENTICATION_OPERATION.confirmAllowlistImport, importId), importId, operationId: randomUUID(), confirmed: true as const, expectedVersion: 1, selectedRows: [1] };
      await expect(repository.confirm(original)).rejects.toMatchObject({ code: "reauthentication_required" });
      const snapshot = await repository.read(original.context, importId);
      expect(snapshot).toMatchObject({ state: "processing", rows: [{ outcome: "added" }] });
      expect(snapshot?.rows.filter((row) => row.outcome === null)).toHaveLength(0);
      // Preserve the live original lease; no test-only expiry/reset is used.
      const waitMs = await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ wait_ms: number }>(sql`select greatest(0,extract(epoch from (lease_until-clock_timestamp()))*1000)::int as wait_ms from public.academy_admission_operations where actor_user_id=${fixture.userId} and tribe_id=${fixture.tribeId} and idempotency_key=${original.operationId}`)).rows[0].wait_ms);
      const deadline = Date.now() + waitMs;
      while (Date.now() < deadline) await new Promise<void>((resolve) => setTimeout(resolve, Math.min(1000, deadline - Date.now())));
      const renewed = { ...original, context: await fixture.confirm(REAUTHENTICATION_OPERATION.confirmAllowlistImport, importId) };
      const completed = await repository.confirm(renewed);
      expect(completed).toMatchObject({ state: "completed", result: { counts: { selected: 1, added: 1, unchanged: 0, conflict: 0, skipped: 0 } } });
      expect(await repository.confirm(renewed)).toMatchObject({ state: "completed", replayed: true });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select count(*)::int as total from public.academy_allowlist_entries where tribe_id=${fixture.tribeId}`)).rows).toEqual([{ total: 1 }]);
        expect((await transaction.execute(sql`select count(*)::int as total from public.academy_admission_audit_events where tribe_id=${fixture.tribeId}`)).rows).toEqual([{ total: 1 }]);
        expect((await transaction.execute(sql`select count(*)::int as total from public.academy_allowlist_import_selections where import_id=${importId}`)).rows).toEqual([{ total: 1 }]);
      });
    });
  }, 1_200_000);
});
