/** @vitest-environment node */
/** Verifies a genuine noncreator payer and retained complete intent across canonical transfers and account deletion. @module admission-notification-group-recovery-lifecycle-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionNotificationGroupAuthority } from "@/tests/support/admission-notification-group-authority-fixture";
import { ADMISSION_NOTIFICATION_GROUP_PREPARATION_TEST_TIMEOUT_MS } from "@/tests/support/constants/admission-notification-validation";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import { MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import { MESSAGING_CONNECTION_STATE } from "@/src/modules/messaging/constants/messaging-connection";
import { MESSAGING_CREDENTIAL_PUBLIC_STATE, MESSAGING_CAPABILITY_PUBLIC_STATE, MESSAGING_PUBLIC_CHANNEL, MESSAGING_INITIAL_PROVIDER_ID } from "@/src/modules/messaging/constants/messaging-public-contract";
import { TRIBE_MEMBER_ROLE } from "@/src/modules/tribes/constants/tribe-member-role";
import { TRIBE_MEMBERSHIP_STATUS } from "@/src/modules/tribes/constants/tribe-page-access";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { MICROSECONDS_PER_SECOND } from "@/src/constants/time";
import { ADMISSION_NOTIFICATION_COLLECTED } from "@/src/modules/notifications/constants/admission-notification-collection";
import { ADMISSION_NOTIFICATION_PREPARATION_QUEUED } from "@/src/modules/notifications/constants/admission-notification-email-intent";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MessagingConnectionCreationContext } from "@/src/modules/messaging/domain/repositories/messaging-connection-management";
import type { AuthorizedMessagingContext } from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import type { AdmissionNotificationEmailIntent, AdmissionNotificationEmailIntentContext } from "@/src/modules/notifications/domain/entities/admission-notification-email-intent";
import { PostgresMessagingConnectionRepository } from "@/src/modules/messaging/infrastructure/repositories/postgres-messaging-connection-repository";
import { PostgresMessagingConnectionConfiguration } from "@/src/modules/messaging/infrastructure/repositories/postgres-messaging-connection-configuration";
import { PostgresMessagingAuthorizationReader } from "@/src/modules/messaging/infrastructure/repositories/postgres-messaging-authorization-reader";
import { PostgresTribeLeadershipRepository } from "@/src/modules/tribes/infrastructure/repositories/postgres-tribe-leadership-repository";
import { PostgresAdmissionNotificationRepository } from "@/src/modules/notifications/infrastructure/repositories/postgres-admission-notification-repository";
import { PostgresAdmissionNotificationDeliveryAuthority } from "@/src/modules/notifications/infrastructure/repositories/postgres-admission-notification-delivery-authority";
import { createAdmissionNotificationEmailIntentMac } from "@/src/modules/notifications/infrastructure/encryption/admission-notification-email-intent-mac";
import { registerMessagingPrivateMacKeyMaterial } from "@/src/modules/messaging/infrastructure/repositories/assert-messaging-key-material";

import { MESSAGE_DELIVERY_REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/message-delivery-reauthentication";
import type { NotificationDeliveryRecoveryContext } from "@/src/modules/messaging/domain/repositories/notification-delivery-recovery";
import { PostgresNotificationDeliveryRecoveryRepository } from "@/src/modules/messaging/infrastructure/repositories/postgres-notification-delivery-recovery-repository";
import { buildAdmissionNotificationRecoveryContent } from "@/src/modules/notifications/setup";

/** Keeps synthetic native sessions alive for the whole scenario. */
const SESSION_LIFETIME_MS = 10 * 60 * 1000;

