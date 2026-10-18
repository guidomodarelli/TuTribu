/** @vitest-environment node */
/** Exercises actual presence and admission lock contention on disposable PostgreSQL branches. @module admission-presence-lock-tests */
import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase, type AcademyAdmissionTestDatabase } from "@/tests/support/academy-admission-database";
import { prepareAllowlistManagement } from "@/tests/support/allowlist-management-database-fixture";
import { readPostgresTestDiagnostics } from "@/tests/support/postgres-test-diagnostics";
import { ADMISSION_PRESENCE_LOCK_VALIDATION as VALIDATION } from "@/tests/support/constants/admission-presence-lock";

/**
 * Seeds an actual protected tribe without replacing its native membership guards.
 * @param database - Verified disposable SQL branch.
 * @returns Its native current leader and actual persisted slug.
 */
async function preparePresence(database: AcademyAdmissionTestDatabase) {
  const fixture = await prepareAllowlistManagement(database);
  const slug = await database.withContext(fixture.own, async (transaction) => {
    const now = (await transaction.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now;
    await transaction.execute(sql`update public.academy_admission_policies set is_open=true,activated_at=${now},version=version+1 where tribe_id=${fixture.tribeId}`);
    await transaction.execute(sql`update public.tribes set admissions_control_activated_at=${now} where id=${fixture.tribeId}`);
    return (await transaction.execute<{ slug: string }>(sql`select slug from public.tribes where id=${fixture.tribeId}`)).rows[0].slug;
  });
  return { ...fixture, slug };
}

describe.skipIf(process.env.ACADEMY_ADMISSION_SQL_TESTS !== "1")("native presence during admission", () => {
  it("should complete presence after an admission writer reads the current reviewer under observed contention", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await preparePresence(database);
      const backendReady = Promise.withResolvers<number | null>();
      let presence: Promise<{ completed: boolean; touched: boolean; sqlStates: string[] }> | undefined;
      let writerCompleted = false;
      let writerSqlStates: string[] = [];
      let contentionObserved = false;
      try {
        await database.withContext(fixture.own, async (transaction) => {
          await transaction.execute(sql`select id from public.tribes where id=${fixture.tribeId} for update`);
          presence = database.withContext(fixture.own, async (current) => {
            const pid = (await current.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`)).rows[0].pid;
            backendReady.resolve(pid);
            return (await current.execute<{ touched: boolean }>(sql`select public.touch_tribe_member_presence(${fixture.slug}) as touched`)).rows[0].touched;
          }).then((touched) => ({ completed: true, touched, sqlStates: [] }), (error: unknown) => {
            backendReady.resolve(null);
            return { completed: false, touched: false, sqlStates: readPostgresTestDiagnostics(error).sqlStates };
          });
          const presencePid = await backendReady.promise;
          expect(presencePid !== null).toBe(true);
          await expect.poll(() => database.withContext(fixture.own, async (observer) => (await observer.execute<{ waiting: boolean }>(sql`select cardinality(pg_blocking_pids(${presencePid}))>0 as waiting`)).rows[0].waiting), { timeout: VALIDATION.contentionTimeoutMs, interval: VALIDATION.contentionIntervalMs }).toBe(true);
          contentionObserved = true;
          const reviewers = (await transaction.execute(sql`select user_id from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${fixture.userId} for share`)).rows;
          expect(reviewers.length).toBe(1);
        });
        writerCompleted = true;
      } catch (error) { writerSqlStates = readPostgresTestDiagnostics(error).sqlStates; }
      const presenceResult = await presence;
      const observation = { contentionObserved, writerCompleted, writerSqlStates, presenceResult };
      expect(observation, JSON.stringify(observation)).toEqual({ contentionObserved: true, writerCompleted: true, writerSqlStates: [], presenceResult: { completed: true, touched: true, sqlStates: [] } });
      const effects = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select (select count(*)::int from public.academy_admission_requests where tribe_id=${fixture.tribeId}) as requests,(select count(*)::int from public.message_deliveries where tribe_id=${fixture.tribeId}) as deliveries,(select count(*)::int from public.tribe_members where tribe_id=${fixture.tribeId}) as memberships`)).rows);
      expect(effects).toEqual([{ requests: 0, deliveries: 0, memberships: 1 }]);
    });
  }, VALIDATION.timeoutMs);

  it("should touch only the native current member and preserve membership authority", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await preparePresence(database), outsider = { userId: randomUUID(), email: `${randomUUID()}@example.test` };
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${outsider.userId},'Synthetic presence outsider',${outsider.email},false,clock_timestamp(),clock_timestamp())`));
      const snapshot = () => database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select id,tribe_id,user_id,role,status,status_reason,commercial_recovery_status,admission_membership_effect_id from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${fixture.userId}`)).rows[0]);
      const before = await snapshot();
      expect(await database.withContext({ userId: null, email: null }, async (transaction) => (await transaction.execute<{ touched: boolean }>(sql`select public.touch_tribe_member_presence(${fixture.slug}) as touched`)).rows[0].touched)).toBe(false);
      expect(await database.withContext({ userId: outsider.userId, email: outsider.email }, async (transaction) => (await transaction.execute<{ touched: boolean }>(sql`select public.touch_tribe_member_presence(${fixture.slug}) as touched`)).rows[0].touched)).toBe(false);
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ touched: boolean }>(sql`select public.touch_tribe_member_presence(${VALIDATION.unknownSlug}) as touched`)).rows[0].touched)).toBe(false);
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ touched: boolean }>(sql`select public.touch_tribe_member_presence(${fixture.slug}) as touched`)).rows[0].touched)).toBe(true);
      expect(await snapshot()).toEqual(before);
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ recent: boolean }>(sql`select last_seen_at is not null and last_seen_at<=clock_timestamp() as recent from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${fixture.userId}`)).rows[0].recent)).toBe(true);
    });
  }, VALIDATION.timeoutMs);
});
