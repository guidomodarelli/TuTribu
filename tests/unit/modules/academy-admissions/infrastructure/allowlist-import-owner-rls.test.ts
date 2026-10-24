/** @vitest-environment node */
/** Proves owner writes under FORCE RLS using a real table owner without superuser or bypass flags. @module allowlist-import-owner-rls-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAllowlistManagement } from "@/tests/support/allowlist-management-database-fixture";
import { PostgresAllowlistImportRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-allowlist-import-repository";
import { parseAllowlistCsv } from "@/src/modules/academy-admissions/infrastructure/api/allowlist-csv-parser";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native private selection owner", () => {
  it("should keep request roles closed but let the actual non-bypass owner persist a valid selection", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAllowlistManagement(database);
      await database.applyMigration("20261009061000_guard_allowlist_import_progress.sql");
      const repository = new PostgresAllowlistImportRepository((_context, work) => database.withContext(fixture.own, work), async () => fixture.config), context = await fixture.confirm(REAUTHENTICATION_OPERATION.previewAllowlistImport), csvText = "identity,display_name\nowner@example.test,Grupo", operationId = randomUUID();
      const result = await repository.preview({ context, operationId, confirmed: true, expectedPolicyVersion: 1, contactType: "email", csvText, rows: parseAllowlistCsv(csvText) });
      if (result.state !== "completed") throw new Error("Native owner preview did not complete");
      const ledgerId = await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ id: string }>(sql`select id from public.academy_admission_operations where actor_user_id=${fixture.userId} and tribe_id=${fixture.tribeId} and idempotency_key=${operationId}`)).rows[0].id);
      const seedOperationId = randomUUID(), seed = await repository.preview({ context, operationId: seedOperationId, confirmed: true, expectedPolicyVersion: 1, contactType: "email", csvText, rows: parseAllowlistCsv(csvText) });
      if (seed.state !== "completed") throw new Error("Native private selection seed did not complete");
      await database.withContext(fixture.own, async (transaction) => {
        const seedLedger = (await transaction.execute<{ id: string }>(sql`select id from public.academy_admission_operations where actor_user_id=${fixture.userId} and tribe_id=${fixture.tribeId} and idempotency_key=${seedOperationId}`)).rows[0].id;
        await transaction.execute(sql`insert into public.academy_allowlist_import_selections(operation_id,import_id,tribe_id,actor_user_id,expected_version,selected_rows) values (${seedLedger},${seed.result.importId},${fixture.tribeId},${fixture.userId},1,array[1])`);
      });
      expect(database.nonBypassRole).toMatchObject({ bypassesRls: false, isSuperuser: false });
      await database.grantTablesToNonBypass(["academy_allowlist_import_selections"]);
      expect((await database.withContext(fixture.own, (transaction) => transaction.execute(sql`select operation_id from public.academy_allowlist_import_selections`), "non_bypass")).rows).toEqual([]);
      await database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`grant create on schema public to ${sql.identifier(database.nonBypassRole.name)}`);
        await transaction.execute(sql`alter table public.academy_allowlist_import_selections owner to ${sql.identifier(database.nonBypassRole.name)}`);
      });
      const own = await database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`insert into public.academy_allowlist_import_selections(operation_id,import_id,tribe_id,actor_user_id,expected_version,selected_rows) values (${ledgerId},${result.result.importId},${fixture.tribeId},${fixture.userId},1,array[1])`);
        return (await transaction.execute(sql`select operation_id from public.academy_allowlist_import_selections where operation_id=${ledgerId}`)).rows;
      }, "non_bypass");
      expect(own).toEqual([{ operation_id: ledgerId }]);
    });
  }, 1_200_000);
});
