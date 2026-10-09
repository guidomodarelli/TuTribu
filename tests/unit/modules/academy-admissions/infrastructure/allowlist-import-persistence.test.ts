/** @vitest-environment node */
/** Exercises native temporary previews, original CAS/row outcomes and immutable progress on an owned SQL branch. @module allowlist-import-persistence-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAllowlistManagement } from "@/tests/support/allowlist-management-database-fixture";
import { PostgresAllowlistImportRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-allowlist-import-repository";
import { parseAllowlistCsv } from "@/src/modules/academy-admissions/infrastructure/api/allowlist-csv-parser";
import { presentAllowlistImport } from "@/src/modules/academy-admissions/application/results/allowlist-import-result";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native allowlist imports", () => {
  it("should keep twenty-five successes when the next block rolls back and reconcile the old original after explicit pending-only resume", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAllowlistManagement(database);
      await database.applyMigration("20261009061000_guard_allowlist_import_progress.sql");
      let failBlock = false;
      const repository = new PostgresAllowlistImportRepository((_context, work) => database.withContext(fixture.own, async (transaction) => {
        const before = (await transaction.execute<{ count: number }>(sql`select count(*)::int as count from public.academy_allowlist_import_rows where tribe_id=${fixture.tribeId} and outcome is not null`)).rows[0].count;
        const value = await work(transaction);
        if (failBlock && before === 25 && typeof value === "object" && value !== null && "state" in value && value.state === "claimed") { failBlock = false; throw new Error("Controlled later import block rollback"); }
        return value;
      }), async () => fixture.config);
      const context = await fixture.confirm(REAUTHENTICATION_OPERATION.previewAllowlistImport), csvText = "identity,display_name\n" + Array.from({ length: 30 }, (_, index) => `person-${index + 1}@example.test,Grupo ${index + 1}`).join("\n");
      const preview = await repository.preview({ context, operationId: randomUUID(), confirmed: true, expectedPolicyVersion: 1, contactType: "email", csvText, rows: parseAllowlistCsv(csvText) });
      if (preview.state !== "completed") throw new Error("Native partial preview did not complete");
      const importId = preview.result.importId, confirmContext = await fixture.confirm(REAUTHENTICATION_OPERATION.confirmAllowlistImport, importId), original = { context: confirmContext, importId, operationId: randomUUID(), confirmed: true as const, expectedVersion: 1, selectedRows: Array.from({ length: 30 }, (_, index) => index + 1) };
      failBlock = true;
      await expect(repository.confirm(original)).rejects.toMatchObject({ code: "operation_unresolved", operationId: original.operationId });
      const partial = await repository.read(confirmContext, importId);
      expect(partial?.state).toBe("processing"); expect(partial?.rows.filter((row) => row.outcome === "added")).toHaveLength(25);
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select count(*)::int as count from public.academy_allowlist_entries where tribe_id=${fixture.tribeId}`)).rows).toEqual([{ count: 25 }]);
        await transaction.execute(sql`update public.academy_admission_operations set lease_until=clock_timestamp()-interval '1 second',version=version+1 where actor_user_id=${fixture.userId} and tribe_id=${fixture.tribeId} and idempotency_key=${original.operationId}`);
      });
      const resumed = await repository.confirm({ ...original, operationId: randomUUID(), expectedVersion: partial!.version, selectedRows: [26, 27, 28, 29, 30] });
      expect(resumed).toMatchObject({ state: "completed", result: { state: "completed", counts: { selected: 30, added: 30 } } });
      expect(await repository.confirm(original)).toMatchObject({ state: "completed", result: { counts: { added: 30 } } });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select count(*)::int as count from public.academy_allowlist_entries where tribe_id=${fixture.tribeId}`)).rows).toEqual([{ count: 30 }]);
        expect((await transaction.execute(sql`select count(*)::int as count from public.academy_admission_audit_events where tribe_id=${fixture.tribeId}`)).rows).toEqual([{ count: 30 }]);
        expect((await transaction.execute(sql`select count(*)::int as count from public.academy_allowlist_import_selections where import_id=${importId}`)).rows).toEqual([{ count: 2 }]);
      });
    });
  }, 1_200_000);
  it("should preview without list effects, confirm mixed original rows and replay without reactivating disabled contacts", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAllowlistManagement(database);
      await database.applyMigration("20261009061000_guard_allowlist_import_progress.sql");
      const createContext = await fixture.confirm(REAUTHENTICATION_OPERATION.createAllowlistEntry);
      const existing = await fixture.writer.create({ context: createContext, operationId: randomUUID(), confirmed: true, contact: { type: "email", value: "existing@example.test" }, displayName: "Grupo" });
      const disabled = await fixture.writer.create({ context: createContext, operationId: randomUUID(), confirmed: true, contact: { type: "email", value: "disabled@example.test" }, displayName: "Anterior" });
      if (existing.state !== "completed" || disabled.state !== "completed") throw new Error("Native import seed did not complete");
      const editContext = await fixture.confirm(REAUTHENTICATION_OPERATION.updateAllowlistEntry, disabled.result.entryId);
      await fixture.writer.update({ context: editContext, operationId: randomUUID(), confirmed: true, entryId: disabled.result.entryId, expectedVersion: 1, patch: { status: "disabled" } });
      const repository = new PostgresAllowlistImportRepository((_context, work) => database.withContext(fixture.own, work), async () => fixture.config);
      const csvText = "identity,display_name\nexisting@example.test,Grupo\nnew+tag@example.test,=1+1\ndisabled@example.test,Nuevo\ninvalid,Nombre";
      const context = await fixture.confirm(REAUTHENTICATION_OPERATION.previewAllowlistImport), input = { context, operationId: randomUUID(), confirmed: true as const, expectedPolicyVersion: 1, contactType: "email" as const, csvText, rows: parseAllowlistCsv(csvText) };
      const created = await repository.preview(input);
      expect(created).toMatchObject({ state: "completed", result: { sourceVersion: 1 } });
      if (created.state !== "completed") throw new Error("Native import preview did not complete");
      const importId = created.result.importId, readContext = { ...context, resourceId: importId };
      expect(await repository.preview(input)).toEqual({ ...created, replayed: true });
      const preview = await repository.read(readContext, importId);
      expect(preview!.rows.every((row) => row.outcome === null && !row.selected)).toBe(true);
      expect(presentAllowlistImport(preview!)).not.toHaveProperty("fileFingerprint");
      await database.withContext(fixture.own, async (transaction) => { expect((await transaction.execute(sql`select count(*)::int as count from public.academy_allowlist_entries where tribe_id=${fixture.tribeId}`)).rows).toEqual([{ count: 2 }]); });
      const confirmContext = await fixture.confirm(REAUTHENTICATION_OPERATION.confirmAllowlistImport, importId), confirm = { context: confirmContext, importId, operationId: randomUUID(), confirmed: true as const, expectedVersion: 1, selectedRows: [1, 2, 3] };
      const completed = await repository.confirm(confirm);
      expect(completed).toMatchObject({ state: "completed", result: { importId, state: "completed", counts: { selected: 3, added: 1, unchanged: 1, conflict: 1, skipped: 1 } } });
      expect(await repository.confirm(confirm)).toEqual({ ...completed, replayed: true });
      await expect(repository.confirm({ ...confirm, selectedRows: [2] })).rejects.toMatchObject({ code: "idempotency_conflict" });
      const current = await repository.read(readContext, importId);
      expect(current!.rows.map((row) => row.outcome)).toEqual(["unchanged", "added", "conflict", "skipped"]);
      expect(current!.rows[0].entryVersion).toBe(1);
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select status,version,display_name from public.academy_allowlist_entries where id=${disabled.result.entryId}`)).rows).toEqual([{ status: "disabled", version: 2, display_name: "Anterior" }]);
        expect((await transaction.execute(sql`select count(*)::int as count from public.academy_allowlist_entries where tribe_id=${fixture.tribeId}`)).rows).toEqual([{ count: 3 }]);
        expect((await transaction.execute(sql`select count(*)::int as count from public.academy_admission_contact_bindings where tribe_id=${fixture.tribeId}`)).rows).toEqual([{ count: 0 }]);
      });
    });
  }, 1_200_000);
});
