/** Commits explicit notification recovery, cancellation and audit without RPC or usage resets. @module postgres-notification-delivery-recovery-repository */
import "server-only";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import { PostgresAdmissionOperationRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-operation-repository";
import { PostgresAdmissionAuditRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-audit-repository";
import { createAdmissionResourceAuditEvent } from "@/src/modules/academy-admissions/domain/entities/admission-resource-audit-event";
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { ADMISSION_REQUEST_EVENT, ADMISSION_REQUEST_STATUS } from "@/src/modules/academy-admissions/constants/admission-request";
import { ADMISSION_NOTIFICATION_AUDIENCE } from "@/src/modules/notifications/constants/admission-notifications";
import { TRIBE_MEMBER_ROLE } from "@/src/modules/tribes/constants/tribe-member-role";
import { TRIBE_MEMBERSHIP_STATUS } from "@/src/modules/tribes/constants/tribe-page-access";
import { MESSAGE_DELIVERY_REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/message-delivery-reauthentication";
import { MESSAGING_PUBLIC_CHANNEL, MESSAGING_CAPABILITY_PUBLIC_STATE, MESSAGING_CREDENTIAL_PUBLIC_STATE } from "../../constants/messaging-public-contract";
import { MESSAGING_CONNECTION_STATE } from "../../constants/messaging-connection";
import { MESSAGE_DELIVERY_STATE, MESSAGE_ATTEMPT_STATE } from "../../constants/message-delivery";
import { NOTIFICATION_DELIVERY_RECOVERY_AUDIT, NOTIFICATION_DELIVERY_RECOVERY_ERROR_BY_REASON, NOTIFICATION_DELIVERY_RECOVERY_PURPOSE } from "../../constants/notification-delivery-recovery";
import type { NotificationDeliveryRecoveryContext, NotificationDeliveryRecoveryInput, NotificationDeliveryRecoveryRepository } from "../../domain/repositories/notification-delivery-recovery";
import type { MessageDelivery } from "../../domain/entities/message-delivery";
import type { MessageDeliveryAttempt } from "../../domain/entities/message-delivery-attempt";
import { evaluateNotificationDeliveryRecovery } from "../../domain/policies/notification-delivery-recovery";
import { MessagingUsageOperationError } from "../../domain/errors/messaging-usage-operation-error";
import { notificationDeliveryRecoveryResultSchema, type NotificationDeliveryRecoveryResult } from "../../application/results/notification-delivery-recovery-result";
import type { MessagingSecurityConfig } from "../config/messaging-security-config";
import { createNotificationRecoveryPayloadMac } from "../encryption/notification-recovery-payload-mac";
import { authorizeMessagingTribeManagement } from "./postgres-messaging-usage-authorizer";
import type { NotificationGroupRecoveryContent, NotificationGroupRecoveryContentCommand, PreparedNotificationGroupRecoveryContent } from "../notification-group-recovery-content";
import { admissionNotificationTimestamp } from "@/src/modules/notifications/infrastructure/database/admission-notification-timestamp";

/** Uses one native actor for the ledger's claim, effect and original-result recovery. */
type RecoveryDatabaseExecutor = <Result>(context: NotificationDeliveryRecoveryContext, run: (database: RequestDatabase) => Promise<Result>) => Promise<Result>;
/** Consumes immutable original fields without validating a PostgreSQL row schema. */
type OriginalRow = {
  id: string; connection_id: string; connection_version: number; environment: string; security_epoch: string;
  purpose: MessageDelivery["purpose"]; state: MessageDelivery["state"]; version: number;
  source_resource_id: string; recipient_ref: string; deadline_at: Date | string;
  notification_group_id: string | null; notification_group_audience: "applicant" | "reviewer" | null;
};
/** Keeps target metadata private; credential bytes are never selected. */
type TargetRow = {
  id: string; version: number; environment: string; security_epoch: string;
  contributed_by_user_id: string; state: string; is_selected: boolean; selected_version: number | null;
  retired_at: Date | string | null;
};

/** Uses the original durable ledger and repeats native authority after every relevant wait. */
export class PostgresNotificationDeliveryRecoveryRepository implements NotificationDeliveryRecoveryRepository<NotificationDeliveryRecoveryResult> {
  /** @param execute - Original server principal's guarded native executor. @param readSecurityConfig - Current external epoch/keyring/recovery state; no SDK or remote call under locks. @param groupContent - Explicit complete-group source owner; absent composition closes group recovery without falling back to individual references. */
  constructor(private readonly execute: RecoveryDatabaseExecutor, private readonly readSecurityConfig: () => Promise<MessagingSecurityConfig>, private readonly groupContent?: NotificationGroupRecoveryContent) {}

  /** @param database - Current native transaction. @param context - Exact original-delivery global recency. @returns After current identity and all post-wait lifetimes are validated. @throws AdmissionOperationError preserving closed denial and its private cause. */
  private async authorize(database: RequestDatabase, context: NotificationDeliveryRecoveryContext): Promise<void> {
    if (context.operation !== MESSAGE_DELIVERY_REAUTHENTICATION_OPERATION.recoverNotification) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.permissionDenied);
    try { await authorizeMessagingTribeManagement(database, context); }
    catch (error) {
      if (error instanceof MessagingUsageOperationError) {
        const code = Object.values(ADMISSION_ERROR_CODE).find((candidate) => candidate === error.code) ?? ADMISSION_ERROR_CODE.unexpectedFailure;
        throw new AdmissionOperationError(code, { cause: error });
      }
      throw error;
    }
  }

  /** @param database - Current native transaction. @param context - Authorized exact tribe. @param original - Locked immutable original notification. @returns Whether the original notice still has a current authorized recipient and event, using time after recipient locks. */
  private async obligationCurrent(database: RequestDatabase, context: NotificationDeliveryRecoveryContext, original: OriginalRow): Promise<boolean> {
    const obligation = (await database.execute<{ request_id: string; applicant_user_id: string; event_type: string }>(sql`select request_id,applicant_user_id,event_type from public.academy_admission_notification_obligations where id=${original.source_resource_id} and tribe_id=${context.tribeId} for share`)).rows[0];
    if (!obligation) return false;
    const request = (await database.execute<{ status: string; expires_at: Date | string }>(sql`select status,expires_at from public.academy_admission_requests where id=${obligation.request_id} and tribe_id=${context.tribeId} and user_id=${obligation.applicant_user_id} for share`)).rows[0];
    const notice = (await database.execute<{ admission_audience: string }>(sql`select admission_audience from public.notifications where admission_obligation_id=${original.source_resource_id} and tribe_id=${context.tribeId} and recipient_user_id=${original.recipient_ref} for share`)).rows[0];
    if (!request || !notice) return false;
    if (notice.admission_audience !== ADMISSION_NOTIFICATION_AUDIENCE.applicant && notice.admission_audience !== ADMISSION_NOTIFICATION_AUDIENCE.reviewer) return false;
    if (notice.admission_audience === ADMISSION_NOTIFICATION_AUDIENCE.applicant && original.recipient_ref !== obligation.applicant_user_id) return false;
    if (notice.admission_audience === ADMISSION_NOTIFICATION_AUDIENCE.reviewer) {
      const reviewer = (await database.execute(sql`select user_id from public.tribe_members where tribe_id=${context.tribeId} and user_id=${original.recipient_ref} and role in (${TRIBE_MEMBER_ROLE.leader},${TRIBE_MEMBER_ROLE.guardian}) and status=${TRIBE_MEMBERSHIP_STATUS.active} for share`)).rows[0];
      if (!reviewer) return false;
    }
    const now = new Date((await database.execute<{ now: Date | string }>(sql`select clock_timestamp() as now`)).rows[0].now);
    if (obligation.event_type === ADMISSION_REQUEST_EVENT.pendingCreated) return request.status === ADMISSION_REQUEST_STATUS.pending && new Date(request.expires_at) > now;
    return request.status === obligation.event_type;
  }

  /** @param context - Current original-delivery recency, repeated by the ledger. @param input - Exact original/target CAS and explicit UUID/consent. @returns A single committed new lineage or the identical original replay without dispatch. */
  async recover(context: NotificationDeliveryRecoveryContext, input: NotificationDeliveryRecoveryInput) {
    if (input.confirmed !== true) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
    // Only a new staged mutation receives this final fence. Historical completed replay keeps its original result.
    let stagedOriginal: OriginalRow | null = null;
    let stagedGroup: { command: NotificationGroupRecoveryContentCommand; prepared: PreparedNotificationGroupRecoveryContent } | null = null;
    /** @param database - Exact current original transaction. @param tribeId - Existing delivery tenant. @returns Current human authority without a new checkout or durable permission token. */
    const authorizeGroup = async (database: RequestDatabase, tribeId: string): Promise<boolean> => {
      if (tribeId !== context.tribeId) return false;
      await this.authorize(database, context);
      return true;
    };
    const ledger = new PostgresAdmissionOperationRepository(
      (run) => this.execute(context, run),
      async (database) => {
        await this.authorize(database, context);
        if (stagedOriginal) {
          const currentSecurity = await this.readSecurityConfig();
          if (currentSecurity.recoveryLocked || currentSecurity.environment !== stagedOriginal.environment || currentSecurity.securityEpoch !== stagedOriginal.security_epoch) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.connectionIncomplete);
          if (stagedGroup && this.groupContent) await this.groupContent.assertCurrent(database, stagedGroup.command, stagedGroup.prepared, authorizeGroup);
          else if (!await this.obligationCurrent(database, context, stagedOriginal)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
          await this.authorize(database, context);
          const now = new Date((await database.execute<{ now: Date | string }>(sql`select clock_timestamp() as now`)).rows[0].now);
          if (now >= new Date(stagedOriginal.deadline_at)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.challengeExpired);
        }
        return true;
      },
      this.readSecurityConfig,
    );
    const command = {
      actorUserId: context.actorUserId, tribeId: context.tribeId,
      operationType: MESSAGE_DELIVERY_REAUTHENTICATION_OPERATION.recoverNotification,
      idempotencyKey: input.operationId,
      intent: { deliveryId: context.deliveryId, expectedVersion: input.expectedVersion, targetConnectionId: input.targetConnectionId, expectedTargetVersion: input.expectedTargetVersion, confirmed: true },
    };
    return ledger.run(command, notificationDeliveryRecoveryResultSchema, async (database, ledgerId) => {
      // The exclusive tribe fence is already held by authorization; acquire resource locks before original delivery.
      const usage = (await database.execute<{ version: number }>(sql`select version from public.messaging_usage_policies where tribe_id=${context.tribeId} for share`)).rows[0];
      const target = (await database.execute<TargetRow>(sql`select id,version,environment,security_epoch,contributed_by_user_id,state,is_selected,selected_version,retired_at from public.tenant_messaging_connections where id=${input.targetConnectionId} and tribe_id=${context.tribeId} for share`)).rows[0];
      const version = target ? (await database.execute<{ retired_at: Date | string | null; is_test_mode: boolean | null; secret_ref: string | null; credential_validation_status: string; email_sender_id: string | null }>(sql`select retired_at,is_test_mode,secret_ref,credential_validation_status,email_sender_id from public.messaging_connection_versions where connection_id=${target.id} and tribe_id=${context.tribeId} and version=${target.selected_version} for share`)).rows[0] : undefined;
      const capability = target ? (await database.execute<{ state: string; sender_id: string; tested_at: Date | string | null }>(sql`select state,sender_id,tested_at from public.messaging_connection_capabilities where connection_id=${target.id} and tribe_id=${context.tribeId} and connection_version=${target.selected_version} and channel=${MESSAGING_PUBLIC_CHANNEL.email} for share`)).rows[0] : undefined;
      const email = (await database.execute<{ enabled: boolean }>(sql`select enabled from public.admission_email_settings where tribe_id=${context.tribeId} for share`)).rows[0];
      const original = (await database.execute<OriginalRow>(sql`select id,connection_id,connection_version,environment,security_epoch,purpose,state,version,source_resource_id,recipient_ref,deadline_at,notification_group_id,notification_group_audience from public.message_deliveries where id=${context.deliveryId} and tribe_id=${context.tribeId} for update`)).rows[0];
      if (!original || !usage || !target || !version || !capability) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
      if (original.version !== input.expectedVersion) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.requestConflict);
      if (target.version !== input.expectedTargetVersion || target.selected_version === null) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.connectionConflict);
      const attempts = (await database.execute<{ id: string; state: MessageDeliveryAttempt["state"]; authorized_usage_policy_version: number | null }>(sql`select id,state,authorized_usage_policy_version from public.message_delivery_attempts where delivery_id=${original.id} order by sequence desc for share`)).rows;
      const child = (await database.execute(sql`select id from public.message_deliveries where recovery_of_delivery_id=${original.id}`)).rows[0];
      if (child) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.requestConflict);
      const config = await this.readSecurityConfig();
      if (config.recoveryLocked || config.environment !== original.environment || config.securityEpoch !== original.security_epoch) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.connectionIncomplete);
      await this.authorize(database, context);
      let now = new Date((await database.execute<{ now: Date | string }>(sql`select clock_timestamp() as now`)).rows[0].now);
      const grouped = original.notification_group_id !== null;
      const obligationCurrent = email?.enabled === true && (grouped ? this.groupContent !== undefined : await this.obligationCurrent(database, context, original));
      await this.authorize(database, context);
      now = new Date((await database.execute<{ now: Date | string }>(sql`select clock_timestamp() as now`)).rows[0].now);
      const originalAttempt = attempts.find((attempt) => attempt.state !== MESSAGE_ATTEMPT_STATE.rejected) ?? attempts[0] ?? null;
      const decision = evaluateNotificationDeliveryRecovery({
        original: { tribeId: context.tribeId, connectionId: original.connection_id, environment: original.environment, securityEpoch: original.security_epoch, purpose: original.purpose, state: original.state, deadlineAt: new Date(original.deadline_at) },
        originalAttempt,
        target: { tribeId: context.tribeId, connectionId: target.id, environment: target.environment, securityEpoch: target.security_epoch, selected: target.is_selected, active: target.state === MESSAGING_CONNECTION_STATE.active && target.retired_at === null && target.contributed_by_user_id === context.actorUserId && version.retired_at === null && version.is_test_mode === false && version.secret_ref !== null && version.credential_validation_status === MESSAGING_CREDENTIAL_PUBLIC_STATE.valid, emailPrepared: capability.state === MESSAGING_CAPABILITY_PUBLIC_STATE.prepared && capability.tested_at !== null && Boolean(capability.sender_id) && capability.sender_id === version.email_sender_id },
        obligationCurrent, now,
      });
      if (!decision.allowed) throw new AdmissionOperationError(NOTIFICATION_DELIVERY_RECOVERY_ERROR_BY_REASON[decision.reason]);
      const recoveryId = randomUUID();
      const payloadContext = { tribeId: context.tribeId, deliveryId: recoveryId, originalDeliveryId: original.id, connectionId: target.id, connectionVersion: target.selected_version, obligationId: original.source_resource_id, recipientRef: original.recipient_ref, senderId: capability.sender_id, createdAt: now, deadlineAt: new Date(original.deadline_at) };
      const groupCommand: NotificationGroupRecoveryContentCommand = { tribeId: context.tribeId, originalDeliveryId: original.id, recoveryDeliveryId: recoveryId, connectionId: target.id, connectionVersion: target.selected_version, contributingLeaderUserId: context.actorUserId, senderId: capability.sender_id, idempotencyKey: ledgerId, queuedUsagePolicyVersion: usage.version };
      const group = grouped && this.groupContent ? await this.groupContent.prepare(database, groupCommand, authorizeGroup) : null;
      const payload = group ?? await createNotificationRecoveryPayloadMac(config).sign(payloadContext);
      await this.authorize(database, context);
      const finalNow = new Date((await database.execute<{ now: Date | string }>(sql`select clock_timestamp() as now`)).rows[0].now);
      if (finalNow >= payloadContext.deadlineAt) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.challengeExpired);
      if (group && this.groupContent) await this.groupContent.assertCurrent(database, groupCommand, group, authorizeGroup);
      else if (!await this.obligationCurrent(database, context, original)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
      const state = attempts.length === 0 ? MESSAGE_DELIVERY_STATE.cancelled : MESSAGE_DELIVERY_STATE.failed;
      const changed = (await database.execute<{ version: number }>(sql`update public.message_deliveries set state=${state},lease_token=null,lease_until=null,version=version+1 where id=${original.id} and version=${input.expectedVersion} returning version`)).rows[0];
      if (!changed) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.requestConflict);
      const frozenIntent = group?.frozenIntent ?? { originalDeliveryId: original.id, obligationId: original.source_resource_id, recipientRef: original.recipient_ref, senderId: capability.sender_id };
      const createdAt = group ? admissionNotificationTimestamp(group.createdAtMicroseconds) : sql`${now}`;
      const deadlineAt = group ? admissionNotificationTimestamp(group.deadlineAtMicroseconds) : sql`${payloadContext.deadlineAt}`;
      const recovery = (await database.execute<{ version: number; state: MessageDelivery["state"]; created_at: Date | string; created_at_native: string }>(sql`insert into public.message_deliveries(id,tribe_id,connection_id,connection_version,environment,security_epoch,purpose,source_resource_id,notification_group_id,notification_group_audience,recovery_of_delivery_id,recovery_operation_id,actor_user_id,recipient_ref,channel,idempotency_key,payload_fingerprint,payload_mac_key_id,frozen_intent,queued_usage_policy_version,created_at,due_at,deadline_at) values (${recoveryId},${context.tribeId},${target.id},${target.selected_version},${config.environment},${config.securityEpoch},${NOTIFICATION_DELIVERY_RECOVERY_PURPOSE},${original.source_resource_id},${group?.groupId ?? null},${group?.audience ?? null},${original.id},${ledgerId},${context.actorUserId},${original.recipient_ref},${MESSAGING_PUBLIC_CHANNEL.email},${ledgerId},${Buffer.from(payload.mac)},${payload.keyId},${JSON.stringify(frozenIntent)}::jsonb,${usage.version},${createdAt},${createdAt},${deadlineAt}) returning version,state,created_at,created_at::text as created_at_native`)).rows[0];
      if (!recovery) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
      const auditEvent = createAdmissionResourceAuditEvent({
        tribeId: context.tribeId, actorUserId: context.actorUserId, resourceType: NOTIFICATION_DELIVERY_RECOVERY_AUDIT.resourceType, resourceId: recoveryId, operationId: ledgerId, eventType: NOTIFICATION_DELIVERY_RECOVERY_AUDIT.eventType, rule: NOTIFICATION_DELIVERY_RECOVERY_AUDIT.rule, cause: NOTIFICATION_DELIVERY_RECOVERY_AUDIT.cause, resourceVersion: recovery.version, createdAt: new Date(recovery.created_at),
        metadata: { fromState: null, toState: recovery.state, previousVersion: null, connectionId: target.id, connectionVersion: target.selected_version, channel: MESSAGING_PUBLIC_CHANNEL.email, attemptId: null, authorizedUsagePolicyVersion: null, originalDeliveryId: original.id, targetConnectionId: target.id, originalConnectionId: original.connection_id, originalConnectionVersion: original.connection_version, originalFromState: original.state, originalToState: state, previousOriginalVersion: original.version, originalVersion: changed.version, originalAttemptId: originalAttempt?.id ?? null, originalAuthorizedUsagePolicyVersion: originalAttempt?.authorized_usage_policy_version ?? null },
      });
      const audit = new PostgresAdmissionAuditRepository(database);
      if (group) await audit.appendAtNativeTimestamp(auditEvent, recovery.created_at_native);
      else await audit.append(auditEvent);
      stagedOriginal = original;
      if (group) stagedGroup = { command: groupCommand, prepared: group };
      return { originalDeliveryId: original.id, recoveryDeliveryId: recoveryId, originalVersion: changed.version, targetConnectionId: target.id, targetConnectionVersion: target.selected_version };
    });
  }
}
