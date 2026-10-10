/** Observes admission operations blocked by a real owned database transition. @module admission-transition-contention */
import { sql } from "drizzle-orm";
import type { AcademyAdmissionTestDatabase } from "./academy-admission-database";
import type { RequestDatabase, RequestDatabaseContext } from "@/src/modules/shared/infrastructure/database/server-database-client";

/**
 * Publishes a transition only after PostgreSQL confirms the contender is waiting.
 * @typeParam Result - Observable result of the actual admission operation.
 * @param database - Owned disposable branch with capacity for holder, contender and observer.
 * @param context - Synthetic actor permitted to perform the isolated transition.
 * @param prepare - Stages the real DB-only transition under existing SQL guards before its observation deadline starts.
 * @param compete - Starts the actual operation; rejection is retained for caller assertions.
 * @returns Its settled result after all owned transactions and observation finish.
 * @throws When preparation, proven contention, or an owned transition fails.
 */
export async function withAdmissionTransitionContention<Result>(database: AcademyAdmissionTestDatabase, context: RequestDatabaseContext, prepare: (transaction: RequestDatabase) => Promise<void>, compete: () => Promise<Result>): Promise<PromiseSettledResult<Result>> {
  let announceTransition!: (scope: { pid: number; deadline: string }) => void, rejectTransition!: (error: unknown) => void, releaseTransition!: () => void;
  const prepared = new Promise<{ pid: number; deadline: string }>((resolve, reject) => { announceTransition = resolve; rejectTransition = reject; });
  const released = new Promise<void>((resolve) => { releaseTransition = resolve; });
  const transition = database.withContext(context, async (transaction) => {
    await prepare(transaction);
    const scope = (await transaction.execute<{ pid: number; deadline: string }>(sql`select pg_backend_pid() as pid,clock_timestamp()+interval '60 seconds' as deadline`)).rows[0];
    announceTransition(scope);
    let wasReleased = false;
    void released.then(() => { wasReleased = true; });
    while (!wasReleased) {
      const current = (await transaction.execute<{ live: boolean }>(sql`select clock_timestamp()<${scope.deadline}::timestamptz as live,pg_sleep(0.1)`)).rows[0];
      if (!current.live) throw new Error("Admission transition contention failed: observation_deadline_exceeded");
    }
  });
  void transition.catch(rejectTransition);
  const transitionScope = await prepared;
  const settledContender = Promise.resolve().then(compete).then(
    (value): PromiseFulfilledResult<Result> => ({ status: "fulfilled", value }),
    (reason: unknown): PromiseRejectedResult => ({ status: "rejected", reason }),
  );
  let observationError: unknown;
  try {
    const contended = await database.withContext(context, async (transaction) => {
      await transaction.execute(sql`set local statement_timeout='10s'`);
      for (let attempt = 0; attempt < 150; attempt += 1) {
        await transaction.execute(sql`select pg_stat_clear_snapshot()`);
        const current = (await transaction.execute<{ waiting: number; live: boolean }>(sql`select count(*)::int as waiting,clock_timestamp()<${transitionScope.deadline}::timestamptz as live from pg_stat_activity where wait_event_type='Lock' and ${transitionScope.pid}=any(pg_blocking_pids(pid))`)).rows[0];
        if (current.waiting >= 1) return true;
        if (!current.live) throw new Error("Admission transition observer failed: observation_deadline_exceeded");
        await transaction.execute(sql`select pg_sleep(0.05)`);
      }
      return false;
    });
    if (!contended) throw new Error("Admission transition observer failed: native_wait_unproven");
  } catch (error) { observationError = error; }
  finally { releaseTransition(); }
  const [transitionResult, contenderResult] = await Promise.all([transition.then(() => ({ status: "fulfilled" as const }), (reason: unknown) => ({ status: "rejected" as const, reason })), settledContender]);
  const failures = [observationError, transitionResult.status === "rejected" ? transitionResult.reason : undefined].filter((error) => error !== undefined);
  if (failures.length) throw new AggregateError(failures, "Admission transition contention failed after settling owned transactions", { cause: failures[0] });
  return contenderResult;
}
