/** @vitest-environment node */
/** Exercises full-capacity CSV confirmation and reimport with actual bounded commits and explicit recency renewal. @module allowlist-import-maximum-confirmation-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAllowlistManagement } from "@/tests/support/allowlist-management-database-fixture";
import { PostgresAllowlistImportRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-allowlist-import-repository";
import { parseAllowlistCsv } from "@/src/modules/academy-admissions/infrastructure/api/allowlist-csv-parser";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import { ADMISSION_LIMIT } from "@/src/modules/academy-admissions/constants/admission-limits";
import { ALLOWLIST_IMPORT_BLOCK_SIZE } from "@/src/modules/academy-admissions/constants/allowlist-import";
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";
import type { AllowlistImportRepository } from "@/src/modules/academy-admissions/domain/repositories/allowlist-import-repository";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1" || process.env.RUN_ADMISSION_MAXIMUM_IMPORT_TESTS !== "1")("native maximum import confirmation", () => {
  it("should confirm ten thousand rows and reimport without duplication, reactivation or deletion through genuine explicit recovery", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAllowlistManagement(database);
      await database.applyMigration("20261009061000_guard_allowlist_import_progress.sql");
      // Only this synthetic session is long lived; signed write recency and
      // operation leases retain their unchanged production durations.
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.session set "expiresAt"=clock_timestamp()+interval '12 hours' where id=${fixture.sessionId} and "userId"=${fixture.userId}`));
      let activeImportId: string | null = null, nextProgress = 500;
      const repository = new PostgresAllowlistImportRepository(async (_context, work) => {
        const result = await database.withContext(fixture.own, work);
        if (activeImportId && typeof result === "object" && result !== null && "state" in result && result.state === "claimed") {
          const completed = await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ total: number }>(sql`select completed_rows as total from public.academy_allowlist_imports where id=${activeImportId}`)).rows[0]?.total ?? 0);
          if (completed >= nextProgress) { process.stdout.write(JSON.stringify({ phase: "maximum_import_progress", confirmedRows: completed, targetRows: ADMISSION_LIMIT.csvDataRowCount }) + "\n"); nextProgress += 500; }
        }
        return result;
      }, async () => fixture.config);
      const anchorContext = await fixture.confirm(REAUTHENTICATION_OPERATION.createAllowlistEntry);
      const anchor = await fixture.writer.create({ context: anchorContext, operationId: randomUUID(), confirmed: true, contact: { type: "email", value: "outside-maximum-file@example.test" }, displayName: "Entrada fuera del archivo" });
      if (anchor.state !== "completed") throw new Error("Maximum import fixture failed: independent_entry_unavailable");
      const csvText = "identity,display_name\n" + Array.from({ length: ADMISSION_LIMIT.csvDataRowCount }, (_, index) => `maximum-${index + 1}@example.test,Grupo ${index + 1}`).join("\n");

      /** Resumes the same original confirmed selection after a real authority/lease boundary. @param importId - Exact own preview. @returns The confirmed final original counts after bounded explicit resumptions. */
      const completeImport = async (importId: string) => {
        activeImportId = importId; nextProgress = 500;
        let snapshot = await repository.read(await fixture.confirm(REAUTHENTICATION_OPERATION.confirmAllowlistImport, importId), importId);
        if (!snapshot) throw new Error("Maximum import fixture failed: own_preview_unavailable");
        let priorCompleted = -1;
        const originalIntent = { importId, operationId: randomUUID(), confirmed: true as const, expectedVersion: snapshot.version, selectedRows: snapshot.rows.filter((row) => row.outcome === null).map((row) => row.rowNumber) };
        // Renewal keeps the original UUID, selection and expected version.
        // The owner itself skips confirmed rows and can finish its last snapshot.
        for (let recovery = 0; recovery <= Math.ceil(ADMISSION_LIMIT.csvDataRowCount / ALLOWLIST_IMPORT_BLOCK_SIZE); recovery += 1) {
          const context = await fixture.confirm(REAUTHENTICATION_OPERATION.confirmAllowlistImport, importId);
          const selectedRows = snapshot.rows.filter((row) => row.outcome === null).map((row) => row.rowNumber);
          const completedRows = snapshot.rows.length - selectedRows.length;
          if (completedRows < priorCompleted) throw new Error("Maximum import recovery failed: confirmed_progress_decreased");
          const input: Parameters<AllowlistImportRepository["confirm"]>[0] = { context, ...originalIntent };
          let finalResult: Awaited<ReturnType<AllowlistImportRepository["confirm"]>> | null = null;
          try {
            const result = await repository.confirm(input);
            if (result.state === "completed") finalResult = result;
          } catch (error) {
            if (!(error instanceof AdmissionOperationError) || !["reauthentication_required", "operation_unresolved", "allowlist_import_conflict"].includes(error.code)) throw error;
            process.stdout.write(JSON.stringify({ phase: "maximum_import_explicit_recovery", code: error.code, confirmedRows: completedRows }) + "\n");
          }
          if (finalResult?.state === "completed") {
            const replayContext = await fixture.confirm(REAUTHENTICATION_OPERATION.confirmAllowlistImport, importId);
            expect(await repository.confirm({ ...input, context: replayContext })).toMatchObject({ state: "completed", replayed: true, result: finalResult.result });
            activeImportId = null;
            return finalResult.result;
          }
          // Wait for the original lease rather than editing or clearing it.
          const lease = await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ wait_ms: number }>(sql`select greatest(0,extract(epoch from (max(lease_until)-clock_timestamp()))*1000)::int as wait_ms from public.academy_admission_operations where tribe_id=${fixture.tribeId} and actor_user_id=${fixture.userId} and operation_type='confirm_allowlist_import' and state='started'`)).rows[0].wait_ms ?? 0);
          const deadline = Date.now() + lease;
          while (Date.now() < deadline) await new Promise<void>((resolve) => setTimeout(resolve, Math.min(1000, deadline - Date.now())));
          snapshot = await repository.read(context, importId);
          if (!snapshot) throw new Error("Maximum import recovery failed: own_progress_unavailable");
          priorCompleted = completedRows;
        }
        throw new Error("Maximum import recovery failed: bounded_resume_limit_reached");
      };

      const preview = await repository.preview({ context: await fixture.confirm(REAUTHENTICATION_OPERATION.previewAllowlistImport), operationId: randomUUID(), confirmed: true, expectedPolicyVersion: 1, contactType: "email", csvText, rows: parseAllowlistCsv(csvText) });
      if (preview.state !== "completed") throw new Error("Maximum import fixture failed: original_preview_unavailable");
      expect(await completeImport(preview.result.importId)).toMatchObject({ state: "completed", counts: { selected: 10_000, added: 10_000, unchanged: 0, conflict: 0, skipped: 0 } });
      const first = await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ id: string }>(sql`select id from public.academy_allowlist_entries where tribe_id=${fixture.tribeId} and normalized_contact='maximum-1@example.test'`)).rows[0]);
      const editContext = await fixture.confirm(REAUTHENTICATION_OPERATION.updateAllowlistEntry, first.id);
      expect(await fixture.writer.update({ context: editContext, entryId: first.id, operationId: randomUUID(), confirmed: true, expectedVersion: 1, patch: { status: "disabled" } })).toMatchObject({ state: "completed", result: { version: 2, changed: true } });
      const reimport = await repository.preview({ context: await fixture.confirm(REAUTHENTICATION_OPERATION.previewAllowlistImport), operationId: randomUUID(), confirmed: true, expectedPolicyVersion: 1, contactType: "email", csvText, rows: parseAllowlistCsv(csvText) });
      if (reimport.state !== "completed") throw new Error("Maximum reimport fixture failed: original_preview_unavailable");
      expect(await completeImport(reimport.result.importId)).toMatchObject({ state: "completed", counts: { selected: 10_000, added: 0, unchanged: 9999, conflict: 1, skipped: 0 } });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select count(*)::int as total from public.academy_allowlist_entries where tribe_id=${fixture.tribeId}`)).rows).toEqual([{ total: 10_001 }]);
        expect((await transaction.execute(sql`select status,version from public.academy_allowlist_entries where id=${first.id}`)).rows).toEqual([{ status: "disabled", version: 2 }]);
        expect((await transaction.execute(sql`select display_name,status,version from public.academy_allowlist_entries where id=${anchor.result.entryId}`)).rows).toEqual([{ display_name: "Entrada fuera del archivo", status: "enabled", version: 1 }]);
        expect((await transaction.execute(sql`select count(*)::int as total from public.academy_admission_contact_bindings where tribe_id=${fixture.tribeId}`)).rows).toEqual([{ total: 0 }]);
        expect((await transaction.execute(sql`select count(*)::int as total from public.tribe_members where tribe_id=${fixture.tribeId} and role='tribemate'`)).rows).toEqual([{ total: 0 }]);
      });
    });
  }, 43_200_000);
});
