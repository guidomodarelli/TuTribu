/** @vitest-environment node */
/** Validates actual maximum preview capacity, stale-entry CAS and current authority before private import effects. @module allowlist-import-authority-persistence-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAllowlistManagement } from "@/tests/support/allowlist-management-database-fixture";
import { PostgresAllowlistImportRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-allowlist-import-repository";
import { parseAllowlistCsv } from "@/src/modules/academy-admissions/infrastructure/api/allowlist-csv-parser";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import { ADMISSION_LIMIT } from "@/src/modules/academy-admissions/constants/admission-limits";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native import authority/capacity", () => {
  it("should persist exactly ten thousand preview rows without list effects and keep changed entries or epochs closed", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAllowlistManagement(database);
      await database.applyMigration("20261009061000_guard_allowlist_import_progress.sql");
      let config = fixture.config;
      const repository = new PostgresAllowlistImportRepository((_context, work) => database.withContext(fixture.own, work), async () => config);
      const context = await fixture.confirm(REAUTHENTICATION_OPERATION.previewAllowlistImport), csvText = "identity,display_name\n" + Array.from({ length: ADMISSION_LIMIT.csvDataRowCount }, (_, index) => `capacity-${index + 1}@example.test,Grupo ${index + 1}`).join("\n");
      const large = await repository.preview({ context, operationId: randomUUID(), confirmed: true, expectedPolicyVersion: 1, contactType: "email", csvText, rows: parseAllowlistCsv(csvText) });
      if (large.state !== "completed") throw new Error("Native capacity preview did not complete");
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select count(*)::int as count from public.academy_allowlist_import_rows where import_id=${large.result.importId}`)).rows).toEqual([{ count: 10_000 }]);
        expect((await transaction.execute(sql`select count(*)::int as count from public.academy_allowlist_entries where tribe_id=${fixture.tribeId}`)).rows).toEqual([{ count: 0 }]);
        expect((await transaction.execute(sql`select relrowsecurity,relforcerowsecurity from pg_class where oid='public.academy_allowlist_import_selections'::regclass`)).rows).toEqual([{ relrowsecurity: true, relforcerowsecurity: true }]);
      });
      const entryContext = await fixture.confirm(REAUTHENTICATION_OPERATION.createAllowlistEntry), existing = await fixture.writer.create({ context: entryContext, operationId: randomUUID(), confirmed: true, contact: { type: "email", value: "changed@example.test" }, displayName: "Inicial" });
      if (existing.state !== "completed") throw new Error("Native stale entry seed did not complete");
      const smallCsv = "identity,display_name\nchanged@example.test,Inicial", small = await repository.preview({ context, operationId: randomUUID(), confirmed: true, expectedPolicyVersion: 1, contactType: "email", csvText: smallCsv, rows: parseAllowlistCsv(smallCsv) });
      if (small.state !== "completed") throw new Error("Native stale preview did not complete");
      const editContext = await fixture.confirm(REAUTHENTICATION_OPERATION.updateAllowlistEntry, existing.result.entryId);
      await fixture.writer.update({ context: editContext, entryId: existing.result.entryId, operationId: randomUUID(), confirmed: true, expectedVersion: 1, patch: { displayName: "Cambio reciente" } });
      const confirmContext = await fixture.confirm(REAUTHENTICATION_OPERATION.confirmAllowlistImport, small.result.importId);
      const done = await repository.confirm({ context: confirmContext, importId: small.result.importId, operationId: randomUUID(), confirmed: true, expectedVersion: 1, selectedRows: [1] });
      expect(done).toMatchObject({ state: "completed", result: { counts: { conflict: 1, added: 0, unchanged: 0 } } });
      config = { ...config, securityEpoch: randomUUID() };
      const largeContext = await fixture.confirm(REAUTHENTICATION_OPERATION.confirmAllowlistImport, large.result.importId);
      await expect(repository.confirm({ context: largeContext, importId: large.result.importId, operationId: randomUUID(), confirmed: true, expectedVersion: 1, selectedRows: [1] })).rejects.toMatchObject({ code: "resource_unavailable", operationState: "completed" });
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.tribe_members set role='guardian' where tribe_id=${fixture.tribeId} and user_id=${fixture.userId}`));
      await expect(repository.read({ ...context, resourceId: large.result.importId }, large.result.importId)).rejects.toMatchObject({ code: "permission_denied" });
      await expect(repository.preview({ context, operationId: randomUUID(), confirmed: true, expectedPolicyVersion: 1, contactType: "email", csvText: smallCsv, rows: parseAllowlistCsv(smallCsv) })).rejects.toMatchObject({ code: "permission_denied" });
    });
  }, 1_200_000);
});
