/** @vitest-environment node */
/** Pins on real PostgreSQL the outcomes and the lock order of the full admission leader guard, so its implementation can change without changing either. @module admission-leader-guard-parity-tests */
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { sql, type SQL } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase, type AcademyAdmissionTestDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionLeader } from "@/tests/support/admission-leader-fixture";
import { readPostgresTestDiagnostics } from "@/tests/support/postgres-test-diagnostics";
import { authorizeAdmissionLeader } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-leader-authorizer";
import type { AuthorizedAdmissionContext } from "@/src/modules/academy-admissions/domain/repositories/admission-authorization-reader";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import { ADMISSION_ACTION } from "@/src/modules/academy-admissions/constants/admission-eligibility";
import { ADMISSION_LEADER_GUARD_PARITY_VALIDATION as VALIDATION, type AdmissionLeaderGuardLockedRow, type AdmissionLeaderGuardOutcome } from "@/tests/support/constants/admission-leader-guard-parity";

type GuardScope = Parameters<typeof authorizeAdmissionLeader>[2];
type Leader = Awaited<ReturnType<typeof prepareAdmissionLeader>>;

/** Thrown only to roll back a scenario's own changes after its outcome was captured. */
class ScenarioRollback extends Error {}

/** @param run - One guard call. @returns `authorized`, or the closed code it raised. */
async function readOutcome(run: () => Promise<void>): Promise<AdmissionLeaderGuardOutcome | string> {
  try { await run(); return "authorized"; } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && typeof error.code === "string") return error.code;
    throw error;
  }
}