/** Restricts lifecycle diagnostics to safe boolean/count facts and a sanitized native failure chain. */
declare module "vitest" {
  interface TaskMeta {
    deletedPayerOriginal?: Record<string, boolean | number>;
    deletedPayerRecovery?: Record<string, boolean | number>;
    deletedPayerPhase?: { phase: string; failure: readonly { name?: string; code?: string; constraint?: string }[] | null };
  }
}

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native complete notification recovery after payer minimization", () => {
  it("should recover authentic complete content after canonical transfers and legitimate deletion erase the noncreator payer", async (test) => {
    let phase = "prepare", failure: readonly { name?: string; code?: string; constraint?: string }[] | null = null;
    await withAcademyAdmissionDatabase(async (database) => {
      try {
        const fixture = await prepareAdmissionNotificationGroupAuthority(database), creatorUserId = fixture.leaderId, payerUserId = fixture.guardianId, recipientUserId = fixture.applicantIds[0];
        phase = "enroll_contact_material";
        await fixture.preparationExecute((transaction) => registerMessagingPrivateMacKeyMaterial(transaction, fixture.keys.config, MESSAGING_KEY_PURPOSE.contactFingerprint));
        // This shared history fixture retains an unrelated original candidate; release its slot before the tested lifecycle starts.
        await fixture.execute((transaction) => transaction.execute(sql`update public.tenant_messaging_connections set is_candidate=false,candidate_version=null where tribe_id=${fixture.tribeId} and is_candidate`));
        const execute = <Result>(context: { actorUserId: string }, run: (transaction: RequestDatabase) => Promise<Result>) => database.withContext({ userId: context.actorUserId, email: null }, run);
        const readSecurityConfig = fixture.readSecurityConfig;
        const accountIds: ReadonlyMap<string, string> = fixture.accountIds;
        /** @param userId - Existing native account, never a browser flag. @returns A fresh synthetic session and exactly bound Google context for this isolated branch only. */
        const createSession = (userId: string) => database.withContext(fixture.system, async (transaction) => {
          const sessionId = randomUUID();
          const account = (await transaction.execute<{ id: string; subject: string; email: string }>(sql`select account.id,account."accountId" as subject,app_user.email from public.account account join public."user" app_user on app_user.id=account."userId" where account.id=${accountIds.get(userId)!}`)).rows[0];
          const now = new Date((await transaction.execute<{ now: Date | string }>(sql`select clock_timestamp() as now`)).rows[0].now), expiresAt = new Date(now.getTime() + SESSION_LIFETIME_MS);
          await transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${sessionId},${userId},${randomUUID()},${expiresAt},${now},${now})`);
          await transaction.execute(sql`insert into public.global_session_identity_bindings(session_id,user_id,account_id,provider_subject,normalized_email) values (${sessionId},${userId},${account.id},${account.subject},${account.email.trim().toLowerCase()})`);
          return { actorUserId: userId, tribeId: fixture.tribeId, requestId: randomUUID(), sessionId, accountId: account.id, subject: account.subject };
        });
        const creator = await createSession(creatorUserId), payer = await createSession(payerUserId);
        await fixture.execute(async (transaction) => {
          await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status) values (${fixture.tribeId},${recipientUserId},${TRIBE_MEMBER_ROLE.guardian},${TRIBE_MEMBERSHIP_STATUS.active})`);
          await transaction.execute(sql`insert into public.admission_notification_preferences(tribe_id,recipient_user_id,mode,version) values (${fixture.tribeId},${recipientUserId},'individual',1)`);
        });
        const { sources } = await fixture.createSources(1);
        await fixture.execute((transaction) => transaction.execute(sql`select public.enqueue_admission_notification(${sources[0].obligation_id},${recipientUserId},'reviewer')`));
        const leadership = new PostgresTribeLeadershipRepository(execute, readSecurityConfig);
        phase = "transfer_to_noncreator";
        const firstTransfer = await leadership.transfer(creator, { operationId: randomUUID(), expectedLeaderUserId: creatorUserId, nextLeaderUserId: payerUserId, formerLeaderRole: TRIBE_MEMBER_ROLE.guardian, confirmed: true });
        if (firstTransfer.state !== OPERATION_STATE.completed) throw new Error("Native payer recovery transfer did not complete");
        const authority = await execute(payer, (transaction) => new PostgresMessagingAuthorizationReader(transaction, payer.sessionId).getCurrentLeadership(fixture.tribeId, payerUserId));
        expect(authority?.leaderUserId).toBe(payerUserId);
        const creation: MessagingConnectionCreationContext = { ...payer, operation: REAUTHENTICATION_OPERATION.saveMessagingCredentials, resourceId: fixture.tribeId };
        phase = "create_noncreator_connection";
        const credential = randomUUID();
        const created = await new PostgresMessagingConnectionRepository(execute, readSecurityConfig).create(creation, { operationId: randomUUID(), confirmed: true, providerId: MESSAGING_INITIAL_PROVIDER_ID, name: "Conexión sintética del líder actual", apiKey: credential });
        if (created.state !== OPERATION_STATE.completed) throw new Error("Native noncreator payer connection did not complete");
        const connectionId = created.result.id, senderId = randomUUID();
        phase = "configure_noncreator_connection";
        const configurationContext = await execute(payer, async (transaction): Promise<AuthorizedMessagingContext> => {
          const operation = REAUTHENTICATION_OPERATION.configureMessagingConnection;
          const secret = (await transaction.execute<{ secret_ref: string }>(sql`select secret_ref from public.messaging_connection_versions where connection_id=${connectionId} and version=${created.result.configurationVersion}`)).rows[0];
          return { ...payer, authorizationPurpose: "sensitive_leader", operation, resourceId: connectionId, connectionId, connectionVersion: created.result.configurationVersion, environment: fixture.keys.config.environment, securityEpoch: fixture.keys.config.securityEpoch, secretRef: secret.secret_ref };
        });
        const configured = await new PostgresMessagingConnectionConfiguration(execute, readSecurityConfig).commit(configurationContext, { operationId: randomUUID(), expectedVersion: created.result.version, confirmed: true, channel: MESSAGING_PUBLIC_CHANNEL.email, senderId }, { credential, sender: { resourceId: senderId, name: "Remitente sintético de prueba", channels: [MESSAGING_PUBLIC_CHANNEL.email], canSendWhatsappTemplates: false } });
        if (configured.state !== OPERATION_STATE.completed) throw new Error("Native noncreator payer configuration did not complete");
        const configurationVersion = configured.result.configurationVersion;
        await execute(payer, async (transaction) => {
          await transaction.execute(sql`update public.tenant_messaging_connections set is_selected=false,selected_version=null where id=${fixture.connectionId}`);
          await transaction.execute(sql`update public.messaging_connection_versions set credential_validation_status=${MESSAGING_CREDENTIAL_PUBLIC_STATE.valid},is_test_mode=false,credential_validated_at=clock_timestamp() where connection_id=${connectionId} and version=${configurationVersion}`);
          await transaction.execute(sql`update public.messaging_connection_capabilities set state=${MESSAGING_CAPABILITY_PUBLIC_STATE.prepared},tested_at=clock_timestamp() where connection_id=${connectionId} and connection_version=${configurationVersion} and channel=${MESSAGING_PUBLIC_CHANNEL.email}`);
          await transaction.execute(sql`update public.tenant_messaging_connections set is_selected=true,selected_version=${configurationVersion},is_candidate=false,candidate_version=null,state=${MESSAGING_CONNECTION_STATE.active} where id=${connectionId}`);
        });
        phase = "prepare_genuine_original";
        const collected = await fixture.preparationExecute((transaction) => new PostgresAdmissionNotificationRepository(transaction, fixture.preparationAuthorize, readSecurityConfig).collect({ tribeId: fixture.tribeId, obligationId: sources[0].obligation_id, recipientUserId, audience: "reviewer" }));
        if (collected.status !== ADMISSION_NOTIFICATION_COLLECTED) throw new Error("Native noncreator payer source did not collect");
        const prepared = await fixture.preparation.prepare({ tribeId: fixture.tribeId, groupId: collected.groupId, expectedVersion: 1 });
        if (prepared.status !== ADMISSION_NOTIFICATION_PREPARATION_QUEUED || !prepared.deliveryId) throw new Error("Native noncreator payer group did not prepare");
        const original = await fixture.preparationExecute((transaction) => new PostgresAdmissionNotificationDeliveryAuthority(transaction, fixture.preparationAuthorize, readSecurityConfig).read({ tribeId: fixture.tribeId, deliveryId: prepared.deliveryId! }));
        if (original.status !== "current") throw new Error("Native noncreator payer original was not authentic");
        const before = await fixture.preparationExecute(async (transaction) => (await transaction.execute<{ actor_user_id: string | null; contributed_by_user_id: string | null; created_by: string; frozen_intent: AdmissionNotificationEmailIntent; payload_fingerprint: Uint8Array; payload_mac_key_id: string; idempotency_key: string; queued_usage_policy_version: number; created_microseconds: string; deadline_microseconds: string }>(sql`select delivery.actor_user_id,connection.contributed_by_user_id,tribe.created_by,delivery.frozen_intent,delivery.payload_fingerprint,delivery.payload_mac_key_id,delivery.idempotency_key,delivery.queued_usage_policy_version,(extract(epoch from delivery.created_at)*${MICROSECONDS_PER_SECOND})::bigint::text as created_microseconds,(extract(epoch from delivery.deadline_at)*${MICROSECONDS_PER_SECOND})::bigint::text as deadline_microseconds from public.message_deliveries delivery join public.tenant_messaging_connections connection on connection.id=delivery.connection_id join public.tribes tribe on tribe.id=delivery.tribe_id where delivery.id=${prepared.deliveryId}`)).rows[0]);
        expect(before.created_by).toBe(creatorUserId); expect(before.actor_user_id).toBe(payerUserId); expect(before.contributed_by_user_id).toBe(payerUserId);
        phase = "return_leadership_then_delete_payer";
        const secondTransfer = await leadership.transfer(payer, { operationId: randomUUID(), expectedLeaderUserId: payerUserId, nextLeaderUserId: creatorUserId, formerLeaderRole: TRIBE_MEMBER_ROLE.guardian, confirmed: true });
        if (secondTransfer.state !== OPERATION_STATE.completed) throw new Error("Native payer recovery return transfer did not complete");
        await fixture.preparationExecute((transaction) => transaction.execute(sql`delete from public."user" where id=${payerUserId}`));
        const after = await fixture.preparationExecute(async (transaction) => (await transaction.execute<{ actor_user_id: string | null; contributed_by_user_id: string | null; frozen_intent: AdmissionNotificationEmailIntent; created_by: string; recipient_alive: boolean; group_alive: boolean; deadline_microseconds: string }>(sql`select delivery.actor_user_id,connection.contributed_by_user_id,delivery.frozen_intent,tribe.created_by,exists(select 1 from public."user" where id=${recipientUserId}) as recipient_alive,exists(select 1 from public.admission_notification_groups where id=${collected.groupId}) as group_alive,(extract(epoch from delivery.deadline_at)*${MICROSECONDS_PER_SECOND})::bigint::text as deadline_microseconds from public.message_deliveries delivery join public.tenant_messaging_connections connection on connection.id=delivery.connection_id join public.tribes tribe on tribe.id=delivery.tribe_id where delivery.id=${prepared.deliveryId}`)).rows[0]);
        const context: AdmissionNotificationEmailIntentContext = { tribeId: fixture.tribeId, deliveryId: prepared.deliveryId, originalDeliveryId: null, connectionId, connectionVersion: original.delivery.connectionVersion, contributingLeaderUserId: payerUserId, recipientUserId, normalizedRecipientEmail: original.delivery.normalizedEmail, idempotencyKey: before.idempotency_key, queuedUsagePolicyVersion: before.queued_usage_policy_version, createdAtMicroseconds: Number(before.created_microseconds), deadlineAtMicroseconds: Number(before.deadline_microseconds), intent: before.frozen_intent };
        const mac = createAdmissionNotificationEmailIntentMac(fixture.keys.config), signed = { keyId: before.payload_mac_key_id, mac: before.payload_fingerprint };
        const validWithOriginalPayerKnownOnlyToFixture = await mac.verify(context, signed), validWithCurrentErasedPayer = await mac.verify({ ...context, contributingLeaderUserId: after.actor_user_id ?? "" }, signed);
        test.task.meta.deletedPayerOriginal = { noncreatorCreatedConnectionThroughOwner: true, creatorRetained: after.created_by === creatorUserId, recipientRetained: after.recipient_alive, groupRetained: after.group_alive, actorErased: after.actor_user_id === null, contributorErased: after.contributed_by_user_id === null, contentPreserved: JSON.stringify(before.frozen_intent) === JSON.stringify(after.frozen_intent), deadlinePreserved: before.deadline_microseconds === after.deadline_microseconds, validWithOriginalPayerKnownOnlyToFixture, validWithCurrentErasedPayer, realMessages: 0 };
        expect(after).toMatchObject({ actor_user_id: null, contributed_by_user_id: null, created_by: creatorUserId, recipient_alive: true, group_alive: true, frozen_intent: before.frozen_intent, deadline_microseconds: before.deadline_microseconds });
        expect(validWithOriginalPayerKnownOnlyToFixture).toBe(true); expect(validWithCurrentErasedPayer).toBe(false);
        phase = "authenticate_minimized_original";
        if(after.frozen_intent.format!==2)throw new Error("Expected explicit bound original format");
        const {contributingLeaderUserId:_payer,normalizedRecipientEmail:_email,...historicalScope}=context;
        expect(await mac.verifyOriginal({...historicalScope,intent:after.frozen_intent},signed)).toBe(true);
        // Restore only the creator's own pre-existing prepared target metadata; no retired payer credential is adopted.
        phase = "prepare_current_creator_target";
        const currentCreator=await createSession(creatorUserId);
        const recoveryContext:NotificationDeliveryRecoveryContext={...currentCreator,operation:MESSAGE_DELIVERY_REAUTHENTICATION_OPERATION.recoverNotification,deliveryId:prepared.deliveryId,resourceId:prepared.deliveryId};
        const targetVersion=await execute(currentCreator,async(transaction)=>{
          await transaction.execute(sql`update public.tenant_messaging_connections set is_selected=false,selected_version=null where id=${connectionId}`);
          await transaction.execute(sql`update public.tenant_messaging_connections set is_selected=true,selected_version=1,state=${MESSAGING_CONNECTION_STATE.active} where id=${fixture.connectionId}`);
          return (await transaction.execute<{version:number}>(sql`select version from public.tenant_messaging_connections where id=${fixture.connectionId}`)).rows[0].version;
        });
        phase = "recover_without_erased_payer";
        const recovered=await new PostgresNotificationDeliveryRecoveryRepository(execute,readSecurityConfig,buildAdmissionNotificationRecoveryContent(readSecurityConfig)).recover(recoveryContext,{operationId:randomUUID(),expectedVersion:1,targetConnectionId:fixture.connectionId,expectedTargetVersion:targetVersion,confirmed:true});
        expect(recovered.state).toBe(OPERATION_STATE.completed);
        if(recovered.state!==OPERATION_STATE.completed)throw new Error("Expected committed recovery after payer minimization");
        const child=await fixture.preparationExecute((transaction)=>new PostgresAdmissionNotificationDeliveryAuthority(transaction,fixture.preparationAuthorize,readSecurityConfig).read({tribeId:fixture.tribeId,deliveryId:recovered.result.recoveryDeliveryId}));
        expect(child.status).toBe('current');
        if(child.status!=='current')throw new Error("Recovered child did not retain current complete group authority");
        expect({subject:child.delivery.intent.subject,text:child.delivery.intent.text,href:child.delivery.intent.href,manifest:child.delivery.intent.manifest}).toEqual({subject:before.frozen_intent.subject,text:before.frozen_intent.text,href:before.frozen_intent.href,manifest:before.frozen_intent.manifest});
        expect(child.delivery.deadlineAtMicroseconds).toBe(Number(after.deadline_microseconds));
        expect(child.delivery.contributingLeaderUserId).toBe(creatorUserId);
        test.task.meta.deletedPayerRecovery={historicalAuthenticAfterMinimization:true,recoveryCompleted:true,childCurrentlyAuthorized:true,fullContentPreserved:true,originalDeadlinePreserved:true,realMessages:0};
        phase = "completed";
      } catch (error) {
        const chain: { name?: string; code?: string; constraint?: string }[] = [];
        let current: unknown = error;
        for (let depth = 0; depth < 6 && current && typeof current === "object"; depth++) {
          const diagnostic = current as { name?: string; code?: string; constraint?: string; cause?: unknown };
          chain.push({ name: diagnostic.name, code: diagnostic.code, constraint: diagnostic.constraint }); current = diagnostic.cause;
        }
        failure = chain;
      }
    });
    test.task.meta.deletedPayerPhase = { phase, failure };
    expect(failure, "Native payer prerequisites must complete; inspect only the sanitized phase and error codes").toBeNull();
    expect(phase).toBe("completed");
  }, ADMISSION_NOTIFICATION_GROUP_PREPARATION_TEST_TIMEOUT_MS);
});
