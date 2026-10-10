/** @vitest-environment node */
/** Exercises original-message preparation with actual SQL, account projection, secret guards, crypto and SDK transport. @module postgres-message-status-preparation-tests */
import { randomBytes, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareVerificationDeliveryPipeline } from "@/tests/support/verification-delivery-pipeline-fixture";
import { withAdmissionTransitionContention } from "@/tests/support/admission-transition-contention";
import { PostgresMessageStatusPreparation } from "@/src/modules/messaging/infrastructure/repositories/postgres-message-status-preparation";
import { PostgresAuthenticatedAccountProvider } from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import { PostgresMessagingAuthorizationReader } from "@/src/modules/messaging/infrastructure/repositories/postgres-messaging-authorization-reader";
import { ResolveMessagingContextUseCase } from "@/src/modules/messaging/application/use-cases/resolve-messaging-context-use-case";
import { PostgresEncryptedSecretStore } from "@/src/modules/messaging/infrastructure/repositories/postgres-encrypted-secret-store";
import { ZavuMessageDeliverySender } from "@/src/modules/messaging/infrastructure/zavu/zavu-message-delivery-sender";
import { ZavuMessageStatusLookup } from "@/src/modules/messaging/infrastructure/zavu/zavu-message-status-lookup";
import { MESSAGE_DELIVERY_REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/message-delivery-reauthentication";
import { RECENT_AUTHENTICATION_WINDOW_MS } from "@/src/modules/auth/constants/recent-authentication";
import { GOOGLE_IDENTITY_PROVIDER } from "@/src/modules/auth/constants/google-identity-evidence";
import { MESSAGING_DISPATCH_DEFAULT } from "@/src/modules/messaging/constants/messaging-dispatch";
import { MESSAGING_AUTHORIZATION_PURPOSE } from "@/src/modules/messaging/constants/messaging-connection";
import { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";
import { MESSAGE_ATTEMPT_STATE, MESSAGE_AUTHORIZATION_OUTCOME } from "@/src/modules/messaging/constants/message-delivery";
import { ZAVU_DELIVERY_CHANNEL, ZAVU_DELIVERY_STATUS, ZAVU_MESSAGE_DIRECTION } from "@/src/modules/messaging/constants/zavu-delivery";
import type { MessagingAuthorizationReader, MessagingSecretStore } from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native original message status preparation", () => {
  it("should read only an owned stored message while preserving attempt, usage and rejecting crossed or revoked authority", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareVerificationDeliveryPipeline(database), providerMessageId = randomUUID();
      await database.applyMigration("20261005095000_guard_global_identity_context.sql");
      const claims = await fixture.repository.claim({ leaseToken: randomUUID(), limit: 1, leaseSeconds: MESSAGING_DISPATCH_DEFAULT.leaseSeconds });
      const authorization = await fixture.repository.authorize(claims[0], randomUUID());
      if (authorization.outcome !== MESSAGE_AUTHORIZATION_OUTCOME.authorized) throw new Error("Owned status fixture attempt marker unavailable");
      const send = new ZavuMessageDeliverySender(fixture.preparation, async () => Response.json({ message: { id: providerMessageId, direction: ZAVU_MESSAGE_DIRECTION.outbound, channel: ZAVU_DELIVERY_CHANNEL.email, status: ZAVU_DELIVERY_STATUS.queued } }));
      const receipt = await send.send(authorization.context, new AbortController().signal);
      expect(receipt.outcome).toBe(MESSAGE_ATTEMPT_STATE.accepted);
      await fixture.repository.complete({ context: authorization.context, ...receipt });
      const sessionId = randomUUID(), accountId = randomUUID(), subject = randomUUID(), intentId = randomUUID();
      await database.withContext(fixture.own, async (transaction) => {
        const now = new Date((await transaction.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now), validUntil = new Date(now.getTime() + RECENT_AUTHENTICATION_WINDOW_MS);
        await transaction.execute(sql`insert into public.account(id,"userId","providerId","accountId","createdAt","updatedAt") values (${accountId},${fixture.userId},${GOOGLE_IDENTITY_PROVIDER},${subject},${now},${now})`);
        await transaction.execute(sql`insert into public.session(id,token,"userId","expiresAt","createdAt","updatedAt") values (${sessionId},${randomUUID()},${fixture.userId},clock_timestamp()+interval '1 hour',${now},${now})`);
        await transaction.execute(sql`insert into public.global_session_identity_bindings(session_id,user_id,account_id,provider_subject,normalized_email) values (${sessionId},${fixture.userId},${accountId},${subject},${fixture.own.email})`);
        await transaction.execute(sql`insert into public.global_reauthentication_intents(id,user_id,original_session_id,account_id,provider_subject,tribe_id,operation,resource_id,return_path,nonce_hash,state,created_at,expires_at,consumed_at) values (${intentId},${fixture.userId},${sessionId},${accountId},${subject},${fixture.scope.tribeId},${MESSAGE_DELIVERY_REAUTHENTICATION_OPERATION.reconcile},${fixture.scope.connectionId},'/synthetic-status',${randomBytes(32)},'consumed',${now},${validUntil},${now})`);
        await transaction.execute(sql`insert into public.recent_authentication_evidence(intent_id,user_id,account_id,provider_subject,session_id,tribe_id,operation,resource_id,authenticated_at,verified_at,valid_until) values (${intentId},${fixture.userId},${accountId},${subject},${sessionId},${fixture.scope.tribeId},${MESSAGE_DELIVERY_REAUTHENTICATION_OPERATION.reconcile},${fixture.scope.connectionId},${now},${now},${validUntil})`);
      });
      let statusTransactions = 0;
      /** @param actor - Current native actor. @param run - Guarded SQL-only callback. @returns A committed result while observing the real preparation transaction lifetime. */
      const execute = async <Result>(actor: string, run: (transaction: RequestDatabase) => Promise<Result>) => {
        statusTransactions += 1;
        try { return await database.withContext({ userId: actor, email: null }, run); }
        finally { statusTransactions -= 1; }
      };
      const accounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId: fixture.userId, sessionId }), (identity, run) => execute(identity.userId, run));
      const reader: MessagingAuthorizationReader = {
        getCurrentLeadership: (tribeId, userId) => execute(userId, (transaction) => new PostgresMessagingAuthorizationReader(transaction, sessionId).getCurrentLeadership(tribeId, userId)),
        getConnection: (tribeId, connectionId) => execute(fixture.userId, (transaction) => new PostgresMessagingAuthorizationReader(transaction, sessionId).getConnection(tribeId, connectionId)),
      };
      const security = { getCurrentSecurityFacts: async () => ({ environment: fixture.config.environment, securityEpoch: fixture.config.securityEpoch, recoveryLocked: fixture.config.recoveryLocked }) };
      const resolver = new ResolveMessagingContextUseCase(accounts, reader, security, () => new Date());
      const secrets = new PostgresEncryptedSecretStore(execute, accounts, async () => fixture.config, MESSAGING_AUTHORIZATION_PURPOSE.sensitiveLeader);
      const preparation = new PostgresMessageStatusPreparation(resolver, execute, secrets, async () => fixture.config);
      let reads = 0;
      const lookup = new ZavuMessageStatusLookup(preparation, async (input, init) => {
        reads += 1; const request = new Request(input, init); expect(request.method).toBe("GET");
        expect(fixture.transactions).toBe(0);
        expect(statusTransactions).toBe(0);
        expect(new URL(request.url).pathname.endsWith(providerMessageId)).toBe(true);
        return Response.json({ message: { id: providerMessageId, direction: ZAVU_MESSAGE_DIRECTION.outbound, channel: ZAVU_DELIVERY_CHANNEL.email, status: ZAVU_DELIVERY_STATUS.delivered } });
      });
      const reference = { tribeId: fixture.scope.tribeId, connectionId: fixture.scope.connectionId, connectionVersion: fixture.scope.connectionVersion, deliveryId: fixture.original.deliveryId, attemptId: authorization.context.attemptId, providerMessageId, channel: ZAVU_DELIVERY_CHANNEL.email, requestId: randomUUID() };
      expect(await lookup.read(reference, new AbortController().signal)).toEqual({ outcome: MESSAGE_ATTEMPT_STATE.delivered, providerMessageId });
      await expect(lookup.read({ ...reference, providerMessageId: randomUUID() }, new AbortController().signal)).rejects.toMatchObject({ code: MESSAGING_ERROR_CODE.resourceUnavailable });
      expect(reads).toBe(1);
      const stored = await fixture.repository.readAttempt(authorization.context); expect(stored?.state).toBe(MESSAGE_ATTEMPT_STATE.accepted);
      let recoveryLocked = false, announceSecret!: () => void, releaseSecret!: () => void;
      const secretReady = new Promise<void>((resolve) => { announceSecret = resolve; });
      const secretReleased = new Promise<void>((resolve) => { releaseSecret = resolve; });
      const guardedSecrets: MessagingSecretStore = { loadAuthorizedSecret: async (context) => {
        const credential = await secrets.loadAuthorizedSecret(context);
        announceSecret(); await secretReleased; return credential;
      } };
      const changingSecurity = { getCurrentSecurityFacts: async () => ({ environment: fixture.config.environment, securityEpoch: fixture.config.securityEpoch, recoveryLocked }) };
      const changingResolver = new ResolveMessagingContextUseCase(accounts, reader, changingSecurity, () => new Date());
      const waitingPreparation = new PostgresMessageStatusPreparation(changingResolver, execute, guardedSecrets, async () => ({ ...fixture.config, recoveryLocked }));
      const waitingLookup = new ZavuMessageStatusLookup(waitingPreparation, async () => { reads += 1; return Response.json({ message: { id: providerMessageId, direction: ZAVU_MESSAGE_DIRECTION.outbound, channel: ZAVU_DELIVERY_CHANNEL.email, status: ZAVU_DELIVERY_STATUS.delivered } }); });
      const pendingRead = waitingLookup.read(reference, new AbortController().signal);
      const settledRead = pendingRead.then((value) => ({ status: "fulfilled" as const, value }), (reason: unknown) => ({ status: "rejected" as const, reason }));
      const earlyFailure = settledRead.then((result) => { if (result.status === "rejected") throw result.reason; return new Promise<never>(() => undefined); });
      void earlyFailure.catch(() => undefined);
      let raced: PromiseSettledResult<Awaited<ReturnType<typeof waitingLookup.read>>>;
      try {
        await Promise.race([secretReady, earlyFailure]);
        raced = await withAdmissionTransitionContention(database, fixture.own,
          async (transaction) => { await transaction.execute(sql`select id from public.message_deliveries where id=${reference.deliveryId} for update`); },
          async () => { releaseSecret(); return pendingRead; },
          () => { recoveryLocked = true; },
        );
      } finally { releaseSecret(); await settledRead; }
      const settled = await settledRead;
      expect(raced.status).toBe("rejected");
      expect(settled.status).toBe("rejected");
      if (settled.status === "rejected") expect(settled.reason).toMatchObject({ code: MESSAGING_ERROR_CODE.connectionIncomplete });
      expect(reads).toBe(1);
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`delete from public.session where id=${sessionId}`));
      await expect(lookup.read(reference, new AbortController().signal)).rejects.toMatchObject({ code: MESSAGING_ERROR_CODE.authenticationRequired });
      expect(reads).toBe(1);
    });
  }, 1_200_000);
});