/** @param leader - Seeded leader. @returns The statement that locks one guarded row, so a holder or a `NOWAIT` probe can target it. */
function lockStatements(leader: Leader): Record<AdmissionLeaderGuardLockedRow, (nowait: boolean) => SQL> {
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
async function probeHeldRows(database: AcademyAdmissionTestDatabase, leader: Leader, rows: readonly AdmissionLeaderGuardLockedRow[]): Promise<Record<string, boolean>> {
  const statements = lockStatements(leader), held: Record<string, boolean> = {};
  for (const row of rows) {
    held[row] = await database.withContext(leader.fixture.own, async (transaction) => {
      const locked = await transaction.execute(statements[row](true));
      if (locked.rows.length !== 1) throw new Error(`Leader guard parity probe failed: row_not_visible (${row})`);
      return false;
    }).catch((error: unknown) => {
      if (readPostgresTestDiagnostics(error).sqlStates.includes(VALIDATION.lockNotAvailableCode)) return true;
      throw error;
    });
  }
  return held;
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
  throw new Error("Leader guard parity failed: guard_wait_unobserved");
}

/**
 * Holds one row, lets the guard queue behind it and probes what the guard already locked, then releases both and probes what the finished guard holds.
 * @returns Rows held while the guard waited, and rows held after it finished but before its transaction ended.
 */
async function observeLockStep(database: AcademyAdmissionTestDatabase, leader: Leader, context: AuthorizedAdmissionContext, scope: GuardScope, blockedRow: AdmissionLeaderGuardLockedRow, order: readonly AdmissionLeaderGuardLockedRow[]) {
  let announceHolder!: (pid: number) => void, releaseHolder!: () => void, announceGuard!: (outcome: string) => void, releaseGuard!: () => void;
  const holderLocked = new Promise<number>((resolve) => { announceHolder = resolve; });
  const holderReleased = new Promise<void>((resolve) => { releaseHolder = resolve; });
  const guardFinished = new Promise<string>((resolve) => { announceGuard = resolve; });
  const guardReleased = new Promise<void>((resolve) => { releaseGuard = resolve; });
  const holder = database.withContext(leader.fixture.own, async (transaction) => {
    await transaction.execute(lockStatements(leader)[blockedRow](false));
    announceHolder((await transaction.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`)).rows[0].pid);
    await holderReleased;
  });
  const holderPid = await holderLocked;
  const guard = database.withContext(leader.fixture.own, async (transaction) => {
    announceGuard(await readOutcome(() => authorizeAdmissionLeader(transaction, context, scope)));
    await guardReleased;
  });
  try {
    await waitForBlockedGuard(database, leader, holderPid);
    const whileBlocked = await probeHeldRows(database, leader, order.filter((row) => row !== blockedRow));
    releaseHolder();
    await holder;
    const outcome = await guardFinished;
    const afterGuard = await probeHeldRows(database, leader, VALIDATION.exclusiveLockOrder);
    return { whileBlocked, outcome, afterGuard };
  } finally {
    releaseHolder();
    releaseGuard();
    await Promise.allSettled([holder, guard]);
  }
}

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native admission leader guard parity", () => {
  it("should keep the guard's outcomes and lock order for reads and sensitive operations", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const leader = await prepareAdmissionLeader(database, { sessionLifetimeMs: VALIDATION.sessionLifetimeMs });
      const base = { userId: leader.fixture.userId, sessionId: leader.sessionId, tribeId: leader.tribeId, requestId: randomUUID(), role: "leader" as const, membershipStatus: "active" as const, resourceId: leader.tribeId };
      const read: AuthorizedAdmissionContext = { ...base, action: ADMISSION_ACTION.readPolicy };
      const configure: AuthorizedAdmissionContext = { ...base, action: ADMISSION_ACTION.configurePolicy, sensitiveOperation: REAUTHENTICATION_OPERATION.updateAdmissionPolicy };
      const readScope: GuardScope = { action: ADMISSION_ACTION.readPolicy, resourceId: leader.tribeId };
      const configureScope: GuardScope = { action: ADMISSION_ACTION.configurePolicy, resourceId: leader.tribeId, operation: REAUTHENTICATION_OPERATION.updateAdmissionPolicy };
      const otherUserId = randomUUID();
      await database.withContext(leader.fixture.own, (transaction) => transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${otherUserId},'Synthetic other account',${`${otherUserId}@example.test`},false,clock_timestamp(),clock_timestamp())`));

      /** Each scenario changes rows only inside its own transaction, which is rolled back after the guard ran. */
      const scenarios: Record<string, { prepare?: (transaction: RequestDatabase) => Promise<unknown>; override?: Partial<AuthorizedAdmissionContext> }> = {
        current_leader: {},
        another_actor: { override: { userId: otherUserId } },
        missing_tribe: { override: { tribeId: randomUUID(), resourceId: randomUUID() } },
        foreign_session: { override: { sessionId: randomUUID() } },
        expired_session: { prepare: (transaction) => transaction.execute(sql`update public.session set "expiresAt"=clock_timestamp()-interval '1 minute' where id=${leader.sessionId}`) },
        demoted_leader: { prepare: (transaction) => transaction.execute(sql`update public.tribe_members set role='guardian' where tribe_id=${leader.tribeId} and user_id=${leader.fixture.userId}`) },
        blocked_leader: { prepare: (transaction) => transaction.execute(sql`update public.tribe_members set status='blocked' where tribe_id=${leader.tribeId} and user_id=${leader.fixture.userId}`) },
        invalidated_binding: { prepare: (transaction) => transaction.execute(sql`update public.global_session_identity_bindings set invalidated_at=clock_timestamp() where session_id=${leader.sessionId}`) },
        without_google_account: { prepare: async (transaction) => { await transaction.execute(sql`delete from public.global_session_identity_bindings where session_id=${leader.sessionId}`); await transaction.execute(sql`delete from public.account where id=${leader.accountId}`); } },
      };
      const outcomes: Record<string, Record<string, string>> = {};
      for (const [name, scenario] of Object.entries(scenarios)) {
        outcomes[name] = {};
        for (const [kind, context, scope] of [["read", read, readScope], ["sensitive", configure, configureScope]] as const) {
          let outcome = "";
          await database.withContext(leader.fixture.own, async (transaction) => {
            await scenario.prepare?.(transaction);
            outcome = await readOutcome(() => authorizeAdmissionLeader(transaction, { ...context, ...scenario.override }, { ...scope, ...(scenario.override?.resourceId ? { resourceId: scenario.override.resourceId } : {}) }));
            throw new ScenarioRollback();
          }).catch((error: unknown) => { if (!(error instanceof ScenarioRollback)) throw error; });
          outcomes[name][kind] = outcome;
        }
      }
      // A scope that differs from the resolved context is denied before any row is read.
      outcomes.mismatched_scope = { read: await database.withContext(leader.fixture.own, (transaction) => readOutcome(() => authorizeAdmissionLeader(transaction, read, configureScope))) };
      const both = (outcome: AdmissionLeaderGuardOutcome) => ({ read: outcome, sensitive: outcome });
      expect(outcomes).toEqual({
        current_leader: both("authorized"),
        another_actor: both("permission_denied"),
        missing_tribe: both("resource_unavailable"),
        foreign_session: both("authentication_required"),
        expired_session: both("authentication_required"),
        demoted_leader: both("permission_denied"),
        blocked_leader: both("permission_denied"),
        invalidated_binding: both("authorized"),
        without_google_account: both("authorized"),
        mismatched_scope: { read: "permission_denied" },
      });

      // Lock order: while the guard waits on one row it already holds every earlier row and none of the later ones.
      const lockScenarios: { order: readonly AdmissionLeaderGuardLockedRow[]; context: AuthorizedAdmissionContext; scope: GuardScope }[] = [
        { order: VALIDATION.sharedLockOrder, context: read, scope: readScope },
        { order: VALIDATION.exclusiveLockOrder, context: configure, scope: configureScope },
      ];
      for (const { order, context, scope } of lockScenarios) {
        for (const [index, blockedRow] of order.entries()) {
          const step = await observeLockStep(database, leader, context, scope, blockedRow, order);
          expect({ blockedRow, ...step }).toEqual({
            blockedRow,
            whileBlocked: Object.fromEntries(order.filter((row) => row !== blockedRow).map((row) => [row, order.indexOf(row) < index])),
            outcome: "authorized",
            afterGuard: Object.fromEntries(VALIDATION.exclusiveLockOrder.map((row) => [row, order.includes(row)])),
          });
        }
      }
    });
  }, VALIDATION.timeoutMs);
});
