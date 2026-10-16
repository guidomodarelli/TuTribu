/** Authenticates historical complete groups and rebinds their content to a current tested replacement. @module postgres-admission-notification-group-recovery-content */
import "server-only";
import { sql } from "drizzle-orm";
import { MICROSECONDS_PER_SECOND } from "@/src/constants/time";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import type { NotificationGroupRecoveryAuthorizer, NotificationGroupRecoveryContent, NotificationGroupRecoveryContentCommand, PreparedNotificationGroupRecoveryContent } from "@/src/modules/messaging/infrastructure/notification-group-recovery-content";
import { assertMessagingAuthenticatedMacKeyMaterial } from "@/src/modules/messaging/infrastructure/repositories/assert-messaging-key-material";
import { MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import { MESSAGING_PUBLIC_CHANNEL } from "@/src/modules/messaging/constants/messaging-public-contract";
import { NOTIFICATION_DELIVERY_RECOVERY_PURPOSE } from "@/src/modules/messaging/constants/notification-delivery-recovery";
import { MessagingCryptographyError } from "@/src/modules/messaging/infrastructure/encryption/messaging-cryptography-error";
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { ADMISSION_NOTIFICATION_EMAIL_INTENT_FORMAT } from "../../constants/admission-notification-email-intent";
import { ADMISSION_NOTIFICATION_GROUP_AUTHORITY_CURRENT } from "../../constants/admission-notification-group-authority";
import { ADMISSION_NOTIFICATION_GROUP_REASON } from "../../constants/admission-notification-groups";
import type { AdmissionNotificationAudience } from "../../domain/entities/admission-notification";
import type { AdmissionNotificationEmailIntent, AdmissionNotificationEmailIntentScope } from "../../domain/entities/admission-notification-email-intent";
import { admissionNotificationManifestsMatch, resolveAdmissionNotificationGroupAuthority } from "../../domain/policies/admission-notification-group-authority";
import { projectAdmissionNotificationEmailContent } from "../../domain/policies/project-admission-notification-email-content";
import { createAdmissionNotificationEmailIntentMac } from "../encryption/admission-notification-email-intent-mac";
import { hasReadableAdmissionNotificationEmailIntent } from "../encryption/readable-admission-notification-email-intent";
import { admissionNotificationNow, PostgresAdmissionNotificationGroupReader, readAdmissionNotificationGroup } from "./admission-notification-group-reader";

/** Consumes only immutable native content coordinates; a retired payer is allowed to be absent. */
type OriginalGroupDelivery = {
  id: string; connection_id: string; connection_version: number; environment: string; security_epoch: string;
  purpose: string; channel: string; source_resource_id: string; notification_group_id: string | null;
  notification_group_audience: AdmissionNotificationAudience | null; recipient_ref: string; actor_user_id: string | null;
  recovery_of_delivery_id: string | null; idempotency_key: string; queued_usage_policy_version: number;
  created_microseconds: string; deadline_microseconds: string; frozen_intent: unknown;
  payload_mac_key_id: string; payload_fingerprint: Uint8Array;
};

/** Keeps content/source policy separate from the caller's atomic CAS, ledger, audit and transport decisions. */
export class PostgresAdmissionNotificationGroupRecoveryContent implements NotificationGroupRecoveryContent {
  /** @param readSecurityConfig - Current local external scope and keys; no RPC or new checkout is created. */
  constructor(private readonly readSecurityConfig: () => Promise<MessagingSecurityConfig>) {}

  /** @param run - Original same-transaction content work. @returns Its private result. @throws AdmissionOperationError with a closed safe code and original private crypto cause. */
  private async checked<Result>(run: () => Promise<Result>): Promise<Result> {
    try { return await run(); }
    catch (error) {
      if (error instanceof MessagingCryptographyError) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.connectionIncomplete, { cause: error });
      throw error;
    }
  }

  /** @param database - Existing ledger transaction. @param command - Exact human-owned original and target. @param authorize - Native current authority. @returns After session, leadership and original-specific recency remain current. */
  private async assertAuthorized(database: RequestDatabase, command: NotificationGroupRecoveryContentCommand, authorize: NotificationGroupRecoveryAuthorizer): Promise<void> {
    if (!await authorize(database, command.tribeId)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.permissionDenied);
  }

  /** @param config - Current external guard. @param original - Immutable original scope. @returns After environment and epoch agree. @throws AdmissionOperationError when recovery or restored scope closes protected work. */
  private assertSecurity(config: MessagingSecurityConfig, original: OriginalGroupDelivery): void {
    if (config.recoveryLocked || config.environment !== original.environment || config.securityEpoch !== original.security_epoch) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.connectionIncomplete);
  }

  /** @param config - Current retained keyring. @param original - Original native identities, potentially minimized. @param scope - Exact immutable original coordinates. @param intent - Complete original protocol. @param normalizedEmail - Currently trusted account email, never persisted. @returns Historical authenticity without inventing an erased legacy identity. */
  private async authentic(config: MessagingSecurityConfig, original: OriginalGroupDelivery, scope: AdmissionNotificationEmailIntentScope, intent: AdmissionNotificationEmailIntent, normalizedEmail: string): Promise<boolean> {
    const mac = createAdmissionNotificationEmailIntentMac(config), signed = { keyId: original.payload_mac_key_id, mac: original.payload_fingerprint };
    if (intent.format === ADMISSION_NOTIFICATION_EMAIL_INTENT_FORMAT) return mac.verifyOriginal({ ...scope, intent }, signed);
    if (!original.actor_user_id) return false;
    return mac.verify({ ...scope, intent, contributingLeaderUserId: original.actor_user_id, normalizedRecipientEmail: normalizedEmail }, signed);
  }

  /** @param database - Original guarded transaction. @param command - Fixed lineage and target. @param authorize - Repeated native authority. @returns Complete authentic historical bytes and every current source/recipient/resource fact, independently of the old resource's selection. */
  private async readCurrent(database: RequestDatabase, command: NotificationGroupRecoveryContentCommand, authorize: NotificationGroupRecoveryAuthorizer) {
    await this.assertAuthorized(database, command, authorize);
    if (!(await database.execute(sql`select id from public.tribes where id=${command.tribeId} for update`)).rows[0]) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
    await database.execute(sql`select tribe_id from public.messaging_usage_policies where tribe_id=${command.tribeId} for update`);
    await this.assertAuthorized(database, command, authorize);
    const original = (await database.execute<OriginalGroupDelivery>(sql`select id,connection_id,connection_version,environment,security_epoch,purpose,channel,source_resource_id,notification_group_id,notification_group_audience,recipient_ref,actor_user_id,recovery_of_delivery_id,idempotency_key,queued_usage_policy_version,
      (extract(epoch from created_at)*${MICROSECONDS_PER_SECOND})::bigint::text as created_microseconds,(extract(epoch from deadline_at)*${MICROSECONDS_PER_SECOND})::bigint::text as deadline_microseconds,
      frozen_intent,payload_mac_key_id,payload_fingerprint from public.message_deliveries where id=${command.originalDeliveryId} and tribe_id=${command.tribeId}`)).rows[0];
    if (!original || !original.notification_group_id || !original.notification_group_audience || original.purpose !== NOTIFICATION_DELIVERY_RECOVERY_PURPOSE || original.channel !== MESSAGING_PUBLIC_CHANNEL.email || original.source_resource_id !== original.notification_group_id) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
    const config = await this.readSecurityConfig();
    this.assertSecurity(config, original);
    const group = await readAdmissionNotificationGroup(database, command.tribeId, original.notification_group_id);
    if (!group || !hasReadableAdmissionNotificationEmailIntent(original.frozen_intent)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
    const facts = await new PostgresAdmissionNotificationGroupReader(database, authorize, this.readSecurityConfig).read(group);
    const plan = resolveAdmissionNotificationGroupAuthority({ tribeId: command.tribeId, groupId: original.notification_group_id, recipientUserId: original.recipient_ref, audience: original.notification_group_audience }, facts.group, facts.members, facts.nowMicroseconds);
    if (plan.status !== ADMISSION_NOTIFICATION_GROUP_AUTHORITY_CURRENT) throw new AdmissionOperationError(plan.reason === ADMISSION_NOTIFICATION_GROUP_REASON.deadlineExpired ? ADMISSION_ERROR_CODE.challengeExpired : plan.reason === ADMISSION_NOTIFICATION_GROUP_REASON.capabilityUnavailable ? ADMISSION_ERROR_CODE.connectionIncomplete : ADMISSION_ERROR_CODE.resourceUnavailable);
    const intent = original.frozen_intent, resource = facts.resource;
    if (!resource || resource.connectionId !== command.connectionId || resource.connectionVersion !== command.connectionVersion || resource.contributingLeaderUserId !== command.contributingLeaderUserId || resource.senderId !== command.senderId || resource.queuedUsagePolicyVersion !== command.queuedUsagePolicyVersion) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.connectionIncomplete);
    if (intent.groupId !== group.id || intent.groupVersion !== facts.group?.version || intent.channel !== original.channel || Number(original.deadline_microseconds) !== plan.deadlineAtMicroseconds || !admissionNotificationManifestsMatch(plan.manifest, intent.manifest)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
    const destinations = new Set(facts.members.map((member) => member.normalizedEmail)), normalizedEmail = destinations.size === 1 ? [...destinations][0] : null;
    if (!normalizedEmail) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
    const scope: AdmissionNotificationEmailIntentScope = { tribeId: command.tribeId, deliveryId: original.id, originalDeliveryId: original.recovery_of_delivery_id, connectionId: original.connection_id, connectionVersion: original.connection_version, recipientUserId: original.recipient_ref, idempotencyKey: original.idempotency_key, queuedUsagePolicyVersion: original.queued_usage_policy_version, createdAtMicroseconds: Number(original.created_microseconds), deadlineAtMicroseconds: Number(original.deadline_microseconds) };
    await assertMessagingAuthenticatedMacKeyMaterial(database, config, MESSAGING_KEY_PURPOSE.operationPayload);
    if (!await this.authentic(config, original, scope, intent, normalizedEmail)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
    await this.assertAuthorized(database, command, authorize);
    const current = await this.readSecurityConfig();
    this.assertSecurity(current, original);
    if (!current.keyrings[MESSAGING_KEY_PURPOSE.credential].keys.has(resource.credentialKeyId) || !await this.authentic(current, original, scope, intent, normalizedEmail)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.connectionIncomplete);
    const now = await admissionNotificationNow(database);
    if (now < scope.createdAtMicroseconds || now >= scope.deadlineAtMicroseconds) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.challengeExpired);
    return { original, intent, scope, normalizedEmail, credentialKeyId: resource.credentialKeyId, config: current };
  }

  /** @param database - Current original ledger transaction. @param command - Fixed original and locked replacement. @param authorize - Current native human authority. @returns Complete rebound content without changing its source, copy, member inventory or deadline. */
  async prepare(database: RequestDatabase, command: NotificationGroupRecoveryContentCommand, authorize: NotificationGroupRecoveryAuthorizer): Promise<PreparedNotificationGroupRecoveryContent> {
    return this.checked(async () => {
      const facts = await this.readCurrent(database, command, authorize), createdAtMicroseconds = await admissionNotificationNow(database);
      const content = projectAdmissionNotificationEmailContent({ ...facts.intent, senderId: command.senderId });
      const sealed = await createAdmissionNotificationEmailIntentMac(facts.config).seal({ tribeId: command.tribeId, deliveryId: command.recoveryDeliveryId, originalDeliveryId: command.originalDeliveryId, connectionId: command.connectionId, connectionVersion: command.connectionVersion, contributingLeaderUserId: command.contributingLeaderUserId, recipientUserId: facts.original.recipient_ref, normalizedRecipientEmail: facts.normalizedEmail, idempotencyKey: command.idempotencyKey, queuedUsagePolicyVersion: command.queuedUsagePolicyVersion, createdAtMicroseconds, deadlineAtMicroseconds: facts.scope.deadlineAtMicroseconds, content });
      return { groupId: facts.intent.groupId, audience: facts.intent.manifest.identity.audience, createdAtMicroseconds, deadlineAtMicroseconds: facts.scope.deadlineAtMicroseconds, frozenIntent: sealed.intent, keyId: sealed.keyId, mac: sealed.mac };
    });
  }

  /** @param database - Existing transaction at the caller's final fence. @param command - Original fixed replacement. @param prepared - Complete signed child, never a durable authority token. @param authorize - Current native authority. @returns After current full-source, target, crypto and post-crypto deadline checks. */
  async assertCurrent(database: RequestDatabase, command: NotificationGroupRecoveryContentCommand, prepared: PreparedNotificationGroupRecoveryContent, authorize: NotificationGroupRecoveryAuthorizer): Promise<void> {
    return this.checked(async () => {
      const facts = await this.readCurrent(database, command, authorize), intent = prepared.frozenIntent;
      if (!hasReadableAdmissionNotificationEmailIntent(intent) || intent.format !== ADMISSION_NOTIFICATION_EMAIL_INTENT_FORMAT || intent.groupId !== prepared.groupId || prepared.groupId !== facts.intent.groupId || prepared.audience !== facts.original.notification_group_audience || prepared.deadlineAtMicroseconds !== facts.scope.deadlineAtMicroseconds || !admissionNotificationManifestsMatch(intent.manifest, facts.intent.manifest) || intent.subject !== facts.intent.subject || intent.text !== facts.intent.text || intent.href !== facts.intent.href || intent.senderId !== command.senderId) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
      const context = { tribeId: command.tribeId, deliveryId: command.recoveryDeliveryId, originalDeliveryId: command.originalDeliveryId, connectionId: command.connectionId, connectionVersion: command.connectionVersion, contributingLeaderUserId: command.contributingLeaderUserId, recipientUserId: facts.original.recipient_ref, normalizedRecipientEmail: facts.normalizedEmail, idempotencyKey: command.idempotencyKey, queuedUsagePolicyVersion: command.queuedUsagePolicyVersion, createdAtMicroseconds: prepared.createdAtMicroseconds, deadlineAtMicroseconds: prepared.deadlineAtMicroseconds, intent };
      const current = await this.readSecurityConfig();
      this.assertSecurity(current, facts.original);
      if (!current.keyrings[MESSAGING_KEY_PURPOSE.credential].keys.has(facts.credentialKeyId) || !await createAdmissionNotificationEmailIntentMac(current).verify(context, prepared)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.connectionIncomplete);
      await this.assertAuthorized(database, command, authorize);
      const now = await admissionNotificationNow(database);
      if (now < prepared.createdAtMicroseconds || now >= prepared.deadlineAtMicroseconds) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.challengeExpired);
    });
  }
}
