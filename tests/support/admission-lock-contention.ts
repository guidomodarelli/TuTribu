/** Observes actual PostgreSQL lock contention without replacing admission collaborators. @module admission-lock-contention */
import { sql } from "drizzle-orm";
import type { AcademyAdmissionTestDatabase } from "./academy-admission-database";
import type { RequestDatabaseContext } from "@/src/modules/shared/infrastructure/database/server-database-client";

/**
 * Holds the tribe row until two real transactions are observed waiting for it.
 * @param database - Owned branch with capacity for holder, observer and contenders.
 * @param context - Native synthetic account used only by the barrier.
 * @param tribeId - Exact test-owned tribe, never a production scope.
 * @param compete - Starts and settles the explicitly confirmed operations.
 * @returns Their result after all barrier and contender transactions settle.
 * @throws When contention cannot be proven within the independent SQL deadline.
 */
export async function withAdmissionLockContention<Result>(database: AcademyAdmissionTestDatabase, context: RequestDatabaseContext, tribeId: string, compete: () => Promise<Result>): Promise<Result> {
  const horizon = await database.withContext(context, async (transaction) => (await transaction.execute<{ deadline: string }>(sql`select clock_timestamp()+interval '60 seconds' as deadline`)).rows[0].deadline);
  let announceLock!: (pid: number) => void, rejectLock!: (error: unknown) => void, releaseLock!: () => void;
  const locked = new Promise<number>((resolve, reject) => { announceLock = resolve; rejectLock = reject; });
  const released = new Promise<void>((resolve) => { releaseLock = resolve; });
  const holder = database.withContext(context, async (transaction) => {
    await transaction.execute(sql`select id from public.tribes where id=${tribeId} for update`);
    announceLock((await transaction.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`)).rows[0].pid);
    let wasReleased = false;
    void released.then(() => { wasReleased = true; });
    while (!wasReleased) {
      // Keep the existing idle guard active while observing a bounded real wait.
      const current = (await transaction.execute<{ live: boolean }>(sql`select clock_timestamp()<${horizon}::timestamptz as live,pg_sleep(0.1)`)).rows[0];
      if (!current.live) throw new Error("Admission contention barrier failed: observation_deadline_exceeded");
    }
  });
  void holder.catch(rejectLock);
  const holderPid = await locked;
  // Attach settlement immediately so an early rejection is retained for cleanup.
  const settledContenders = Promise.resolve().then(compete).then(
    (value) => ({ status: "fulfilled" as const, value }),
    (error: unknown) => ({ status: "rejected" as const, error }),
  );
  let observationError: unknown;
  try {
    const contended = await database.withContext(context, async (transaction) => {
      await transaction.execute(sql`set local statement_timeout='10s'`);
      for (let attempt = 0; attempt < 150; attempt += 1) {
        await transaction.execute(sql`select pg_stat_clear_snapshot()`);
        const state = (await transaction.execute<{ waiting: number; live: boolean }>(sql`with recursive blocked(pid) as (select pid from pg_stat_activity where wait_event_type='Lock' and ${holderPid}=any(pg_blocking_pids(pid)) union select activity.pid from pg_stat_activity activity join blocked blocker on blocker.pid=any(pg_blocking_pids(activity.pid)) where activity.wait_event_type='Lock') select count(*)::int as waiting,clock_timestamp()<${horizon}::timestamptz as live from blocked`)).rows[0];
        if (state.waiting >= 2) return true;
        if (!state.live) throw new Error("Admission contention observer failed: observation_deadline_exceeded");
        await transaction.execute(sql`select pg_sleep(0.05)`);
      }
      return false;
    });
    if (!contended) throw new Error("Admission contention observer failed: two_native_waiters_unproven");
  } catch (error) { observationError = error; }
  finally { releaseLock(); }
  const [holderResult, contenders] = await Promise.all([holder.then(() => ({ status: "fulfilled" as const }), (error: unknown) => ({ status: "rejected" as const, error })), settledContenders]);
  const errors = [observationError, holderResult.status === "rejected" ? holderResult.error : undefined, contenders.status === "rejected" ? contenders.error : undefined].filter((error) => error !== undefined);
  if (errors.length) throw new AggregateError(errors, "Admission contention failed after settling its owned transactions", { cause: errors[0] });
  if (contenders.status !== "fulfilled") throw new Error("Admission contention result failed: contender_settlement_unavailable");
  return contenders.value;
}
