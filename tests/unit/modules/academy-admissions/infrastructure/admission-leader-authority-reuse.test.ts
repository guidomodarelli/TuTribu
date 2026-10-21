/** @vitest-environment node */
/** Verifies on real PostgreSQL that reused leader authority keeps every check its row locks cannot freeze. @module admission-leader-authority-reuse-tests */
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionLeader } from "@/tests/support/admission-leader-fixture";
import { authorizeAdmissionLeader, withReusedAdmissionLeaderAuthority } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-leader-authorizer";
import type { AuthorizedAdmissionContext } from "@/src/modules/academy-admissions/domain/repositories/admission-authorization-reader";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import { ADMISSION_ACTION } from "@/src/modules/academy-admissions/constants/admission-eligibility";
import { ADMISSION_LEADER_AUTHORITY_REUSE_VALIDATION as VALIDATION } from "@/tests/support/constants/admission-leader-authority-reuse";

/** @param database - Real transaction. @returns The same transaction, counting the statements the guard sends through it. */
function countStatements(database: RequestDatabase): { database: RequestDatabase; count: () => number } {
  let statements = 0;
  const counted = new Proxy(database, { get(target, property, receiver) {
    const value: unknown = Reflect.get(target, property, receiver);
    if (property !== "execute" || typeof value !== "function") return value;
    return (...args: unknown[]) => { statements += 1; return Reflect.apply(value, target, args); };
  } });
  return { database: counted, count: () => statements };
}

