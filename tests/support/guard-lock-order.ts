/** Observes on real PostgreSQL which rows an authorization guard locks, and in which order, without replacing any collaborator. @module guard-lock-order */
import { setTimeout as delay } from "node:timers/promises";
import { sql, type SQL } from "drizzle-orm";
import type { AcademyAdmissionTestDatabase } from "./academy-admission-database";
import type { prepareAdmissionLeader } from "./admission-leader-fixture";
import { readPostgresTestDiagnostics } from "./postgres-test-diagnostics";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import { GUARD_LOCK_ORDER_VALIDATION as VALIDATION, type GuardLockedRow } from "./constants/guard-lock-order";

type Leader = Awaited<ReturnType<typeof prepareAdmissionLeader>>;

/** Thrown only to roll back a scenario's own changes after its outcome was captured. */
export class GuardScenarioRollback extends Error {}

/** @param run - One guard call. @returns `authorized`, or the closed code it raised. */
export async function readGuardOutcome(run: () => Promise<unknown>): Promise<string> {
  try { await run(); return "authorized"; } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && typeof error.code === "string") return error.code;
    throw error;
  }
}

/**
 * @param database - Owned branch. @param leader - Seeded leader. @param prepare - Changes visible only to this scenario. @param run - Guard call in the same transaction.
 * @returns The guard outcome; the transaction is rolled back so scenarios never leak into each other.
 */
export async function readRolledBackGuardOutcome(database: AcademyAdmissionTestDatabase, leader: Leader, prepare: ((transaction: RequestDatabase) => Promise<unknown>) | undefined, run: (transaction: RequestDatabase) => Promise<unknown>): Promise<string> {
  let outcome = "";
  await database.withContext(leader.fixture.own, async (transaction) => {
    await prepare?.(transaction);
    outcome = await readGuardOutcome(() => run(transaction));
    throw new GuardScenarioRollback();
  }).catch((error: unknown) => { if (!(error instanceof GuardScenarioRollback)) throw error; });
  return outcome;
}

/** @param leader - Seeded leader. @returns The statement that locks each guarded row, so a holder or a `NOWAIT` probe can target it. */
export function leaderGuardLockStatements(leader: Leader): Record<GuardLockedRow, (nowait: boolean) => SQL> {
  const mode = (nowait: boolean) => sql.raw(nowait ? "for update nowait" : "for update");
  return {
    tribe: (nowait) => sql`select id from public.tribes where id=${leader.tribeId} ${mode(nowait)}`,
    user: (nowait) => sql`select id from public."user" where id=${leader.fixture.userId} ${mode(nowait)}`,
    session: (nowait) => sql`select id from public.session where id=${leader.sessionId} ${mode(nowait)}`,
    leader: (nowait) => sql`select user_id from public.tribe_members where tribe_id=${leader.tribeId} and user_id=${leader.fixture.userId} ${mode(nowait)}`,
    account: (nowait) => sql`select id from public.account where id=${leader.accountId} ${mode(nowait)}`,
    binding: (nowait) => sql`select session_id from public.global_session_identity_bindings where session_id=${leader.sessionId} ${mode(nowait)}`,
  };
}

/**
 * @param database - Owned branch. @param leader - Seeded leader. @param rows - Rows to probe.
 * @returns Which of them another transaction holds right now: a `NOWAIT` lock fails on a held row and takes and releases a free one.
 */
export async function probeHeldRows(database: AcademyAdmissionTestDatabase, leader: Leader, rows: readonly GuardLockedRow[]): Promise<Record<string, boolean>> {
  const statements = leaderGuardLockStatements(leader), held: Record<string, boolean> = {};
  for (const row of rows) {
    held[row] = await database.withContext(leader.fixture.own, async (transaction) => {
      const locked = await transaction.execute(statements[row](true));
      if (locked.rows.length !== 1) throw new Error(`Guard lock order probe failed: row_not_visible (${row})`);
      return false;
    }).catch((error: unknown) => {
      if (readPostgresTestDiagnostics(error).sqlStates.includes(VALIDATION.lockNotAvailableCode)) return true;
      throw error;
    });
  }
  return held;
}

