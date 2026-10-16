/** Prepares real complete notification sources, native recency and an isolated tested replacement without sending. @module admission-notification-group-recovery-fixture */
import { randomBytes, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { AcademyAdmissionTestDatabase } from "./academy-admission-database";
import { prepareAdmissionNotificationGroupAuthority } from "./admission-notification-group-authority-fixture";
import { RECENT_AUTHENTICATION_WINDOW_MS } from "@/src/modules/auth/constants/recent-authentication";
import { MESSAGE_DELIVERY_REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/message-delivery-reauthentication";
import { MESSAGING_CRYPTO, MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import { MESSAGING_CONNECTION_STATE } from "@/src/modules/messaging/constants/messaging-connection";
import { MESSAGING_CREDENTIAL_PUBLIC_STATE, MESSAGING_CAPABILITY_PUBLIC_STATE, MESSAGING_PUBLIC_CHANNEL } from "@/src/modules/messaging/constants/messaging-public-contract";
import { MICROSECONDS_PER_SECOND } from "@/src/constants/time";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { NotificationDeliveryRecoveryContext } from "@/src/modules/messaging/domain/repositories/notification-delivery-recovery";
import { createMessagingSecretCipher } from "@/src/modules/messaging/infrastructure/encryption/messaging-secret-cipher";
import { PostgresNotificationDeliveryRecoveryRepository } from "@/src/modules/messaging/infrastructure/repositories/postgres-notification-delivery-recovery-repository";
import { registerMessagingPrivateMacKeyMaterial } from "@/src/modules/messaging/infrastructure/repositories/assert-messaging-key-material";
import { buildAdmissionNotificationRecoveryContent } from "@/src/modules/notifications/setup";
import { buildMessagingModule } from "@/src/modules/messaging/setup";
import { PostgresAuthenticatedAccountProvider } from "@/src/modules/auth/infrastructure/authenticated-account-provider";

/** @param database - This test's fully owned native branch. @param grouped - Whether two actual sources must share a genuine five-minute calendar boundary. @returns Complete original and current target facts with the real content and ledger owners; target preparation is fixture metadata and does not certify provider onboarding. */
export async function prepareAdmissionNotificationGroupRecovery(database: AcademyAdmissionTestDatabase, grouped = false) {
  const fixture = await prepareAdmissionNotificationGroupAuthority(database);
  await fixture.preparationExecute((transaction) => registerMessagingPrivateMacKeyMaterial(transaction, fixture.keys.config, MESSAGING_KEY_PURPOSE.contactFingerprint));
  let original: { tribeId: string; groupId: string; expectedVersion: number; deliveryId: string };
  if (grouped) {
    await fixture.waitForCollectionWindow();
    const created = await fixture.createSources(2), first = await fixture.collect(created.sources[0].obligation_id), second = await fixture.collect(created.sources[1].obligation_id);
    if (first.groupId !== second.groupId) throw new Error("Complete recovery fixture sources did not share their real original bucket");
    const closes = await fixture.execute(async (transaction) => Number((await transaction.execute<{ instant: string }>(sql`select (extract(epoch from window_closes_at)*${MICROSECONDS_PER_SECOND})::bigint::text as instant from public.admission_notification_groups where id=${first.groupId}`)).rows[0].instant));
    await fixture.waitUntil(closes);
    const prepared = await fixture.preparation.prepare(first);
    if (prepared.status !== "queued") throw new Error("Complete recovery fixture did not prepare its real multi-source original");
    original = { ...first, deliveryId: prepared.deliveryId! };
  } else [original] = await fixture.queueIndividual(1);
  const targetConnectionId = randomUUID(), secretRef = randomUUID(), senderId = randomUUID();
  const envelope = await createMessagingSecretCipher(fixture.keys.config).seal(randomUUID(), { tribeId: fixture.tribeId, connectionId: targetConnectionId, connectionVersion: 1, resourceId: secretRef });
  const context = await fixture.execute(async (transaction): Promise<NotificationDeliveryRecoveryContext> => {
    const sessionId = randomUUID(), intentId = randomUUID();
    const account = (await transaction.execute<{ id: string; subject: string; email: string }>(sql`select account.id,account."accountId" as subject,app_user.email from public.account account join public."user" app_user on app_user.id=account."userId" where account.id=${fixture.accountIds.get(fixture.leaderId)!}`)).rows[0];
    const now = new Date((await transaction.execute<{ now: Date | string }>(sql`select clock_timestamp() as now`)).rows[0].now), validUntil = new Date(now.getTime() + RECENT_AUTHENTICATION_WINDOW_MS);
    await transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${sessionId},${fixture.leaderId},${randomUUID()},${validUntil},${now},${now})`);
    await transaction.execute(sql`insert into public.global_session_identity_bindings(session_id,user_id,account_id,provider_subject,normalized_email) values (${sessionId},${fixture.leaderId},${account.id},${account.subject},${account.email.trim().toLowerCase()})`);
    await transaction.execute(sql`insert into public.global_reauthentication_intents(id,user_id,original_session_id,account_id,provider_subject,tribe_id,operation,resource_id,return_path,nonce_hash,state,created_at,expires_at,consumed_at) values (${intentId},${fixture.leaderId},${sessionId},${account.id},${account.subject},${fixture.tribeId},${MESSAGE_DELIVERY_REAUTHENTICATION_OPERATION.recoverNotification},${original.deliveryId},'/synthetic-group-recovery',${randomBytes(MESSAGING_CRYPTO.keyBytes)},'consumed',${now},${validUntil},${now})`);
    await transaction.execute(sql`insert into public.recent_authentication_evidence(intent_id,user_id,account_id,provider_subject,session_id,tribe_id,operation,resource_id,authenticated_at,verified_at,valid_until) values (${intentId},${fixture.leaderId},${account.id},${account.subject},${sessionId},${fixture.tribeId},${MESSAGE_DELIVERY_REAUTHENTICATION_OPERATION.recoverNotification},${original.deliveryId},${now},${now},${validUntil})`);
    await transaction.execute(sql`insert into public.tenant_messaging_connections(id,tribe_id,contributed_by_user_id,state,environment,security_epoch,is_candidate,candidate_version) values (${targetConnectionId},${fixture.tribeId},${fixture.leaderId},${MESSAGING_CONNECTION_STATE.degraded},${fixture.keys.config.environment},${fixture.keys.config.securityEpoch},false,null)`);
    await transaction.execute(sql`insert into public.messaging_connection_versions(connection_id,tribe_id,version,environment,security_epoch,secret_ref,credential_validation_status,is_test_mode,email_sender_id) values (${targetConnectionId},${fixture.tribeId},1,${fixture.keys.config.environment},${fixture.keys.config.securityEpoch},${secretRef},${MESSAGING_CREDENTIAL_PUBLIC_STATE.valid},false,${senderId})`);
    await transaction.execute(sql`insert into public.messaging_secret_envelopes(secret_ref,tribe_id,connection_id,connection_version,environment,security_epoch,key_id,iv,ciphertext) values (${secretRef},${fixture.tribeId},${targetConnectionId},1,${envelope.environment},${envelope.securityEpoch},${envelope.keyId},${Buffer.from(envelope.iv)},${Buffer.from(envelope.ciphertext)})`);
    await transaction.execute(sql`insert into public.messaging_connection_capabilities(connection_id,tribe_id,connection_version,channel,state,sender_id,checked_at,tested_at) values (${targetConnectionId},${fixture.tribeId},1,${MESSAGING_PUBLIC_CHANNEL.email},${MESSAGING_CAPABILITY_PUBLIC_STATE.prepared},${senderId},clock_timestamp(),clock_timestamp())`);
    await transaction.execute(sql`update public.tenant_messaging_connections set is_selected=false,selected_version=null where id=${fixture.connectionId}`);
    await transaction.execute(sql`update public.tenant_messaging_connections set is_selected=true,selected_version=1,state=${MESSAGING_CONNECTION_STATE.active} where id=${targetConnectionId}`);
    return { actorUserId: fixture.leaderId, tribeId: fixture.tribeId, requestId: randomUUID(), sessionId, accountId: account.id, subject: account.subject, operation: MESSAGE_DELIVERY_REAUTHENTICATION_OPERATION.recoverNotification, deliveryId: original.deliveryId, resourceId: original.deliveryId, authenticatedAt: now, validUntil };
  });
  const targetVersion = await fixture.execute(async (transaction) => (await transaction.execute<{ version: number }>(sql`select version from public.tenant_messaging_connections where id=${targetConnectionId}`)).rows[0].version);
  const executeActor = <Result>(_context: NotificationDeliveryRecoveryContext, run: (transaction: RequestDatabase) => Promise<Result>) => database.withContext(fixture.own, run);
  const content = buildAdmissionNotificationRecoveryContent(fixture.readSecurityConfig);
  const repository = new PostgresNotificationDeliveryRecoveryRepository(executeActor, fixture.readSecurityConfig, content);
  const accounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId: context.actorUserId, sessionId: context.sessionId }), (_identity, run) => database.withContext(fixture.own, run));
  const recovery = buildMessagingModule({ accounts, execute: (_account, run) => database.withContext(fixture.own, run), clock: () => new Date() }).createNotificationRecoveryModule({ readSecurityConfig: fixture.readSecurityConfig, groupContent: content }).useCases;
  const input = { operationId: randomUUID(), expectedVersion: 1, targetConnectionId, expectedTargetVersion: targetVersion, confirmed: true as const };
  return { ...fixture, original, targetConnectionId, targetVersion, senderId, context, input, executeActor, content, repository, recovery };
}
