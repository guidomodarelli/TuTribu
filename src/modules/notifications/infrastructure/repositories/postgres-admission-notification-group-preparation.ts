/** Commits current member disposition, complete immutable content and its original group outbox atomically. @module postgres-admission-notification-group-preparation */
import "server-only";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import { MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import { assertReconciledMessagingPrivateMacKeyMaterial } from "@/src/modules/messaging/infrastructure/repositories/assert-reconciled-messaging-key-material";
import { NOTIFICATION_DELIVERY_RECOVERY_PURPOSE } from "@/src/modules/messaging/constants/notification-delivery-recovery";
import { MESSAGING_PUBLIC_CHANNEL } from "@/src/modules/messaging/constants/messaging-public-contract";
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { toAdmissionNotificationOperationError } from "./admission-notification-operation-failure";
import { admissionNotificationPath } from "./admission-notification-path";
import { ADMISSION_NOTIFICATION_GROUP_STATE, ADMISSION_NOTIFICATION_GROUP_MEMBER_STATE } from "../../constants/admission-notification-group-storage";
import { ADMISSION_NOTIFICATION_GROUP_REASON, ADMISSION_NOTIFICATION_GROUP_STATUS } from "../../constants/admission-notification-groups";
import { ADMISSION_NOTIFICATION_PREPARATION_STATUS } from "../../constants/admission-notification-email-intent";
import type { AdmissionNotificationStoredGroup } from "../../domain/entities/admission-notification-group";
import type { AdmissionNotificationEmailCandidate, AdmissionNotificationSuppressionReason } from "../../domain/entities/admission-notification";
import type { AdmissionNotificationEmailIntentContext } from "../../domain/entities/admission-notification-email-intent";
import type { AdmissionNotificationGroupPreparation, AdmissionNotificationGroupPreparationCommand, AdmissionNotificationGroupPreparationResult } from "../../domain/repositories/admission-notification-group-preparation";
import { freezeAdmissionNotificationGroup } from "../../domain/policies/admission-notification-groups";
import { createAdmissionNotificationEmailContent } from "../../domain/policies/admission-notification-email-content";
import { createAdmissionNotificationEmailIntentMac } from "../encryption/admission-notification-email-intent-mac";
import { admissionNotificationTimestamp } from "../database/admission-notification-timestamp";
import type { AdmissionNotificationCollectionExecutor, AdmissionNotificationCollectionAuthorizer } from "./postgres-admission-notification-collection-progress";
import { admissionNotificationNow, readAdmissionNotificationGroup, PostgresAdmissionNotificationGroupReader, type AdmissionNotificationCurrentGroupMember } from "./admission-notification-group-reader";

/** @param state - Stored group state. @returns Queued for a frozen group, expired, or suppressed. */
function replayedPreparationStatus(state: AdmissionNotificationStoredGroup["state"]) {
  if (state === ADMISSION_NOTIFICATION_GROUP_STATE.frozen) return ADMISSION_NOTIFICATION_PREPARATION_STATUS.queued;
  return state === ADMISSION_NOTIFICATION_GROUP_STATE.expired ? ADMISSION_NOTIFICATION_PREPARATION_STATUS.expired : ADMISSION_NOTIFICATION_PREPARATION_STATUS.suppressed;
}

/** @param finalConfig - Security config read after writing. @param config - Original security config. @param payloadKeyId - Key that sealed the content. @param credentialKeyId - Connection credential key. @returns Whether the original scope and both keys are still current. */
function isFinalConfigCurrent(finalConfig: MessagingSecurityConfig, config: MessagingSecurityConfig, payloadKeyId: string, credentialKeyId: string): boolean {
  if (finalConfig.recoveryLocked || finalConfig.environment !== config.environment || finalConfig.securityEpoch !== config.securityEpoch) return false;
  return finalConfig.keyrings[MESSAGING_KEY_PURPOSE.operationPayload].keys.has(payloadKeyId) && finalConfig.keyrings[MESSAGING_KEY_PURPOSE.credential].keys.has(credentialKeyId);
}

/** Owns preparation only; the later dispatcher must independently revalidate every current member and exact attempt. */
export class PostgresAdmissionNotificationGroupPreparation implements AdmissionNotificationGroupPreparation {
  /** @param execute - Existing guarded owner that resolves only after commit. @param authorize - Current DB-only backend purpose, repeated after waits. @param readSecurityConfig - Local external epoch and recovery guard, never RPC under locks. @param publicAppBaseUrl - Canonical server-owned public application origin from its existing config resolver. */
  constructor(private readonly execute: AdmissionNotificationCollectionExecutor, private readonly authorize: AdmissionNotificationCollectionAuthorizer, private readonly readSecurityConfig: () => Promise<MessagingSecurityConfig>, private readonly publicAppBaseUrl: string) {}

  /** @param database - Original owner transaction. @param tribeId - Exact native tenant. @param original - Original external scope, when a mutation may be prepared. @param payloadKeyId - Newly used own key, if content was sealed. @returns After fresh authority and local security checks. */
  private async guard(database: RequestDatabase, tribeId: string, original?: MessagingSecurityConfig, payloadKeyId?: string): Promise<void> {
    if (!await this.authorize(database, tribeId)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.permissionDenied);
    if (original) {
      const current = await this.readSecurityConfig();
      if (current.recoveryLocked || current.environment !== original.environment || current.securityEpoch !== original.securityEpoch || payloadKeyId && !current.keyrings[MESSAGING_KEY_PURPOSE.operationPayload].keys.has(payloadKeyId)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.connectionIncomplete);
    }
  }

  /** @param database - Original authorized transaction. @param group - Closed original bucket. @param expectedVersion - The original open version, never the current version supplied to bypass CAS. @returns Its original minimal disposition without changing content, keys or deadline. */
  private async original(database: RequestDatabase, group: AdmissionNotificationStoredGroup, expectedVersion: number): Promise<AdmissionNotificationGroupPreparationResult> {
    if (group.version !== expectedVersion + 1) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.requestConflict);
    const delivery = (await database.execute<{ id: string }>(sql`select id from public.message_deliveries where tribe_id=${group.identity.tribeId} and notification_group_id=${group.id} and notification_group_audience=${group.identity.audience} and recipient_ref=${group.identity.recipientUserId} and recovery_of_delivery_id is null`)).rows[0];
    if (group.state === ADMISSION_NOTIFICATION_GROUP_STATE.frozen && !delivery) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
    await this.guard(database, group.identity.tribeId);
    return { groupId: group.id, groupVersion: group.version, status: replayedPreparationStatus(group.state), deliveryId: delivery?.id ?? null, reason: group.suppressionReason, replayed: true };
  }

  /** @param database - Original transaction. @param group - Original open bucket. @param reason - Closed optional-email reason. @param nowMicroseconds - Fresh post-wait native time. @returns Its committed-in-transaction terminal disposition; admission and internal notices remain unchanged. */
  private async close(database: RequestDatabase, group: AdmissionNotificationStoredGroup, reason: AdmissionNotificationSuppressionReason, nowMicroseconds: number): Promise<AdmissionNotificationGroupPreparationResult> {
    const expired = (await database.execute<{ expired: boolean | null }>(sql`select bool_and(deadline_at<=${admissionNotificationTimestamp(nowMicroseconds)}) as expired from public.admission_notification_group_members where group_id=${group.id}`)).rows[0].expired === true;
    const state = expired ? ADMISSION_NOTIFICATION_GROUP_STATE.expired : ADMISSION_NOTIFICATION_GROUP_STATE.suppressed;
    const changed = (await database.execute<{ version: number }>(sql`update public.admission_notification_groups set state=${state},version=version+1,suppression_reason=${expired ? ADMISSION_NOTIFICATION_GROUP_REASON.deadlineExpired : reason} where id=${group.id} and tribe_id=${group.identity.tribeId} and state=${ADMISSION_NOTIFICATION_GROUP_STATE.open} and version=${group.version} returning version`)).rows[0];
    if (!changed) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.requestConflict);
    return { groupId: group.id, groupVersion: changed.version, status: expired ? ADMISSION_NOTIFICATION_PREPARATION_STATUS.expired : ADMISSION_NOTIFICATION_PREPARATION_STATUS.suppressed, deliveryId: null, reason: expired ? ADMISSION_NOTIFICATION_GROUP_REASON.deadlineExpired : reason, replayed: false };
  }

  /** @param database - Original transaction. @param group - Original open bucket. @param facts - Current member plans. @returns Current candidates and the last live suppression reason, after marking every other member expired or suppressed. */
  private async settleMembers(database: RequestDatabase, group: AdmissionNotificationStoredGroup, facts: { readonly members: readonly AdmissionNotificationCurrentGroupMember[]; readonly nowMicroseconds: number }): Promise<{ candidates: AdmissionNotificationEmailCandidate[]; closingReason: AdmissionNotificationSuppressionReason }> {
    const candidates: AdmissionNotificationEmailCandidate[] = [];
    let closingReason: AdmissionNotificationSuppressionReason = ADMISSION_NOTIFICATION_GROUP_REASON.scopeMismatch;
    for (const member of facts.members) {
      if (member.plan.status === ADMISSION_NOTIFICATION_GROUP_STATUS.candidate) { candidates.push(member.plan.candidate); continue; }
      const expired = member.deadlineAtMicroseconds <= facts.nowMicroseconds;
      const reason = expired ? ADMISSION_NOTIFICATION_GROUP_REASON.deadlineExpired : member.plan.reason;
      if (!expired) closingReason = reason;
      await database.execute(sql`update public.admission_notification_group_members set state=${expired ? ADMISSION_NOTIFICATION_GROUP_MEMBER_STATE.expired : ADMISSION_NOTIFICATION_GROUP_MEMBER_STATE.suppressed},suppression_reason=${reason} where group_id=${group.id} and obligation_id=${member.obligationId} and state=${ADMISSION_NOTIFICATION_GROUP_MEMBER_STATE.pending}`);
    }
    return { candidates, closingReason };
  }

  /** @param command - Existing group and its original observed CAS; no browser contact, identity, capability or content is accepted. @returns Exact original outbox or a current deferred/closed disposition, after commit. @throws AdmissionOperationError when scope, final guards or commit confirmation fail; no automatic retry occurs. */
  async prepare(command: AdmissionNotificationGroupPreparationCommand): Promise<AdmissionNotificationGroupPreparationResult> {
    try {
      return await this.execute(async (database) => {
        await this.guard(database, command.tribeId);
        const tribe = (await database.execute<{ slug: string }>(sql`select slug from public.tribes where id=${command.tribeId} for update`)).rows[0];
        if (!tribe) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
        await this.guard(database, command.tribeId);
        const group = await readAdmissionNotificationGroup(database, command.tribeId, command.groupId);
        if (!group) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
        if (group.state !== ADMISSION_NOTIFICATION_GROUP_STATE.open) return this.original(database, group, command.expectedVersion);
        if (group.version !== command.expectedVersion) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.requestConflict);
        const config = await this.readSecurityConfig();
        await this.guard(database, command.tribeId, config);
        const facts = await new PostgresAdmissionNotificationGroupReader(database, this.authorize, this.readSecurityConfig).read(group);
        await this.guard(database, command.tribeId, config);
        if (facts.nowMicroseconds < group.identity.window.closesAtMicroseconds) return { groupId: group.id, groupVersion: group.version, status: ADMISSION_NOTIFICATION_PREPARATION_STATUS.notDue, deliveryId: null, reason: null, replayed: false };
        const unavailable = facts.members.some((member) => member.plan.status === ADMISSION_NOTIFICATION_GROUP_STATUS.suppressed && member.plan.reason === ADMISSION_NOTIFICATION_GROUP_REASON.capabilityUnavailable && member.deadlineAtMicroseconds > facts.nowMicroseconds);
        if (unavailable) return { groupId: group.id, groupVersion: group.version, status: ADMISSION_NOTIFICATION_PREPARATION_STATUS.unavailable, deliveryId: null, reason: ADMISSION_NOTIFICATION_GROUP_REASON.capabilityUnavailable, replayed: false };
        const { candidates, closingReason } = await this.settleMembers(database, group, facts);
        if (!candidates.length) {
          const result = await this.close(database, group, closingReason, await admissionNotificationNow(database));
          await this.guard(database, command.tribeId, config);
          return result;
        }
        const now = await admissionNotificationNow(database), plan = freezeAdmissionNotificationGroup(group.identity, candidates, now);
        if (plan.status !== ADMISSION_NOTIFICATION_GROUP_STATUS.frozen) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.challengeExpired);
        const resource = facts.resource;
        const destinations = new Set(facts.members.filter((member) => member.plan.status === ADMISSION_NOTIFICATION_GROUP_STATUS.candidate).map((member) => member.normalizedEmail));
        const normalizedEmail = destinations.size === 1 ? [...destinations][0] : null;
        if (!resource || !normalizedEmail) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.connectionIncomplete);
        const href = new URL(admissionNotificationPath(group.identity.audience, tribe.slug, plan.manifest.items[0].admissionRequestId), this.publicAppBaseUrl).toString();
        const content = createAdmissionNotificationEmailContent({ groupId: group.id, groupVersion: group.version + 1, manifest: plan.manifest, senderId: resource.senderId, href });
        const deliveryId = randomUUID();
        const sealingContext = { tribeId: command.tribeId, deliveryId, originalDeliveryId: null, connectionId: resource.connectionId, connectionVersion: resource.connectionVersion, contributingLeaderUserId: resource.contributingLeaderUserId, recipientUserId: group.identity.recipientUserId, normalizedRecipientEmail: normalizedEmail, idempotencyKey: deliveryId, queuedUsagePolicyVersion: resource.queuedUsagePolicyVersion, createdAtMicroseconds: now, deadlineAtMicroseconds: plan.deadlineAtMicroseconds, content };
        await assertReconciledMessagingPrivateMacKeyMaterial(database, config, MESSAGING_KEY_PURPOSE.operationPayload);
        const payload = await createAdmissionNotificationEmailIntentMac(config).seal(sealingContext);
        const intent = payload.intent;
        const payloadContext: AdmissionNotificationEmailIntentContext = { ...sealingContext, intent };
        await this.guard(database, command.tribeId, config, payload.keyId);
        await database.execute(sql`update public.admission_notification_groups set state=${ADMISSION_NOTIFICATION_GROUP_STATE.frozen},version=version+1,frozen_manifest=${JSON.stringify(plan.manifest)}::jsonb,deadline_at=${admissionNotificationTimestamp(plan.deadlineAtMicroseconds)} where id=${group.id} and tribe_id=${command.tribeId} and state=${ADMISSION_NOTIFICATION_GROUP_STATE.open} and version=${group.version}`);
        await database.execute(sql`insert into public.message_deliveries(id,tribe_id,connection_id,connection_version,environment,security_epoch,purpose,source_resource_id,notification_group_id,notification_group_audience,actor_user_id,recipient_ref,channel,idempotency_key,payload_fingerprint,payload_mac_key_id,frozen_intent,queued_usage_policy_version,created_at,due_at,deadline_at)
          values (${deliveryId},${command.tribeId},${resource.connectionId},${resource.connectionVersion},${config.environment},${config.securityEpoch},${NOTIFICATION_DELIVERY_RECOVERY_PURPOSE},${group.id},${group.id},${group.identity.audience},${resource.contributingLeaderUserId},${group.identity.recipientUserId},${MESSAGING_PUBLIC_CHANNEL.email},${deliveryId},${Buffer.from(payload.mac)},${payload.keyId},${JSON.stringify(intent)}::jsonb,${resource.queuedUsagePolicyVersion},${admissionNotificationTimestamp(now)},${admissionNotificationTimestamp(now)},${admissionNotificationTimestamp(plan.deadlineAtMicroseconds)})`);
        await this.guard(database, command.tribeId, config, payload.keyId);
        const finalNow = await admissionNotificationNow(database), finalConfig = await this.readSecurityConfig();
        if (!isFinalConfigCurrent(finalConfig, config, payload.keyId, resource.credentialKeyId)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.connectionIncomplete);
        if (!await createAdmissionNotificationEmailIntentMac(finalConfig).verify(payloadContext, payload)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.connectionIncomplete);
        if (finalNow >= plan.deadlineAtMicroseconds) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.challengeExpired);
        return { groupId: group.id, groupVersion: group.version + 1, status: ADMISSION_NOTIFICATION_PREPARATION_STATUS.queued, deliveryId, reason: null, replayed: false };
      });
    } catch (error) {
      throw toAdmissionNotificationOperationError(error);
    }
  }
}
