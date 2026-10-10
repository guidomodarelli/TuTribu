/** Observes a real contact claimant blocked by physical account deletion. @module admission-account-deletion-contention */
import { sql } from "drizzle-orm";
import type { AcademyAdmissionTestDatabase } from "./academy-admission-database";
import type { RequestDatabaseContext } from "@/src/modules/shared/infrastructure/database/server-database-client";

/**
 * Commits deletion only after PostgreSQL confirms the claimant is waiting for it.
 * @typeParam Result - Observable result of the actual admission operation.
 * @param database - Owned disposable branch with room for all three transactions.
 * @param context - Synthetic actor authorized to delete the test-owned account.
 * @param ownerUserId - Exact account whose contact reservation must survive.
 * @param claim - Actual binding or proof operation, with settlement retained immediately.
 * @returns The claimant's settled result after deletion and observation finish.
 * @throws When deletion, proven contention, or an owned transaction fails.
 */
export async function withAdmissionAccountDeletionContention<Result>(database: AcademyAdmissionTestDatabase, context: RequestDatabaseContext, ownerUserId: string, claim: () => Promise<Result>): Promise<PromiseSettledResult<Result>> {
  const horizon = await database.withContext(context, async (transaction) => (await transaction.execute<{ deadline: string }>(sql`select clock_timestamp()+interval '60 seconds' as deadline`)).rows[0].deadline);
  let announceDeletion!: (pid: number) => void, rejectDeletion!: (error: unknown) => void, releaseDeletion!: () => void;
  const deleted = new Promise<number>((resolve, reject) => { announceDeletion = resolve; rejectDeletion = reject; });
  const released = new Promise<void>((resolve) => { releaseDeletion = resolve; });
  const deletion = database.withContext(context, async (transaction) => {
    const removed = (await transaction.execute(sql`delete from public."user" where id=${ownerUserId} returning id`)).rows[0];
    if (!removed) throw new Error("Admission deletion contention failed: owned_account_unavailable");
    announceDeletion((await transaction.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`)).rows[0].pid);
    let wasReleased = false;
    void released.then(() => { wasReleased = true; });
    while (!wasReleased) {
      const current = (await transaction.execute<{ live: boolean }>(sql`select clock_timestamp()<${horizon}::timestamptz as live,pg_sleep(0.1)`)).rows[0];
      if (!current.live) throw new Error("Admission deletion contention failed: observation_deadline_exceeded");
    }
  });
  void deletion.catch(rejectDeletion);
  const deletionPid = await deleted;
  const settledClaim = Promise.resolve().then(claim).then(
    (value): PromiseFulfilledResult<Result> => ({ status: "fulfilled", value }),
    (reason: unknown): PromiseRejectedResult => ({ status: "rejected", reason }),
  );
  let observationError: unknown;
  try {
    const contended = await database.withContext(context, async (transaction) => {
      await transaction.execute(sql`set local statement_timeout='10s'`);
      for (let attempt = 0; attempt < 150; attempt += 1) {
        await transaction.execute(sql`select pg_stat_clear_snapshot()`);
        const current = (await transaction.execute<{ waiting: number; live: boolean }>(sql`select count(*)::int as waiting,clock_timestamp()<${horizon}::timestamptz as live from pg_stat_activity where wait_event_type='Lock' and ${deletionPid}=any(pg_blocking_pids(pid))`)).rows[0];
        if (current.waiting >= 1) return true;
        if (!current.live) throw new Error("Admission deletion observer failed: observation_deadline_exceeded");
        await transaction.execute(sql`select pg_sleep(0.05)`);
      }
      return false;
    });
    if (!contended) throw new Error("Admission deletion observer failed: native_contact_wait_unproven");
  } catch (error) { observationError = error; }
  finally { releaseDeletion(); }
  const [deletionResult, claimResult] = await Promise.all([deletion.then(() => ({ status: "fulfilled" as const }), (reason: unknown) => ({ status: "rejected" as const, reason })), settledClaim]);
  const failures = [observationError, deletionResult.status === "rejected" ? deletionResult.reason : undefined].filter((error) => error !== undefined);
  if (failures.length) throw new AggregateError(failures, "Admission deletion contention failed after settling owned transactions", { cause: failures[0] });
  return claimResult;
}
