/** Seeds a coherent original notice and prepared replacement on one owned native branch. @module notification-delivery-recovery-fixture */
import { randomBytes, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { AcademyAdmissionTestDatabase } from "./academy-admission-database";
import { prepareMessagingConnectionActivation } from "./messaging-activation-fixture";
import type { NotificationDeliveryRecoveryContext } from "@/src/modules/messaging/domain/repositories/notification-delivery-recovery";
import { PostgresNotificationDeliveryRecoveryRepository } from "@/src/modules/messaging/infrastructure/repositories/postgres-notification-delivery-recovery-repository";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import { PostgresAuthenticatedAccountProvider } from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import { buildMessagingModule } from "@/src/modules/messaging/setup";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";

/** @param database - This run's isolated real PostgreSQL branch. @param deadlineMs - Optional original lifetime for real final-wait scenarios. @param securityConfig - Optional shared native server security, without serializing key material to artifacts. @returns Actual prepared connections, original obligation and native recovery writer; provider transport is controlled solely during candidate preparation. */
export async function prepareNotificationDeliveryRecovery(database: AcademyAdmissionTestDatabase, deadlineMs = 3_600_000, securityConfig?: MessagingSecurityConfig) {
  const activation = await prepareMessagingConnectionActivation(database, undefined, undefined, securityConfig);
  const creation = activation.fixture;
  for (const migration of ["20261006200000_scope_admission_audit_operations.sql", "20261006220000_extend_admission_notifications.sql", "20261011065500_record_notification_recovery_lineage.sql", "20261011103000_index_notification_delivery_catalog.sql", "20261013234047_guard_extended_notification_recovery_audit.sql"]) await database.applyMigration(migration);
  const { own } = creation.fixture;
  const activated = await activation.owner.activate(activation.context, activation.input);
  if (activated.state !== "completed") throw new Error("Notification recovery prepared selection unavailable");
  const first = await creation.repository.create(creation.context, { operationId: randomUUID(), confirmed: true, providerId: "zavu", name: "Original notification connection", apiKey: randomUUID() });
  if (first.state !== "completed") throw new Error("Notification recovery original encrypted connection unavailable");
  await database.withContext(own, (transaction) => transaction.execute(sql`update public.tenant_messaging_connections set is_candidate=false,candidate_version=null where id=${first.result.id}`));
  const originalDeliveryId = randomUUID(), requestId = randomUUID(), obligationId = randomUUID();
  const context = await database.withContext(own, async (transaction): Promise<NotificationDeliveryRecoveryContext> => {
    const now = new Date((await transaction.execute<{ now: Date | string }>(sql`select clock_timestamp() as now`)).rows[0].now);
    const deadline = new Date(now.getTime() + deadlineMs);
    const intentId = randomUUID(), validUntil = new Date(creation.context.validUntil);
    await transaction.execute(sql`insert into public.admission_email_settings(tribe_id,enabled,enabled_at,changed_by_user_id) values (${creation.context.tribeId},true,${now},${own.userId})`);
    await transaction.execute(sql`insert into public.academy_admission_requests(id,tribe_id,user_id,source,expires_at) values (${requestId},${creation.context.tribeId},${own.userId},'common',${now}::timestamptz+interval '29 days')`);
    await transaction.execute(sql`insert into public.academy_admission_notification_obligations(id,tribe_id,request_id,applicant_user_id,event_type) values (${obligationId},${creation.context.tribeId},${requestId},${own.userId},'pending_created')`);
    await transaction.execute(sql`select public.enqueue_admission_notification(${obligationId},${own.userId},'reviewer')`);
    await transaction.execute(sql`insert into public.message_deliveries(id,tribe_id,connection_id,connection_version,environment,security_epoch,purpose,source_resource_id,actor_user_id,recipient_ref,channel,idempotency_key,payload_fingerprint,payload_mac_key_id,frozen_intent,queued_usage_policy_version,state,created_at,due_at,deadline_at) values (${originalDeliveryId},${creation.context.tribeId},${first.result.id},1,${creation.fixture.config.environment},${creation.fixture.config.securityEpoch},'admission_notification',${obligationId},${own.userId},${own.userId},'email',${randomUUID()},${randomBytes(32)},'synthetic-original-payload','{}',1,'suppressed',${now},${now},${deadline})`);
    await transaction.execute(sql`insert into public.global_reauthentication_intents(id,user_id,original_session_id,account_id,provider_subject,tribe_id,operation,resource_id,return_path,nonce_hash,state,created_at,expires_at,consumed_at) values (${intentId},${own.userId},${creation.context.sessionId},${creation.context.accountId},${creation.context.subject},${creation.context.tribeId},'recover_notification_delivery',${originalDeliveryId},'/synthetic-notification-recovery',${randomBytes(32)},'consumed',${now},${validUntil},${now})`);
    await transaction.execute(sql`insert into public.recent_authentication_evidence(intent_id,user_id,account_id,provider_subject,session_id,tribe_id,operation,resource_id,authenticated_at,verified_at,valid_until) values (${intentId},${own.userId},${creation.context.accountId},${creation.context.subject},${creation.context.sessionId},${creation.context.tribeId},'recover_notification_delivery',${originalDeliveryId},${now},${now},${validUntil})`);
    return { ...creation.context, operation: "recover_notification_delivery", deliveryId: originalDeliveryId, resourceId: originalDeliveryId, authenticatedAt: now, validUntil };
  });
  const execute = <Result>(_context: NotificationDeliveryRecoveryContext, run: (transaction: RequestDatabase) => Promise<Result>) => database.withContext(own, run);
  const input = { operationId: randomUUID(), expectedVersion: 1, targetConnectionId: activation.context.connectionId, expectedTargetVersion: activated.result.version, confirmed: true as const };
  const baselineUsage = await database.withContext(own, async (transaction) => (await transaction.execute<{ reservations: number; attempts: number }>(sql`select (select count(*)::int from public.messaging_usage_reservations where tribe_id=${context.tribeId}) as reservations,(select count(*)::int from public.message_delivery_attempts where tribe_id=${context.tribeId}) as attempts`)).rows[0]);
  const accounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId: context.actorUserId, sessionId: context.sessionId }), (_identity, run) => database.withContext(own, run));
  const recovery = buildMessagingModule({ accounts, execute: (_account, run) => database.withContext(own, run), clock: () => new Date() }).createNotificationRecoveryModule({ readSecurityConfig: async () => creation.fixture.config }).useCases;
  return { creation, own, context, input, recovery, requestId, obligationId, targetConfigurationVersion: activation.context.connectionVersion, baselineUsage, transport: activation.transport, originalConnectionId: first.result.id, repository: new PostgresNotificationDeliveryRecoveryRepository(execute, async () => creation.fixture.config), execute };
}