/** @param error - Driver failure, possibly wrapped by Drizzle. @returns The first PostgreSQL SQLSTATE in its cause chain. */
function readPostgresCode(error: unknown): string | null {
  for (let current: unknown = error, depth = 0; current instanceof Error && depth < 5; current = current.cause, depth += 1) {
    const code: unknown = Reflect.get(current, "code");
    if (typeof code === "string") return code;
  }
  return null;
}

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native reused admission leader authority", () => {
  it("should reuse held locks in one statement while still denying a second leader, an expired session and a missing exclusive lock", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const leader = await prepareAdmissionLeader(database, { sessionLifetimeMs: VALIDATION.sessionLifetimeMs });
      const base = { userId: leader.fixture.userId, sessionId: leader.sessionId, tribeId: leader.tribeId, requestId: randomUUID(), role: "leader" as const, membershipStatus: "active" as const, resourceId: leader.tribeId };
      const read: AuthorizedAdmissionContext = { ...base, action: ADMISSION_ACTION.readPolicy };
      const configure: AuthorizedAdmissionContext = { ...base, action: ADMISSION_ACTION.configurePolicy, sensitiveOperation: REAUTHENTICATION_OPERATION.updateAdmissionPolicy };
      const readScope = { action: ADMISSION_ACTION.readPolicy, resourceId: leader.tribeId };
      const configureScope = { action: ADMISSION_ACTION.configurePolicy, resourceId: leader.tribeId, operation: REAUTHENTICATION_OPERATION.updateAdmissionPolicy };

      // Outside a scope every check stays complete.
      const unscoped = await database.withContext(leader.fixture.own, async (transaction) => {
        const observed = countStatements(transaction);
        await authorizeAdmissionLeader(observed.database, read, readScope);
        const first = observed.count();
        await authorizeAdmissionLeader(observed.database, read, readScope);
        return { first, second: observed.count() - first };
      });
      expect(unscoped.second).toBe(unscoped.first);

      // Inside a scope a repeated check is one statement; an exclusive one after shared checks takes the full path once.
      const scoped = await database.withContext(leader.fixture.own, (transaction) => { const observed = countStatements(transaction); return withReusedAdmissionLeaderAuthority(observed.database, async () => {
        await authorizeAdmissionLeader(observed.database, read, readScope);
        const full = observed.count();
        await authorizeAdmissionLeader(observed.database, read, readScope);
        const reused = observed.count() - full;
        await authorizeAdmissionLeader(observed.database, configure, configureScope);
        const upgraded = observed.count() - full - reused;
        await authorizeAdmissionLeader(observed.database, configure, configureScope);
        const reusedExclusive = observed.count() - full - reused - upgraded;
        await expect(authorizeAdmissionLeader(observed.database, read, configureScope)).rejects.toMatchObject({ code: "permission_denied" });
        return { full, reused, upgraded, reusedExclusive };
      }); });
      // The full path is one call to the consolidated SQL guard, the reused one is one statement too.
      expect(unscoped).toEqual({ first: 1, second: 1 });
      expect(scoped).toEqual({ full: 1, reused: 1, upgraded: 1, reusedExclusive: 1 });

      // The upgrade to an exclusive check really takes the tribe FOR UPDATE: a concurrent share lock waits for it.
      const probeTribeShare = () => database.withContext(leader.fixture.own, async (other) => { await other.execute(sql`select id from public.tribes where id=${leader.tribeId} for share nowait`); }).then(() => null, (error: unknown) => readPostgresCode(error));
      await database.withContext(leader.fixture.own, (transaction) => withReusedAdmissionLeaderAuthority(transaction, async () => {
        await authorizeAdmissionLeader(transaction, read, readScope);
        expect(await probeTribeShare()).toBeNull();
        await authorizeAdmissionLeader(transaction, configure, configureScope);
        expect(await probeTribeShare()).toBe(VALIDATION.lockNotAvailableCode);
      }));

      // While the authority is held, another transaction cannot change leadership: the tribe lock blocks its leadership trigger.
      const secondLeaderId = randomUUID();
      await database.withContext(leader.fixture.own, (transaction) => transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${secondLeaderId},'Synthetic second leader',${`${secondLeaderId}@example.test`},false,clock_timestamp(),clock_timestamp())`));
      const addSecondLeader = (transaction: RequestDatabase) => transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status) values (${leader.tribeId},${secondLeaderId},'leader','active')`);
      await database.withContext(leader.fixture.own, (transaction) => withReusedAdmissionLeaderAuthority(transaction, async () => {
        await authorizeAdmissionLeader(transaction, read, readScope);
        const blocked = await database.withContext(leader.fixture.own, async (other) => { await other.execute(sql`set local lock_timeout=${sql.raw(`'${VALIDATION.concurrentLockTimeoutMs}ms'`)}`); await addSecondLeader(other); }).then(() => null, (error: unknown) => error);
        expect(readPostgresCode(blocked)).toBe(VALIDATION.lockNotAvailableCode);
        await authorizeAdmissionLeader(transaction, read, readScope);
      }));
      // A demotion made earlier in the same transaction is still detected by the reused check.
      await expect(database.withContext(leader.fixture.own, (transaction) => withReusedAdmissionLeaderAuthority(transaction, async () => {
        await authorizeAdmissionLeader(transaction, read, readScope);
        await transaction.execute(sql`update public.tribe_members set role='guardian' where tribe_id=${leader.tribeId} and user_id=${leader.fixture.userId}`);
        await authorizeAdmissionLeader(transaction, read, readScope);
      }))).rejects.toMatchObject({ code: "permission_denied" });

      // The held session expiry is compared with the database clock on every reuse.
      await database.withContext(leader.fixture.own, (transaction) => transaction.execute(sql`update public.session set "expiresAt"=clock_timestamp()+${`${VALIDATION.shortSessionMs} milliseconds`}::interval where id=${leader.sessionId}`));
      await expect(database.withContext(leader.fixture.own, (transaction) => withReusedAdmissionLeaderAuthority(transaction, async () => {
        await authorizeAdmissionLeader(transaction, read, readScope);
        await delay(VALIDATION.shortSessionMs + VALIDATION.expiryMarginMs);
        await authorizeAdmissionLeader(transaction, read, readScope);
      }))).rejects.toMatchObject({ code: "authentication_required" });
    });
  }, VALIDATION.timeoutMs);
});
