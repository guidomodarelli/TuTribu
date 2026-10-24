/** @vitest-environment node */
/** Exercises actual original batch recovery, native current permissions and read-only effects under both PostgreSQL execution roles. @module admission-batch-operation-recovery-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionBatch } from "@/tests/support/admission-batch-database-fixture";
import { PostgresAdmissionOperationReader } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-operation-reader";
import { ADMISSION_BATCH_DECISION_OPERATION } from "@/src/modules/academy-admissions/constants/admission-batch-decision";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native batch operation recovery", () => {
  it("should recover only the actor's original selected results without changing ledger state and close on lost role or session for both execution roles", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      // Given a real completed rejection original and the unchanged protected recovery artifact.
      const fixture = await prepareAdmissionBatch(database), requests = await fixture.seedPendingSelection(2);
      await database.applyMigration("20261007002000_read_own_admission_operations.sql");
      await database.applyMigration("20261008220000_scope_admission_operation_recovery.sql");
      await database.grantTablesToNonBypass(["session"]);
      const otherSession = randomUUID();
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${otherSession},${requests[0].applicantId},${randomUUID()},clock_timestamp()+interval '1 hour',clock_timestamp(),clock_timestamp())`));
      const operationId = randomUUID(), original = await fixture.writer.decideBatch({ ...fixture.scope, operationId, confirmed: true, decision: "reject", internalReason: "Motivo privado del lote", externalMessage: null, items: requests.map((request) => ({ admissionRequestId: request.admissionRequestId, expectedVersion: request.expectedVersion })) });
      if (original.state !== "completed") throw new Error("Native batch recovery fixture requires a committed original");
      const readers = (["runtime", "non_bypass"] as const).map((role) => new PostgresAdmissionOperationReader((scope, run) => database.withContext({ userId: scope.userId, email: null }, run, role)));
      const readEffects = () => database.withContext(fixture.own, async (transaction) => ({
        original: (await transaction.execute(sql`select id,state,version,lease_owner,lease_until,completed_at,public_result from public.academy_admission_operations where tribe_id=${fixture.tribeId} and idempotency_key=${operationId}`)).rows,
        deliveries: (await transaction.execute<{ count: number }>(sql`select count(*)::int as count from public.message_deliveries where tribe_id=${fixture.tribeId}`)).rows[0].count,
        decisions: (await transaction.execute<{ count: number }>(sql`select count(*)::int as count from public.academy_admission_decisions where tribe_id=${fixture.tribeId}`)).rows[0].count,
      }));
      const before = await readEffects();

      // When either executor reads the existing original, it neither claims nor repeats a decision.
      for (const reader of readers) {
        const recovered = await reader.read(fixture.scope, operationId);
        expect(recovered).toEqual({ operationType: ADMISSION_BATCH_DECISION_OPERATION, operation: { state: "completed", operationId, replayed: true, result: original.result } });
        expect(JSON.stringify(recovered)).not.toContain("Motivo privado del lote");
        expect(await reader.read({ ...fixture.scope, tribeId: randomUUID() }, operationId)).toBeNull();
        expect(await reader.read(fixture.scope, randomUUID())).toBeNull();
        expect(await reader.read({ ...fixture.scope, userId: requests[0].applicantId, sessionId: otherSession }, operationId)).toBeNull();
      }

      // Then both current role and session are still mandatory, even for an original committed earlier.
      expect(await readEffects()).toEqual(before);
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.tribe_members set status='muted' where tribe_id=${fixture.tribeId} and user_id=${fixture.scope.userId}`));
      for (const reader of readers) await expect(reader.read(fixture.scope, operationId)).rejects.toMatchObject({ code: "permission_denied" });
      await database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`update public.tribe_members set status='active' where tribe_id=${fixture.tribeId} and user_id=${fixture.scope.userId}`);
        await transaction.execute(sql`update public.session set "expiresAt"=clock_timestamp()-interval '1 second' where id=${fixture.scope.sessionId}`);
      });
      for (const reader of readers) await expect(reader.read(fixture.scope, operationId)).rejects.toMatchObject({ code: "authentication_required" });
      expect(await readEffects()).toEqual(before);
      await expect(database.withContext(fixture.own, (transaction) => transaction.execute(sql`select id from public.academy_admission_operations`), "non_bypass")).rejects.toMatchObject({ cause: { code: "42501" } });
    });
  }, 600_000);
});