/** @param database - Owned branch. @param leader - Seeded leader. @returns Whether another transaction holds the tribe `FOR UPDATE`: a `FOR SHARE NOWAIT` probe conflicts only with that. */
export async function isTribeHeldExclusively(database: AcademyAdmissionTestDatabase, leader: Leader): Promise<boolean> {
  return database.withContext(leader.fixture.own, async (transaction) => { await transaction.execute(sql`select id from public.tribes where id=${leader.tribeId} for share nowait`); return false; })
    .catch((error: unknown) => { if (readPostgresTestDiagnostics(error).sqlStates.includes(VALIDATION.lockNotAvailableCode)) return true; throw error; });
}

/** @param database - Owned branch. @param leader - Seeded leader. @param holderPid - Backend holding the row the guard must wait for. @returns Once a transaction is queued behind that holder. */
async function waitForBlockedGuard(database: AcademyAdmissionTestDatabase, leader: Leader, holderPid: number): Promise<void> {
  for (let attempt = 0; attempt < VALIDATION.waitObservationPolls; attempt += 1) {
    const waiting = await database.withContext(leader.fixture.own, async (transaction) => {
      await transaction.execute(sql`select pg_stat_clear_snapshot()`);
      return (await transaction.execute<{ waiting: number }>(sql`select count(*)::int as waiting from pg_stat_activity where wait_event_type='Lock' and ${holderPid}=any(pg_blocking_pids(pid))`)).rows[0].waiting;
    });
    if (waiting > 0) return;
    await delay(VALIDATION.waitObservationPollMs);
  }
  throw new Error("Guard lock order failed: guard_wait_unobserved");
}

/**
 * Holds one row, lets the guard queue behind it and probes what the guard already locked, then releases the holder and probes what the finished guard holds.
 * @param guard - Guard call inside the observed transaction.
 * @param blockedRow - Row another transaction holds first. @param order - Rows the guard is expected to lock, in order.
 * @returns Rows held while the guard waited, its outcome, rows held after it finished but before its transaction ended, and whether it holds the tribe exclusively.
 */
export async function observeGuardLockStep(database: AcademyAdmissionTestDatabase, leader: Leader, guard: (transaction: RequestDatabase) => Promise<unknown>, blockedRow: GuardLockedRow, order: readonly GuardLockedRow[]) {
  let announceHolder!: (pid: number) => void, releaseHolder!: () => void, announceGuard!: (outcome: string) => void, releaseGuard!: () => void;
  const holderLocked = new Promise<number>((resolve) => { announceHolder = resolve; });
  const holderReleased = new Promise<void>((resolve) => { releaseHolder = resolve; });
  const guardFinished = new Promise<string>((resolve) => { announceGuard = resolve; });
  const guardReleased = new Promise<void>((resolve) => { releaseGuard = resolve; });
  const holder = database.withContext(leader.fixture.own, async (transaction) => {
    await transaction.execute(leaderGuardLockStatements(leader)[blockedRow](false));
    announceHolder((await transaction.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`)).rows[0].pid);
    await holderReleased;
  });
  const holderPid = await holderLocked;
  const observed = database.withContext(leader.fixture.own, async (transaction) => {
    announceGuard(await readGuardOutcome(() => guard(transaction)));
    await guardReleased;
  });
  try {
    await waitForBlockedGuard(database, leader, holderPid);
    const whileBlocked = await probeHeldRows(database, leader, order.filter((row) => row !== blockedRow));
    releaseHolder();
    await holder;
    const outcome = await guardFinished;
    const tribeExclusive = await isTribeHeldExclusively(database, leader);
    const afterGuard = await probeHeldRows(database, leader, VALIDATION.allRows);
    return { whileBlocked, outcome, afterGuard, tribeExclusive };
  } finally {
    releaseHolder();
    releaseGuard();
    await Promise.allSettled([holder, observed]);
  }
}

/** @param order - Rows the guard locks, in order. @param blockedRow - Row held first. @returns What `observeGuardLockStep` must observe for a guard that keeps that order. */
export function expectedLockStep(order: readonly GuardLockedRow[], blockedRow: GuardLockedRow) {
  const index = order.indexOf(blockedRow);
  return {
    whileBlocked: Object.fromEntries(order.filter((row) => row !== blockedRow).map((row) => [row, order.indexOf(row) < index])),
    afterGuard: Object.fromEntries(VALIDATION.allRows.map((row) => [row, order.includes(row)])),
  };
}
