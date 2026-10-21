/** @vitest-environment node */
/** Pins on real PostgreSQL the outcomes and the lock order of the full admission leader guard, so its implementation can change without changing either. @module admission-leader-guard-parity-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionLeader } from "@/tests/support/admission-leader-fixture";
import { expectedLockStep, observeGuardLockStep, readGuardOutcome, readRolledBackGuardOutcome } from "@/tests/support/guard-lock-order";
import type { GuardLockedRow } from "@/tests/support/constants/guard-lock-order";
import { authorizeAdmissionLeader } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-leader-authorizer";
import type { AuthorizedAdmissionContext } from "@/src/modules/academy-admissions/domain/repositories/admission-authorization-reader";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import { ADMISSION_ACTION } from "@/src/modules/academy-admissions/constants/admission-eligibility";
import { ADMISSION_LEADER_GUARD_PARITY_VALIDATION as VALIDATION, type AdmissionLeaderGuardOutcome } from "@/tests/support/constants/admission-leader-guard-parity";

type GuardScope = Parameters<typeof authorizeAdmissionLeader>[2];

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
          outcomes[name][kind] = await readRolledBackGuardOutcome(database, leader, scenario.prepare, (transaction) => authorizeAdmissionLeader(transaction, { ...context, ...scenario.override }, { ...scope, ...(scenario.override?.resourceId ? { resourceId: scenario.override.resourceId } : {}) }));
        }
      }
      // A scope that differs from the resolved context is denied before any row is read.
      outcomes.mismatched_scope = { read: await database.withContext(leader.fixture.own, (transaction) => readGuardOutcome(() => authorizeAdmissionLeader(transaction, read, configureScope))) };
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
      const lockScenarios: { order: readonly GuardLockedRow[]; context: AuthorizedAdmissionContext; scope: GuardScope; exclusive: boolean }[] = [
        { order: VALIDATION.sharedLockOrder, context: read, scope: readScope, exclusive: false },
        { order: VALIDATION.exclusiveLockOrder, context: configure, scope: configureScope, exclusive: true },
      ];
      for (const { order, context, scope, exclusive } of lockScenarios) {
        for (const blockedRow of order) {
          const step = await observeGuardLockStep(database, leader, (transaction) => authorizeAdmissionLeader(transaction, context, scope), blockedRow, order);
          expect({ blockedRow, ...step }).toEqual({ blockedRow, ...expectedLockStep(order, blockedRow), outcome: "authorized", tribeExclusive: exclusive });
        }
      }
    });
  }, VALIDATION.timeoutMs);
});
