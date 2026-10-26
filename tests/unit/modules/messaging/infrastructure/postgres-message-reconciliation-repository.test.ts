/** @vitest-environment node */
/** Exercises own original-status selection, SDK reads and monotonic persistence with actual native authority and usage. @module postgres-message-reconciliation-repository-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareVerificationDeliveryPipeline } from "@/tests/support/verification-delivery-pipeline-fixture";
import { PostgresMessageReconciliationRepository } from "@/src/modules/messaging/infrastructure/repositories/postgres-message-reconciliation-repository";
import { buildMessagingModule } from "@/src/modules/messaging/setup";
import { PostgresAuthenticatedAccountProvider } from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import { PostgresMessagingAuthorizationReader } from "@/src/modules/messaging/infrastructure/repositories/postgres-messaging-authorization-reader";
import { ResolveMessagingContextUseCase } from "@/src/modules/messaging/application/use-cases/resolve-messaging-context-use-case";
import { ZavuMessageDeliverySender } from "@/src/modules/messaging/infrastructure/zavu/zavu-message-delivery-sender";
import { MESSAGE_DELIVERY_REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/message-delivery-reauthentication";
import { GOOGLE_IDENTITY_PROVIDER } from "@/src/modules/auth/constants/google-identity-evidence";
import { MESSAGING_DISPATCH_DEFAULT } from "@/src/modules/messaging/constants/messaging-dispatch";
import { MESSAGE_AUTHORIZATION_OUTCOME } from "@/src/modules/messaging/constants/message-delivery";
import { createMessagingSecretCipher } from "@/src/modules/messaging/infrastructure/encryption/messaging-secret-cipher";
import type { MessagingAuthorizationReader } from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

/** Keeps synthetic native sessions alive for the whole scenario. */

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native original message reconciliation", () => {
  it.each([
    { providerStatus: "delivered", attemptState: "delivered", deliveryState: "delivered", layout: "selected" },
    { providerStatus: "failed", attemptState: "rejected", deliveryState: "failed", layout: "selected" },
    { providerStatus: "delivered", attemptState: "delivered", deliveryState: "delivered", layout: "separate_candidate" },
    { providerStatus: "delivered", attemptState: "delivered", deliveryState: "delivered", layout: "coexisting_versions" },
  ])("should persist $providerStatus for $layout without changing original identity, consumed usage or authorization", async ({ providerStatus, attemptState, deliveryState, layout }) => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareVerificationDeliveryPipeline(database), providerMessageId = randomUUID();
      await database.applyMigration("20261014035258_audit_messaging_delivery_transitions.sql");
      await database.applyMigration("20261005095000_guard_global_identity_context.sql");
      const claims = await fixture.repository.claim({ leaseToken: randomUUID(), limit: 1, leaseSeconds: MESSAGING_DISPATCH_DEFAULT.leaseSeconds });
      const authorization = await fixture.repository.authorize(claims[0], randomUUID());
      if (authorization.outcome !== MESSAGE_AUTHORIZATION_OUTCOME.authorized) throw new Error("Own reconciliation marker unavailable");
      const sender = new ZavuMessageDeliverySender(fixture.preparation, async () => Response.json({ message: { id: providerMessageId, direction: "outbound", channel: "email", status: "queued" } }));
      const receipt = await sender.send(authorization.context, new AbortController().signal);
      expect(receipt.outcome).toBe("accepted"); await fixture.repository.complete({ context: authorization.context, ...receipt });
      const sessionId = randomUUID(), accountId = randomUUID(), subject = randomUUID();
      await database.withContext(fixture.own, async (transaction) => {
        const now = new Date((await transaction.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now);
        await transaction.execute(sql`insert into public.account(id,"userId","providerId","accountId","createdAt","updatedAt") values (${accountId},${fixture.userId},${GOOGLE_IDENTITY_PROVIDER},${subject},${now},${now})`);
        await transaction.execute(sql`insert into public.session(id,token,"userId","expiresAt","createdAt","updatedAt") values (${sessionId},${randomUUID()},${fixture.userId},clock_timestamp()+interval '1 hour',${now},${now})`);
        await transaction.execute(sql`insert into public.global_session_identity_bindings(session_id,user_id,account_id,provider_subject,normalized_email) values (${sessionId},${fixture.userId},${accountId},${subject},${fixture.own.email})`);
      });
      if (layout !== "selected") {
        const otherConnectionId = layout === "separate_candidate" ? randomUUID() : fixture.scope.connectionId;
        const otherVersion = layout === "separate_candidate" ? 1 : 2;
        const secretRef = randomUUID();
        const envelope = await createMessagingSecretCipher(fixture.config).seal(randomUUID(), { tribeId: fixture.scope.tribeId, connectionId: otherConnectionId, connectionVersion: otherVersion, resourceId: secretRef });
        await database.withContext(fixture.own, async (transaction) => {
          if (layout === "separate_candidate") {
            await transaction.execute(sql`update public.tenant_messaging_connections set is_selected=false,selected_version=null,is_candidate=true,candidate_version=1 where id=${fixture.scope.connectionId}`);
            await transaction.execute(sql`insert into public.tenant_messaging_connections(id,tribe_id,provider,contributed_by_user_id,environment,security_epoch,state,is_selected,selected_version,is_candidate) values (${otherConnectionId},${fixture.scope.tribeId},'zavu',${fixture.userId},${fixture.config.environment},${fixture.config.securityEpoch},'active',true,1,false)`);
          }
          await transaction.execute(sql`insert into public.messaging_connection_versions(connection_id,tribe_id,version,environment,security_epoch,secret_ref,email_sender_id,credential_validation_status,credential_validated_at,is_test_mode) values (${otherConnectionId},${fixture.scope.tribeId},${otherVersion},${fixture.config.environment},${fixture.config.securityEpoch},${secretRef},${randomUUID()},'valid',clock_timestamp(),false)`);
          await transaction.execute(sql`insert into public.messaging_secret_envelopes(secret_ref,tribe_id,connection_id,connection_version,environment,security_epoch,key_id,iv,ciphertext) values (${secretRef},${fixture.scope.tribeId},${otherConnectionId},${otherVersion},${envelope.environment},${envelope.securityEpoch},${envelope.keyId},${Buffer.from(envelope.iv)},${Buffer.from(envelope.ciphertext)})`);
          if (layout === "coexisting_versions") await transaction.execute(sql`update public.tenant_messaging_connections set is_candidate=true,candidate_version=2 where id=${fixture.scope.connectionId}`);
        });
      }
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
      const repository = new PostgresMessageReconciliationRepository(execute, async () => fixture.config);
      let reads = 0, status = providerStatus;
      const fetchStatus: typeof globalThis.fetch = async (input, init) => {
        const request = new Request(input, init); expect(request.method).toBe("GET"); expect(new URL(request.url).pathname.endsWith(providerMessageId)).toBe(true);
        expect(request.headers.get("Authorization") === `Bearer ${fixture.credential}`).toBe(true);
        expect(transactions).toBe(0); expect(fixture.transactions).toBe(0); reads += 1;
        return Response.json({ message: { id: providerMessageId, direction: "outbound", channel: "email", status } });
      };
      const cases = buildMessagingModule({ accounts, execute: (account, run) => execute(account.userId, run), clock: () => new Date() }).createDeliveryReconciliationModule({ readSecurityConfig: async () => fixture.config, fetch: fetchStatus }).useCases;
      const query = { tribeId: fixture.scope.tribeId, deliveryId: fixture.original.deliveryId, requestId: randomUUID() };
      const before = await fixture.snapshot();
      const reference = await repository.readReference({ actorUserId: fixture.userId, sessionId, tribeId: query.tribeId, requestId: query.requestId }, query.deliveryId);
      expect(reference).toMatchObject({ deliveryId: query.deliveryId, providerMessageId, attemptId: authorization.context.attemptId });
      expect(await cases.execute(query, new AbortController().signal)).toMatchObject({ ok: true, value: { id: query.deliveryId, state: deliveryState, purpose: "admission" } });
      const after = await fixture.snapshot(); expect(after.attempts).toHaveLength(1); expect(after.attempts[0]).toMatchObject({ id: authorization.context.attemptId, state: attemptState, provider_message_id: providerMessageId });
      expect(after.reservations).toEqual(before.reservations); expect(after.reservations[0]).toMatchObject({ state: "consumed" });
      expect(after.delivery).toMatchObject({ connection_id: fixture.scope.connectionId, connection_version: fixture.scope.connectionVersion });
      const reconciliationEvents = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select event.actor_user_id,event.operation_id=delivery.idempotency_key as original_ledger,event.resource_version,event.rule,event.cause,event.metadata,event.created_at=attempt.completed_at as owner_clock from public.academy_admission_audit_events event join public.message_deliveries delivery on delivery.id=event.resource_id and delivery.tribe_id=event.tribe_id join public.message_delivery_attempts attempt on attempt.id=${authorization.context.attemptId} where event.resource_type='message_delivery' and event.resource_id=${query.deliveryId} and event.event_type='delivery_reconciled'`)).rows);
      expect(reconciliationEvents).toEqual([{ actor_user_id: fixture.userId, original_ledger: true, resource_version: 5, rule: "reconcile_message_delivery", cause: deliveryState === "failed" ? "provider_rejected" : "provider_delivered", owner_clock: true, metadata: { fromState: "accepted", toState: deliveryState, previousVersion: 4, connectionId: fixture.scope.connectionId, connectionVersion: fixture.scope.connectionVersion, channel: "email", attemptId: authorization.context.attemptId, authorizedUsagePolicyVersion: authorization.context.authorizedUsagePolicyVersion } }]);
      status = "queued";
      expect(await cases.execute(query, new AbortController().signal)).toMatchObject({ ok: true, value: { state: deliveryState } }); expect(await fixture.snapshot()).toEqual(after);
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select count(*)::int as total from public.academy_admission_audit_events where resource_type='message_delivery' and resource_id=${query.deliveryId} and event_type='delivery_reconciled'`)).rows)).toEqual([{ total: 1 }]);
      const exactReader: MessagingAuthorizationReader = {
        getCurrentLeadership: reader.getCurrentLeadership,
        getConnection: (tribeId, connectionId) => execute(fixture.userId, (transaction) => new PostgresMessagingAuthorizationReader(transaction, sessionId, "management", fixture.scope.connectionVersion).getConnection(tribeId, connectionId)),
      };
      const exactResolver = new ResolveMessagingContextUseCase(accounts, exactReader, security, () => new Date());
      const authority = await exactResolver.execute({ tribeId: query.tribeId, connectionId: fixture.scope.connectionId, operation: MESSAGE_DELIVERY_REAUTHENTICATION_OPERATION.reconcile, requestId: query.requestId });
      if (!authority.allowed || !reference) throw new Error("Own reconciliation authority unavailable");
      await expect(repository.record(authority.context, { ...reference, providerMessageId: randomUUID() }, { outcome: "delivered", providerMessageId })).rejects.toMatchObject({ code: "resource_unavailable" });
      expect(await cases.execute({ ...query, deliveryId: randomUUID() }, new AbortController().signal)).toMatchObject({ ok: false, failure: { code: "resource_unavailable" } }); expect(reads).toBe(2);
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`delete from public.session where id=${sessionId}`));
      expect(await cases.execute(query, new AbortController().signal)).toMatchObject({ ok: false, failure: { code: "authentication_required" } }); expect(reads).toBe(2);
      expect(await fixture.snapshot()).toEqual(after);
    });
  }, 1_200_000);
});
