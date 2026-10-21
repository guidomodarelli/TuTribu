/** @vitest-environment node */
/** Verifies on real PostgreSQL that reused human and worker messaging authority keeps every check its row locks cannot freeze and never skips a grouped resource guard. @module messaging-secret-authority-reuse-tests */
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareVerificationDeliveryPipeline } from "@/tests/support/verification-delivery-pipeline-fixture";
import { prepareAdmissionNotificationGroupAuthority } from "@/tests/support/admission-notification-group-authority-fixture";
import { prepareMessagingHumanSecretAuthority } from "@/tests/support/messaging-human-secret-authority-fixture";
import { authorizeMessagingSecret, withReusedMessagingSecretAuthority } from "@/src/modules/messaging/infrastructure/repositories/postgres-messaging-secret-authorizer";
import { PostgresCurrentMessagingProvider } from "@/src/modules/messaging/infrastructure/repositories/postgres-current-messaging-provider";
import { MESSAGING_INITIAL_PROVIDER_ID } from "@/src/modules/messaging/constants/messaging-public-contract";
import { MESSAGING_DISPATCH_DEFAULT } from "@/src/modules/messaging/constants/messaging-dispatch";
import { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";
import { MESSAGE_AUTHORIZATION_OUTCOME } from "@/src/modules/messaging/constants/message-delivery";
import { TRIBE_MEMBERSHIP_STATUS } from "@/src/modules/tribes/constants/tribe-page-access";
import type { AuthorizedDeliveryMessagingContext } from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import type { MessageDeliveryAuthorization } from "@/src/modules/messaging/domain/repositories/message-delivery-repository";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import { MESSAGING_HUMAN_SECRET_AUTHORITY_FIXTURE as HUMAN, MESSAGING_SECRET_AUTHORITY_REUSE_VALIDATION as VALIDATION } from "@/tests/support/constants/messaging-secret-authority-reuse";

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

/** @param authorization - Marker outcome of a real claim. @returns Its committed worker context. */
function authorizedContext(authorization: MessageDeliveryAuthorization): AuthorizedDeliveryMessagingContext {
  if (authorization.outcome !== MESSAGE_AUTHORIZATION_OUTCOME.authorized) throw new Error("Reused worker authority fixture attempt marker unavailable");
  return authorization.context;
}

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native reused messaging worker authority", () => {
  it("should reuse held locks in one statement and keep actor, leadership and lease checks", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareVerificationDeliveryPipeline(database);
      const [claim] = await fixture.repository.claim({ leaseToken: randomUUID(), limit: 1, leaseSeconds: MESSAGING_DISPATCH_DEFAULT.leaseSeconds });
      const context = authorizedContext(await fixture.repository.authorize(claim, randomUUID()));
      const actor = { userId: context.contributingLeaderUserId, email: null };
      /** @param run - Work in one worker transaction. @returns Its committed result. */
      const asWorker = <Result>(run: (transaction: RequestDatabase) => Promise<Result>) => database.withContext(actor, run);
      /** @param update - Concurrent write on a row the check must hold. @returns The SQLSTATE that stopped it, or null when it was not blocked. */
      const probeWrite = (update: ReturnType<typeof sql>) => asWorker(async (other) => { await other.execute(sql`set local lock_timeout=${sql.raw(`'${VALIDATION.concurrentLockTimeoutMs}ms'`)}`); await other.execute(update); }).then(() => null, (error: unknown) => readPostgresCode(error));

      // Outside a scope every check stays complete.
      const unscoped = await asWorker(async (transaction) => {
        const observed = countStatements(transaction);
        await authorizeMessagingSecret(observed.database, context);
        const first = observed.count();
        await authorizeMessagingSecret(observed.database, context);
        return { first, second: observed.count() - first };
      });
      expect(unscoped).toEqual({ first: VALIDATION.fullWorkerCheckStatements, second: VALIDATION.fullWorkerCheckStatements });

      // Inside a scope a repeated check of the same attempt is one statement and returns the same facts.
      const scoped = await asWorker((transaction) => { const observed = countStatements(transaction); return withReusedMessagingSecretAuthority(observed.database, async () => {
        const fullFacts = await authorizeMessagingSecret(observed.database, context);
        const full = observed.count();
        const reusedFacts = await authorizeMessagingSecret(observed.database, context);
        return { full, reused: observed.count() - full, same: reusedFacts === fullFacts };
      }); });
      expect(scoped).toEqual({ full: VALIDATION.fullWorkerCheckStatements, reused: 1, same: true });

      // Another attempt identity and a write-locked check never reuse.
      const unmatched = await asWorker((transaction) => { const observed = countStatements(transaction); return withReusedMessagingSecretAuthority(observed.database, async () => {
        await authorizeMessagingSecret(observed.database, context);
        const full = observed.count();
        await expect(authorizeMessagingSecret(observed.database, { ...context, attemptVersion: context.attemptVersion + 1 })).rejects.toMatchObject({ code: MESSAGING_ERROR_CODE.resourceUnavailable });
        const crossed = observed.count() - full;
        const beforeWrite = observed.count();
        await authorizeMessagingSecret(observed.database, context, true);
        return { crossed, writeLocked: observed.count() - beforeWrite };
      }); });
      expect(unmatched.crossed).toBeGreaterThan(1);
      expect(unmatched.writeLocked).toBe(VALIDATION.fullWorkerCheckStatements);

      // While the authority is held, another transaction cannot change the delivery, the attempt, the connection or the leader membership.
      await asWorker((transaction) => withReusedMessagingSecretAuthority(transaction, async () => {
        await authorizeMessagingSecret(transaction, context);
        expect(await probeWrite(sql`update public.message_deliveries set lease_until=lease_until where id=${context.deliveryId}`)).toBe(VALIDATION.lockNotAvailableCode);
        expect(await probeWrite(sql`update public.message_delivery_attempts set version=version where id=${context.attemptId}`)).toBe(VALIDATION.lockNotAvailableCode);
        expect(await probeWrite(sql`update public.tenant_messaging_connections set state=state where id=${context.connectionId}`)).toBe(VALIDATION.lockNotAvailableCode);
        expect(await probeWrite(sql`update public.tribe_members set status=status where tribe_id=${context.tribeId} and user_id=${context.contributingLeaderUserId}`)).toBe(VALIDATION.lockNotAvailableCode);
        await authorizeMessagingSecret(transaction, context);
      }));

      // A different transaction actor is still denied by the reused check.
      await expect(asWorker((transaction) => withReusedMessagingSecretAuthority(transaction, async () => {
        await authorizeMessagingSecret(transaction, context);
        await transaction.execute(sql`select set_config('app.current_user_id',${randomUUID()},true)`);
        await authorizeMessagingSecret(transaction, context);
      }))).rejects.toMatchObject({ code: MESSAGING_ERROR_CODE.permissionDenied });

      // Leadership lost earlier in the same transaction is still detected, because the reused check re-reads the active leaders.
      await expect(asWorker((transaction) => withReusedMessagingSecretAuthority(transaction, async () => {
        await authorizeMessagingSecret(transaction, context);
        await transaction.execute(sql`update public.tribe_members set status=${TRIBE_MEMBERSHIP_STATUS.blocked} where tribe_id=${context.tribeId} and user_id=${context.contributingLeaderUserId}`);
        await authorizeMessagingSecret(transaction, context);
      }))).rejects.toMatchObject({ code: MESSAGING_ERROR_CODE.permissionDenied });

      // The lease is compared with the database clock on every reuse.
      await asWorker((transaction) => transaction.execute(sql`update public.message_deliveries set lease_until=clock_timestamp()+${`${VALIDATION.shortLeaseMs} milliseconds`}::interval where id=${context.deliveryId}`));
      await expect(asWorker((transaction) => withReusedMessagingSecretAuthority(transaction, async () => {
        await authorizeMessagingSecret(transaction, context);
        await delay(VALIDATION.shortLeaseMs + VALIDATION.expiryMarginMs);
        await authorizeMessagingSecret(transaction, context);
      }))).rejects.toMatchObject({ code: MESSAGING_ERROR_CODE.resourceUnavailable });
    });
  }, VALIDATION.timeoutMs);

  it("should run the injected group guard on every check of a grouped notification attempt", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionNotificationGroupAuthority(database);
      await fixture.queueIndividual(1);
      const context = authorizedContext(await fixture.deliveryRepository.authorize(await fixture.claim(), randomUUID()));
      let guardRuns = 0;
      const counts = await database.withContext({ userId: context.contributingLeaderUserId, email: null }, (transaction) => { const observed = countStatements(transaction); return withReusedMessagingSecretAuthority(observed.database, async () => {
        /** @param native - Current transaction. @param marked - Exact grouped attempt. @returns Nothing once the real group guard passes. */
        const guard = async (native: RequestDatabase, marked: AuthorizedDeliveryMessagingContext) => { guardRuns += 1; await fixture.guards.marked(native, marked); };
        await authorizeMessagingSecret(observed.database, context, false, guard);
        const first = observed.count();
        await authorizeMessagingSecret(observed.database, context, false, guard);
        return { first, second: observed.count() - first };
      }); });
      expect(guardRuns).toBe(2);
      expect(counts.second).toBe(counts.first);
    });
  }, VALIDATION.timeoutMs);

  it("should reuse a human check in one statement and keep actor, session, identity binding and leadership checks", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const { context, actor, securityFacts } = await prepareMessagingHumanSecretAuthority(database);
      /** @param run - Work in one leader transaction. @returns Its committed result. */
      const asLeader = <Result>(run: (transaction: RequestDatabase) => Promise<Result>) => database.withContext(actor, run);
      /** @param update - Concurrent write on a row the check must hold. @returns The SQLSTATE that stopped it, or null when it was not blocked. */
      const probeWrite = (update: ReturnType<typeof sql>) => asLeader(async (other) => { await other.execute(sql`set local lock_timeout=${sql.raw(`'${VALIDATION.concurrentLockTimeoutMs}ms'`)}`); await other.execute(update); }).then(() => null, (error: unknown) => readPostgresCode(error));

      // Outside a scope every check stays complete.
      const unscoped = await asLeader(async (transaction) => {
        const observed = countStatements(transaction);
        await authorizeMessagingSecret(observed.database, context);
        const first = observed.count();
        await authorizeMessagingSecret(observed.database, context);
        return { first, second: observed.count() - first };
      });
      expect(unscoped).toEqual({ first: HUMAN.fullHumanCheckStatements, second: HUMAN.fullHumanCheckStatements });

      // Inside a scope the repeated check of the same session and resource is one statement and returns the same facts.
      const scoped = await asLeader((transaction) => { const observed = countStatements(transaction); return withReusedMessagingSecretAuthority(observed.database, async () => {
        const fullFacts = await authorizeMessagingSecret(observed.database, context);
        const full = observed.count();
        const reusedFacts = await authorizeMessagingSecret(observed.database, context);
        return { full, reused: observed.count() - full, same: reusedFacts === fullFacts };
      }); });
      expect(scoped).toEqual({ full: HUMAN.fullHumanCheckStatements, reused: 1, same: true });

      // The provider read of the wizard inspectors reuses its second check.
      const provider = await asLeader((transaction) => { const observed = countStatements(transaction); const reader = new PostgresCurrentMessagingProvider((_scope, run) => run(observed.database), async () => securityFacts); return reader.read(context).then((providerId) => ({ providerId, statements: observed.count() })); });
      expect(provider).toEqual({ providerId: MESSAGING_INITIAL_PROVIDER_ID, statements: HUMAN.providerReadWithReuseStatements });

      // Another session and a write-locked check never reuse.
      const unmatched = await asLeader((transaction) => { const observed = countStatements(transaction); return withReusedMessagingSecretAuthority(observed.database, async () => {
        await authorizeMessagingSecret(observed.database, context);
        const full = observed.count();
        await expect(authorizeMessagingSecret(observed.database, { ...context, sessionId: randomUUID() })).rejects.toMatchObject({ code: MESSAGING_ERROR_CODE.authenticationRequired });
        const crossed = observed.count() - full;
        const beforeWrite = observed.count();
        await authorizeMessagingSecret(observed.database, context, true);
        return { crossed, writeLocked: observed.count() - beforeWrite };
      }); });
      expect(unmatched.crossed).toBeGreaterThan(1);
      expect(unmatched.writeLocked).toBe(HUMAN.fullHumanCheckStatements);

      // While the authority is held, another transaction cannot change the session, its binding, the connection or the leader membership.
      await asLeader((transaction) => withReusedMessagingSecretAuthority(transaction, async () => {
        await authorizeMessagingSecret(transaction, context);
        expect(await probeWrite(sql`update public.session set "expiresAt"="expiresAt" where id=${context.sessionId}`)).toBe(VALIDATION.lockNotAvailableCode);
        expect(await probeWrite(sql`update public.global_session_identity_bindings set invalidated_at=clock_timestamp() where session_id=${context.sessionId}`)).toBe(VALIDATION.lockNotAvailableCode);
        expect(await probeWrite(sql`update public.tenant_messaging_connections set state=state where id=${context.connectionId}`)).toBe(VALIDATION.lockNotAvailableCode);
        expect(await probeWrite(sql`update public.tribe_members set status=status where tribe_id=${context.tribeId} and user_id=${context.actorUserId}`)).toBe(VALIDATION.lockNotAvailableCode);
        await authorizeMessagingSecret(transaction, context);
      }));

      // A different transaction actor is still denied by the reused check.
      await expect(asLeader((transaction) => withReusedMessagingSecretAuthority(transaction, async () => {
        await authorizeMessagingSecret(transaction, context);
        await transaction.execute(sql`select set_config('app.current_user_id',${randomUUID()},true)`);
        await authorizeMessagingSecret(transaction, context);
      }))).rejects.toMatchObject({ code: MESSAGING_ERROR_CODE.permissionDenied });

      // Leadership lost earlier in the same transaction is still detected.
      await expect(asLeader((transaction) => withReusedMessagingSecretAuthority(transaction, async () => {
        await authorizeMessagingSecret(transaction, context);
        await transaction.execute(sql`update public.tribe_members set status=${TRIBE_MEMBERSHIP_STATUS.blocked} where tribe_id=${context.tribeId} and user_id=${context.actorUserId}`);
        await authorizeMessagingSecret(transaction, context);
      }))).rejects.toMatchObject({ code: MESSAGING_ERROR_CODE.permissionDenied });

      // An identity binding invalidated earlier in the same transaction ends the reused authority.
      await expect(asLeader((transaction) => withReusedMessagingSecretAuthority(transaction, async () => {
        await authorizeMessagingSecret(transaction, context);
        await transaction.execute(sql`update public.global_session_identity_bindings set invalidated_at=clock_timestamp() where session_id=${context.sessionId}`);
        await authorizeMessagingSecret(transaction, context);
      }))).rejects.toMatchObject({ code: MESSAGING_ERROR_CODE.authenticationRequired });

      // The session expiry is compared with the database clock on every reuse.
      await asLeader((transaction) => transaction.execute(sql`update public.session set "expiresAt"=clock_timestamp()+${`${HUMAN.shortSessionMs} milliseconds`}::interval where id=${context.sessionId}`));
      await expect(asLeader((transaction) => withReusedMessagingSecretAuthority(transaction, async () => {
        await authorizeMessagingSecret(transaction, context);
        await delay(HUMAN.shortSessionMs + VALIDATION.expiryMarginMs);
        await authorizeMessagingSecret(transaction, context);
      }))).rejects.toMatchObject({ code: MESSAGING_ERROR_CODE.authenticationRequired });
    });
  }, VALIDATION.timeoutMs);
});
