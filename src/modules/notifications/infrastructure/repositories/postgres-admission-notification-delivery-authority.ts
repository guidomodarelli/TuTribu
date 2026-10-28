/** Revalidates complete frozen group, current native recipient/resources and the exact signed outbox before use. @module postgres-admission-notification-delivery-authority */
import "server-only";
import { sql } from "drizzle-orm";
import { MICROSECONDS_PER_SECOND } from "@/src/constants/time";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import { MessagingCryptographyError } from "@/src/modules/messaging/infrastructure/encryption/messaging-cryptography-error";
import { MessagingSecretAccessError } from "@/src/modules/messaging/domain/errors/messaging-secret-access-error";
import { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";
import { MESSAGING_PUBLIC_CHANNEL } from "@/src/modules/messaging/constants/messaging-public-contract";
import { MESSAGE_DELIVERY_STATE } from "@/src/modules/messaging/constants/message-delivery";
import { NOTIFICATION_DELIVERY_RECOVERY_PURPOSE } from "@/src/modules/messaging/constants/notification-delivery-recovery";
import { MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import { assertMessagingAuthenticatedMacKeyMaterial } from "@/src/modules/messaging/infrastructure/repositories/assert-messaging-key-material";
import { assertReconciledMessagingPrivateMacKeyMaterial } from "@/src/modules/messaging/infrastructure/repositories/assert-reconciled-messaging-key-material";
import { ADMISSION_NOTIFICATION_GROUP_AUTHORITY_CURRENT, ADMISSION_NOTIFICATION_GROUP_AUTHORITY_DENIED, ADMISSION_NOTIFICATION_GROUP_AUTHORITY_REASON } from "../../constants/admission-notification-group-authority";
import { ADMISSION_NOTIFICATION_GROUP_REASON } from "../../constants/admission-notification-groups";
import type { AdmissionNotificationAudience, AdmissionNotificationGroupManifest } from "../../domain/entities/admission-notification";
import type { AdmissionNotificationEmailIntentContext } from "../../domain/entities/admission-notification-email-intent";
import type { AdmissionNotificationDeliveryAuthority, AdmissionNotificationDeliveryAuthorityResult, AdmissionNotificationDeliveryAuthorityScope, CurrentAdmissionNotificationDelivery } from "../../domain/repositories/admission-notification-delivery-authority";
import type { AdmissionNotificationGroupAuthorityReason } from "../../domain/entities/admission-notification-group-authority";
import { admissionNotificationManifestsMatch, resolveAdmissionNotificationGroupAuthority } from "../../domain/policies/admission-notification-group-authority";
import { createAdmissionNotificationEmailIntentMac } from "../encryption/admission-notification-email-intent-mac";
import { hasReadableAdmissionNotificationEmailIntent } from "../encryption/readable-admission-notification-email-intent";
import { admissionNotificationNow, PostgresAdmissionNotificationGroupReader, readAdmissionNotificationGroup } from "./admission-notification-group-reader";
import type { AdmissionNotificationCollectionAuthorizer } from "./postgres-admission-notification-collection-progress";

/** Consumes selected native fields only; no row or provider schema validation is applied. */
type DeliveryRow = { id: string; connection_id: string; connection_version: number; environment: string; security_epoch: string; purpose: string; channel: string; state: string; source_resource_id: string; notification_group_id: string | null; notification_group_audience: AdmissionNotificationAudience | null; recipient_ref: string; actor_user_id: string | null; recovery_of_delivery_id: string | null; idempotency_key: string; queued_usage_policy_version: number; created_microseconds: string; deadline_microseconds: string; frozen_intent: unknown; payload_fingerprint: Uint8Array; payload_mac_key_id: string };
/** Performs only original native work under this owner's complete resource locks, before its final authority/clock/key checks; it grants no durable permission. */
export type AdmissionNotificationLockedResourceWork = (scope: Readonly<Pick<CurrentAdmissionNotificationDelivery, "deliveryId" | "tribeId" | "connectionId" | "connectionVersion" | "contributingLeaderUserId" | "environment" | "securityEpoch">> & { readonly notificationGroupId: string }) => Promise<void>;

/** @param row - Stored delivery. @param groupId - Its notification group. @returns Whether it is still a queued email for exactly that group. */
function isQueuedGroupEmailRow(row: DeliveryRow, groupId: string): boolean {
  return row.state === MESSAGE_DELIVERY_STATE.queued && row.purpose === NOTIFICATION_DELIVERY_RECOVERY_PURPOSE && row.channel === MESSAGING_PUBLIC_CHANNEL.email && row.source_resource_id === groupId;
}

/** @param check - Frozen intent, stored row and the current group, sender and deadline. @returns Whether the signed intent still describes this exact delivery. */
function intentMatchesDelivery({ intent, row, groupId, groupVersion, senderId, deadlineAtMicroseconds }: { readonly intent: AdmissionNotificationEmailIntentContext["intent"]; readonly row: DeliveryRow; readonly groupId: string; readonly groupVersion: number | undefined; readonly senderId: string; readonly deadlineAtMicroseconds: number }): boolean {
  return intent.groupId === groupId && intent.groupVersion === groupVersion && intent.channel === row.channel && intent.senderId === senderId && Number(row.deadline_microseconds) === deadlineAtMicroseconds;
}

/** @param emails - Every member destination. @returns The single shared destination, or null when there is none or more than one. */
function singleDestination(emails: readonly (string | null)[]): string | null {
  const destinations = new Set(emails);
  return destinations.size === 1 ? [...destinations][0] : null;
}

/** Carries the original row, security scope and signed content checked again while resources stay locked. */
type LockedDeliveryConfirmation = { readonly row: DeliveryRow; readonly config: MessagingSecurityConfig; readonly payloadContext: AdmissionNotificationEmailIntentContext; readonly lockedScope: Parameters<AdmissionNotificationLockedResourceWork>[0]; readonly currentManifest: AdmissionNotificationGroupManifest; readonly frozenManifest: AdmissionNotificationGroupManifest; readonly deadlineAtMicroseconds: number };

/** Uses the caller's original short transaction, with canonical exclusive tribe/policy fences before source/resource locks. */
export class PostgresAdmissionNotificationDeliveryAuthority implements AdmissionNotificationDeliveryAuthority {
  /** @param database - Existing guarded native transaction; no checkout or RPC is created. @param authorize - Current purpose-specific backend or original-attempt authority, repeated after waits. @param readSecurityConfig - Current local environment/epoch/keys, never provider work under locks. @param whileResourceLocked - Optional same-transaction native reads after complete policy/MAC validation and before final authority, clock and material checks. */
  constructor(private readonly database: RequestDatabase, private readonly authorize: AdmissionNotificationCollectionAuthorizer, private readonly readSecurityConfig: () => Promise<MessagingSecurityConfig>, private readonly whileResourceLocked?: AdmissionNotificationLockedResourceWork) {}

  /** @param tribeId - Exact original scope. @returns After current caller purpose is confirmed. @throws MessagingSecretAccessError before private reads when authority is absent. */
  private async assertAuthorized(tribeId: string): Promise<void> {
    if (!await this.authorize(this.database, tribeId)) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.permissionDenied);
  }

  /** @param scope - Original grouped delivery, never a browser-supplied recipient or capability. @returns Current complete immutable content and transient trusted destination, or a definitive policy denial. @throws MessagingSecretAccessError for unavailable external security/material instead of silently dropping queued work. */
  async read(scope: AdmissionNotificationDeliveryAuthorityScope): Promise<AdmissionNotificationDeliveryAuthorityResult> {
    const deny = (reason: AdmissionNotificationGroupAuthorityReason): AdmissionNotificationDeliveryAuthorityResult => ({ status: ADMISSION_NOTIFICATION_GROUP_AUTHORITY_DENIED, reason });
    await this.assertAuthorized(scope.tribeId);
    if (!(await this.database.execute(sql`select id from public.tribes where id=${scope.tribeId} for update`)).rows[0]) return deny(ADMISSION_NOTIFICATION_GROUP_AUTHORITY_REASON.unavailable);
    await this.database.execute(sql`select tribe_id from public.messaging_usage_policies where tribe_id=${scope.tribeId} for update`);
    await this.assertAuthorized(scope.tribeId);
    const row = (await this.database.execute<DeliveryRow>(sql`select id,connection_id,connection_version,environment,security_epoch,purpose,channel,state,source_resource_id,notification_group_id,notification_group_audience,recipient_ref,actor_user_id,recovery_of_delivery_id,idempotency_key,queued_usage_policy_version,
      (extract(epoch from created_at)*${MICROSECONDS_PER_SECOND})::bigint::text as created_microseconds,(extract(epoch from deadline_at)*${MICROSECONDS_PER_SECOND})::bigint::text as deadline_microseconds,
      frozen_intent,payload_fingerprint,payload_mac_key_id from public.message_deliveries where id=${scope.deliveryId} and tribe_id=${scope.tribeId}`)).rows[0];
    if (!row?.notification_group_id || !row.notification_group_audience) return deny(ADMISSION_NOTIFICATION_GROUP_AUTHORITY_REASON.unavailable);
    if (!isQueuedGroupEmailRow(row, row.notification_group_id)) return deny(ADMISSION_NOTIFICATION_GROUP_REASON.scopeMismatch);
    const config = await this.readSecurityConfig();
    if (config.recoveryLocked || config.environment !== row.environment || config.securityEpoch !== row.security_epoch) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.connectionIncomplete);
    const group = await readAdmissionNotificationGroup(this.database, scope.tribeId, row.notification_group_id);
    const originalScope = { tribeId: scope.tribeId, groupId: row.notification_group_id, recipientUserId: row.recipient_ref, audience: row.notification_group_audience };
    if (!group) return deny(ADMISSION_NOTIFICATION_GROUP_AUTHORITY_REASON.unavailable);
    const facts = await new PostgresAdmissionNotificationGroupReader(this.database, this.authorize, this.readSecurityConfig).read(group);
    const plan = resolveAdmissionNotificationGroupAuthority(originalScope, facts.group, facts.members, facts.nowMicroseconds);
    if (plan.status !== ADMISSION_NOTIFICATION_GROUP_AUTHORITY_CURRENT) {
      if (plan.reason === ADMISSION_NOTIFICATION_GROUP_REASON.capabilityUnavailable) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.connectionIncomplete);
      await this.assertAuthorized(scope.tribeId);
      return deny(plan.reason);
    }
    const resource = facts.resource;
    if (resource?.connectionId !== row.connection_id || resource.connectionVersion !== row.connection_version || resource.contributingLeaderUserId !== row.actor_user_id) return deny(ADMISSION_NOTIFICATION_GROUP_AUTHORITY_REASON.connectionChanged);
    if (!hasReadableAdmissionNotificationEmailIntent(row.frozen_intent)) return deny(ADMISSION_NOTIFICATION_GROUP_AUTHORITY_REASON.payloadUnusable);
    const intent = row.frozen_intent;
    if (!intentMatchesDelivery({ intent, row, groupId: group.id, groupVersion: facts.group?.version, senderId: resource.senderId, deadlineAtMicroseconds: plan.deadlineAtMicroseconds })) return deny(ADMISSION_NOTIFICATION_GROUP_REASON.scopeMismatch);
    const normalizedEmail = singleDestination(facts.members.map((member) => member.normalizedEmail));
    if (!normalizedEmail) return deny(ADMISSION_NOTIFICATION_GROUP_REASON.emailUntrusted);
    const payloadContext: AdmissionNotificationEmailIntentContext = { tribeId: scope.tribeId, deliveryId: row.id, originalDeliveryId: row.recovery_of_delivery_id, connectionId: row.connection_id, connectionVersion: row.connection_version, contributingLeaderUserId: resource.contributingLeaderUserId, recipientUserId: row.recipient_ref, normalizedRecipientEmail: normalizedEmail, idempotencyKey: row.idempotency_key, queuedUsagePolicyVersion: row.queued_usage_policy_version, createdAtMicroseconds: Number(row.created_microseconds), deadlineAtMicroseconds: Number(row.deadline_microseconds), intent };
    const lockedScope = { deliveryId: row.id, tribeId: scope.tribeId, connectionId: row.connection_id, connectionVersion: row.connection_version, contributingLeaderUserId: resource.contributingLeaderUserId, environment: row.environment, securityEpoch: row.security_epoch, notificationGroupId: group.id };
    const lockedDenial = await this.confirmLockedDelivery({ row, config, payloadContext, lockedScope, currentManifest: plan.manifest, frozenManifest: intent.manifest, deadlineAtMicroseconds: plan.deadlineAtMicroseconds });
    if (lockedDenial !== null) return deny(lockedDenial);
    return { status: ADMISSION_NOTIFICATION_GROUP_AUTHORITY_CURRENT, delivery: { deliveryId: row.id, tribeId: scope.tribeId, connectionId: row.connection_id, connectionVersion: row.connection_version, contributingLeaderUserId: resource.contributingLeaderUserId, environment: row.environment, securityEpoch: row.security_epoch, recipientUserId: row.recipient_ref, normalizedEmail, idempotencyKey: row.idempotency_key, deadlineAtMicroseconds: plan.deadlineAtMicroseconds, intent } };
  }

  /** @param confirmation - Original row, security scope, signed context, locked scope, manifests and deadline. @returns A definitive denial reason, or null once MAC, manifest, locked work, authority, security scope and clock are all current. @throws MessagingSecretAccessError for unavailable external security/material. */
  private async confirmLockedDelivery({ row, config, payloadContext, lockedScope, currentManifest, frozenManifest, deadlineAtMicroseconds }: LockedDeliveryConfirmation): Promise<AdmissionNotificationGroupAuthorityReason | null> {
    try {
      // A repairable external key mismatch must not permanently suppress an otherwise authentic original.
      const actor = (await this.database.execute<{ actor: string | null }>(sql`select public.current_app_user_id() as actor`)).rows[0].actor;
      if (actor === null) await assertReconciledMessagingPrivateMacKeyMaterial(this.database, config, MESSAGING_KEY_PURPOSE.operationPayload);
      else await assertMessagingAuthenticatedMacKeyMaterial(this.database, config, MESSAGING_KEY_PURPOSE.operationPayload);
      if (!await createAdmissionNotificationEmailIntentMac(config).verify(payloadContext, { keyId: row.payload_mac_key_id, mac: row.payload_fingerprint })) return ADMISSION_NOTIFICATION_GROUP_AUTHORITY_REASON.payloadUnusable;
      if (!admissionNotificationManifestsMatch(currentManifest, frozenManifest)) return ADMISSION_NOTIFICATION_GROUP_AUTHORITY_REASON.manifestChanged;
      if (this.whileResourceLocked) await this.whileResourceLocked(lockedScope);
      await this.assertAuthorized(lockedScope.tribeId);
      const now = await admissionNotificationNow(this.database), current = await this.readSecurityConfig();
      if (current.recoveryLocked || current.environment !== config.environment || current.securityEpoch !== config.securityEpoch) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.connectionIncomplete);
      if (!await createAdmissionNotificationEmailIntentMac(current).verify(payloadContext, { keyId: row.payload_mac_key_id, mac: row.payload_fingerprint })) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.connectionIncomplete);
      if (now < Number(row.created_microseconds) || now >= deadlineAtMicroseconds) return ADMISSION_NOTIFICATION_GROUP_REASON.deadlineExpired;
      return null;
    } catch (error) {
      if (error instanceof MessagingCryptographyError) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.connectionIncomplete, { cause: error });
      throw error;
    }
  }
}
