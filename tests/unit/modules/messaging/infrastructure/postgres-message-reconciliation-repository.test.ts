/** @vitest-environment node */
/** Exercises own original-status selection, SDK reads and monotonic persistence with actual native authority and usage. @module postgres-message-reconciliation-repository-tests */
import { randomBytes, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareVerificationDeliveryPipeline } from "@/tests/support/verification-delivery-pipeline-fixture";
import { PostgresMessageStatusPreparation } from "@/src/modules/messaging/infrastructure/repositories/postgres-message-status-preparation";
import { PostgresMessageReconciliationRepository } from "@/src/modules/messaging/infrastructure/repositories/postgres-message-reconciliation-repository";
import { ReconcileMessageDeliveryUseCase } from "@/src/modules/messaging/application/use-cases/reconcile-message-delivery-use-case";
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
import { MESSAGE_AUTHORIZATION_OUTCOME } from "@/src/modules/messaging/constants/message-delivery";
import type { MessagingAuthorizationReader } from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native original message reconciliation", () => {
  it.each([{ providerStatus: "delivered", attemptState: "delivered", deliveryState: "delivered" }, { providerStatus: "failed", attemptState: "rejected", deliveryState: "failed" }])("should persist $providerStatus without changing original identity, consumed usage or authorization", async ({ providerStatus, attemptState, deliveryState }) => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareVerificationDeliveryPipeline(database), providerMessageId = randomUUID();
      await database.applyMigration("20261005095000_guard_global_identity_context.sql");
      const claims = await fixture.repository.claim({ leaseToken: randomUUID(), limit: 1, leaseSeconds: MESSAGING_DISPATCH_DEFAULT.leaseSeconds });
      const authorization = await fixture.repository.authorize(claims[0], randomUUID());
      if (authorization.outcome !== MESSAGE_AUTHORIZATION_OUTCOME.authorized) throw new Error("Own reconciliation marker unavailable");
      const sender = new ZavuMessageDeliverySender(fixture.preparation, async () => Response.json({ message: { id: providerMessageId, direction: "outbound", channel: "email", status: "queued" } }));
      const receipt = await sender.send(authorization.context, new AbortController().signal);
      expect(receipt.outcome).toBe("accepted"); await fixture.repository.complete({ context: authorization.context, ...receipt });
      const sessionId = randomUUID(), accountId = randomUUID(), subject = randomUUID(), intentId = randomUUID();
      await database.withContext(fixture.own, async (transaction) => {
        const now = new Date((await transaction.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now), validUntil = new Date(now.getTime() + RECENT_AUTHENTICATION_WINDOW_MS);
        await transaction.execute(sql`insert into public.account(id,"userId","providerId","accountId","createdAt","updatedAt") values (${accountId},${fixture.userId},${GOOGLE_IDENTITY_PROVIDER},${subject},${now},${now})`);
        await transaction.execute(sql`insert into public.session(id,token,"userId","expiresAt","createdAt","updatedAt") values (${sessionId},${randomUUID()},${fixture.userId},clock_timestamp()+interval '1 hour',${now},${now})`);
        await transaction.execute(sql`insert into public.global_session_identity_bindings(session_id,user_id,account_id,provider_subject,normalized_email) values (${sessionId},${fixture.userId},${accountId},${subject},${fixture.own.email})`);
        await transaction.execute(sql`insert into public.global_reauthentication_intents(id,user_id,original_session_id,account_id,provider_subject,tribe_id,operation,resource_id,return_path,nonce_hash,state,created_at,expires_at,consumed_at) values (${intentId},${fixture.userId},${sessionId},${accountId},${subject},${fixture.scope.tribeId},${MESSAGE_DELIVERY_REAUTHENTICATION_OPERATION.reconcile},${fixture.scope.connectionId},'/synthetic-reconcile',${randomBytes(32)},'consumed',${now},${validUntil},${now})`);
        await transaction.execute(sql`insert into public.recent_authentication_evidence(intent_id,user_id,account_id,provider_subject,session_id,tribe_id,operation,resource_id,authenticated_at,verified_at,valid_until) values (${intentId},${fixture.userId},${accountId},${subject},${sessionId},${fixture.scope.tribeId},${MESSAGE_DELIVERY_REAUTHENTICATION_OPERATION.reconcile},${fixture.scope.connectionId},${now},${now},${validUntil})`);
      });
      let transactions = 0;
      /** @param actor - Current native principal. @param run - SQL-only callback. @returns A committed own result, observing actual transaction lifetime. */
      const execute = async <Result>(actor: string, run: (transaction: RequestDatabase) => Promise<Result>) => {
        transactions += 1;
        try { return await database.withContext({ userId: actor, email: null }, run); }
        finally { transactions -= 1; }
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
      const repository = new PostgresMessageReconciliationRepository(execute, async () => fixture.config);
      let reads = 0, status = providerStatus;
      const lookup = new ZavuMessageStatusLookup(preparation, async (input, init) => {
        const request = new Request(input, init); expect(request.method).toBe("GET"); expect(new URL(request.url).pathname.endsWith(providerMessageId)).toBe(true);
        expect(transactions).toBe(0); expect(fixture.transactions).toBe(0); reads += 1;
        return Response.json({ message: { id: providerMessageId, direction: "outbound", channel: "email", status } });
      });
      const cases = new ReconcileMessageDeliveryUseCase(accounts, resolver, repository, lookup);
      const query = { tribeId: fixture.scope.tribeId, deliveryId: fixture.original.deliveryId, requestId: randomUUID() };
      const before = await fixture.snapshot();
      const reference = await repository.readReference({ actorUserId: fixture.userId, sessionId, tribeId: query.tribeId, requestId: query.requestId }, query.deliveryId);
      expect(reference).toMatchObject({ deliveryId: query.deliveryId, providerMessageId, attemptId: authorization.context.attemptId });
      expect(await cases.execute(query, new AbortController().signal)).toMatchObject({ ok: true, value: { id: query.deliveryId, state: deliveryState, purpose: "admission" } });
      const after = await fixture.snapshot(); expect(after.attempts).toHaveLength(1); expect(after.attempts[0]).toMatchObject({ id: authorization.context.attemptId, state: attemptState, provider_message_id: providerMessageId });
      expect(after.reservations).toEqual(before.reservations); expect(after.reservations[0]).toMatchObject({ state: "consumed" });
      expect(after.delivery).toMatchObject({ connection_id: fixture.scope.connectionId, connection_version: fixture.scope.connectionVersion });
      status = "queued";
      expect(await cases.execute(query, new AbortController().signal)).toMatchObject({ ok: true, value: { state: deliveryState } }); expect(await fixture.snapshot()).toEqual(after);
      const authority = await resolver.execute({ tribeId: query.tribeId, connectionId: fixture.scope.connectionId, operation: MESSAGE_DELIVERY_REAUTHENTICATION_OPERATION.reconcile, requestId: query.requestId });
      if (!authority.allowed || !reference) throw new Error("Own reconciliation authority unavailable");
      await expect(repository.record(authority.context, { ...reference, providerMessageId: randomUUID() }, { outcome: "delivered", providerMessageId })).rejects.toMatchObject({ code: "resource_unavailable" });
      expect(await cases.execute({ ...query, deliveryId: randomUUID() }, new AbortController().signal)).toMatchObject({ ok: false, failure: { code: "resource_unavailable" } }); expect(reads).toBe(2);
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`delete from public.session where id=${sessionId}`));
      expect(await cases.execute(query, new AbortController().signal)).toMatchObject({ ok: false, failure: { code: "authentication_required" } }); expect(reads).toBe(2);
      expect(await fixture.snapshot()).toEqual(after);
    });
  }, 1_200_000);
});
