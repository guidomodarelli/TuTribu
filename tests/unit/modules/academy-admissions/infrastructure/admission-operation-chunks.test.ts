/** @vitest-environment node */
/** Exercises genuine per-block commit, rollback and original recovery over existing PostgreSQL row ledgers. @module admission-operation-chunks-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAllowlistManagement } from "@/tests/support/allowlist-management-database-fixture";
import { PostgresAdmissionOperationRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-operation-repository";
import { authorizeAdmissionLeader } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-leader-authorizer";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native block ledger", () => {
  it("should preserve the first committed row after a later block rolls back and resume only pending rows", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAllowlistManagement(database), importId = randomUUID(), context = await fixture.confirm(REAUTHENTICATION_OPERATION.confirmAllowlistImport, importId);
      await database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`insert into public.academy_allowlist_imports(id,tribe_id,actor_user_id,contact_type,policy_version,file_fingerprint,fingerprint_key_id,selected_rows,state,expires_at,purge_after) values (${importId},${fixture.tribeId},${fixture.userId},'email',1,${Buffer.from([1])},'synthetic-key',array[1,2,3],'processing',clock_timestamp()+interval '23 hours',clock_timestamp()+interval '23 hours')`);
        for (const rowNumber of [1, 2, 3]) await transaction.execute(sql`insert into public.academy_allowlist_import_rows(import_id,tribe_id,row_number,input_data,validation_result) values (${importId},${fixture.tribeId},${rowNumber},'{}','{}')`);
      });
      const command = { actorUserId: fixture.userId, tribeId: fixture.tribeId, operationType: REAUTHENTICATION_OPERATION.confirmAllowlistImport, idempotencyKey: randomUUID(), intent: { importId, expectedVersion: 1, selectedRows: [1, 2, 3] } };
      const schema = z.strictObject({ confirmedRows: z.int().nonnegative() }), authorize = async (transaction: Parameters<Parameters<typeof database.withContext>[1]>[0]) => { await authorizeAdmissionLeader(transaction, context, { action: "manage_allowlist", resourceId: importId, operation: REAUTHENTICATION_OPERATION.confirmAllowlistImport }); return true; };
      const repository = new PostgresAdmissionOperationRepository((run) => database.withContext(fixture.own, run), authorize, async () => fixture.config);
      let failSecond = true;
      const work = async (transaction: Parameters<typeof authorize>[0]) => {
        const next = (await transaction.execute<{ row_number: number }>(sql`select row_number from public.academy_allowlist_import_rows where import_id=${importId} and outcome is null order by row_number limit 1 for update`)).rows[0];
        if (!next) return { completed: true as const, result: { confirmedRows: 3 } };
        await transaction.execute(sql`update public.academy_allowlist_import_rows set outcome='skipped',committed_at=clock_timestamp() where import_id=${importId} and row_number=${next.row_number}`);
        if (next.row_number === 2 && failSecond) { failSecond = false; throw new Error("Controlled second block rollback"); }
        return { completed: false as const };
      };
      await expect(repository.runChunks(command, schema, 5, work)).rejects.toMatchObject({ code: "operation_unresolved", operationId: command.idempotencyKey });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select row_number,outcome from public.academy_allowlist_import_rows where import_id=${importId} order by row_number`)).rows).toEqual([{ row_number: 1, outcome: "skipped" }, { row_number: 2, outcome: null }, { row_number: 3, outcome: null }]);
        await transaction.execute(sql`update public.academy_admission_operations set lease_until=clock_timestamp()-interval '1 second',version=version+1 where actor_user_id=${fixture.userId} and tribe_id=${fixture.tribeId} and idempotency_key=${command.idempotencyKey}`);
      });
      expect(await repository.runChunks(command, schema, 5, work)).toMatchObject({ state: "completed", result: { confirmedRows: 3 }, replayed: false });
      expect(await repository.runChunks(command, schema, 5, async () => { throw new Error("Confirmed work was repeated"); })).toMatchObject({ state: "completed", replayed: true, result: { confirmedRows: 3 } });
      await expect(repository.runChunks({ ...command, intent: { ...command.intent, selectedRows: [2, 3] } }, schema, 5, work)).rejects.toMatchObject({ code: "idempotency_conflict" });
    });
  }, 1_200_000);
});
