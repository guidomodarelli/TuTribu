/** @vitest-environment node */
/** Proves native account deletion waits for the complete reviewer read instead of forming a user/session FK cycle. @module admission-administrative-exposure-locks-tests */
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAllowlistAdmission } from "@/tests/support/allowlist-admission-database-fixture";
import { MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS } from "@/tests/support/constants/membership-lifecycle-validation";
import { ADMINISTRATIVE_EXPOSURE_LOCK_OBSERVATION } from "@/tests/support/constants/administrative-exposure-validation";
import { PostgresAdmissionReviewReader } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-review-reader";
import { MILLISECONDS_PER_SECOND } from "@/src/constants/time";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native administrative exposure lock order", () => {
  it("should finish a real guardian read while a physical account deletion waits on the already pinned user", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const prepared = await prepareAllowlistAdmission(database, undefined, "active", "guardian");
      const guardian = prepared.historicalApplicant;
      if (!guardian) throw new Error("Native lock fixture failed: guardian_unavailable");
      await database.withServerEnvironment(async (environment) => {
        const pool = new Pool({ connectionString: environment.DATABASE_URL, max: 2 });
        const reader = await pool.connect(), deletion = await pool.connect();
        try {
          for (const client of [reader, deletion]) { await client.query("begin"); await client.query("select set_config('statement_timeout',$1,true)", [ADMINISTRATIVE_EXPOSURE_LOCK_OBSERVATION.statementTimeout]); }
          await reader.query("select set_config('app.current_user_id',$1,true)", [guardian.userId]);
          const transaction = drizzle(reader);
          const scope = { tribeId: prepared.fixture.tribeId, userId: guardian.userId, sessionId: guardian.sessionId, requestId: randomUUID() };
          const reviews = new PostgresAdmissionReviewReader((_scope, run) => run(transaction), async () => false);
          expect((await reviews.readList(scope, { limit: 25 })).records).toEqual([]);
          const deletionPid = (await deletion.query("select pg_backend_pid() as pid")).rows[0].pid;
          const pendingDeletion = deletion.query("delete from public.\"user\" where id=$1", [guardian.userId]).then(() => ({ code: null as string | null }), (error: { code?: string }) => ({ code: error.code ?? null }));
          const horizon = Date.now() + ADMINISTRATIVE_EXPOSURE_LOCK_OBSERVATION.timeoutMs;
          let blocked = false;
          while (!blocked && Date.now() < horizon) {
            blocked = (await reader.query("select exists(select 1 from pg_locks where pid=$1 and not granted) as blocked", [deletionPid])).rows[0].blocked;
            if (!blocked) await reader.query("select pg_sleep($1)", [ADMINISTRATIVE_EXPOSURE_LOCK_OBSERVATION.intervalMs / MILLISECONDS_PER_SECOND]);
          }
          expect(blocked).toBe(true);
          expect((await reviews.readList(scope, { limit: 25 })).records).toEqual([]);
          await reader.query("commit");
          expect(await pendingDeletion).toEqual({ code: null });
          await deletion.query("rollback");
          const accesses = (await reader.query("select count(*)::integer as count from public.academy_admission_audit_events where tribe_id=$1 and actor_user_id=$2 and event_type='authorized_resource_exposure'", [scope.tribeId, guardian.userId])).rows;
          expect(accesses).toEqual([{ count: 2 }]);
        } finally {
          await reader.query("rollback"); await deletion.query("rollback");
          reader.release(); deletion.release(); await pool.end();
        }
      });
    });
  }, MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS);
});
