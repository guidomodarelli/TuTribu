/** Reads and commits minimal original transport under current native human authority. @module postgres-message-reconciliation-repository */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MessageReconciliationRepository } from "../../domain/repositories/message-reconciliation-repository";
import type { MessageDeliveryReadContext } from "../../domain/repositories/message-delivery-reader";
import type { AuthorizedMessagingContext } from "../../domain/repositories/messaging-repositories";
import type { MessageStatusObservation, MessageStatusReference } from "../../domain/repositories/message-status-lookup";
import type { MessageDeliveryAttempt } from "../../domain/entities/message-delivery-attempt";
import type { MessageDelivery } from "../../domain/entities/message-delivery";
import type { z } from "zod";
import type { MessagingSecurityConfig } from "../config/messaging-security-config";
import { messageDeliverySchema } from "../../application/results/messaging-flow-result-schemas";
import { reconcileMessageAttemptState } from "../../domain/policies/message-status-observation";
import { MESSAGE_DELIVERY_REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/message-delivery-reauthentication";
import { GOOGLE_IDENTITY_PROVIDER } from "@/src/modules/auth/constants/google-identity-evidence";
import { TRIBE_MEMBER_ROLE } from "@/src/modules/tribes/constants/tribe-member-role";
import { TRIBE_MEMBERSHIP_STATUS } from "@/src/modules/tribes/constants/tribe-page-access";
import { MESSAGING_ERROR_CODE } from "../../constants/messaging-errors";
import { MESSAGE_ATTEMPT_STATE, MESSAGE_DELIVERY_STATE, MESSAGE_RECEIPT_REASON, MESSAGE_STORAGE_OPERATION, MESSAGE_DELIVERY_RECONCILIATION_AUDIT_EVENT } from "../../constants/message-delivery";
import { MessagingSecretAccessError } from "../../domain/errors/messaging-secret-access-error";
import { MessagingDeliveryStorageError } from "../../domain/errors/messaging-delivery-storage-error";
import { authorizeMessagingSecret, messagingSecretLifetimeFailure, messagingSecretLifetimeIsCurrent } from "./postgres-messaging-secret-authorizer";
import { PostgresMessageDeliveryReader } from "./postgres-message-delivery-reader";

/** Owns short current-actor transactions; no callback may perform a provider request. */
type ReconciliationDatabaseExecutor = <Result>(actorUserId: string, run: (database: RequestDatabase) => Promise<Result>) => Promise<Result>;
/** Projects only consumed immutable original identity and current CAS. */
type OriginalAttemptRow = { id: string; connection_id: string; connection_version: number; provider_message_id: string; channel: MessageStatusReference["channel"]; state: MessageDeliveryAttempt["state"]; version: number };
/** Carries the original reservation's effective policy only inside its locked status mutation. */
type CurrentAttemptRow = Omit<OriginalAttemptRow, "channel"> & { authorized_usage_policy_version: number };

/** Never changes immutable intent, reservation, usage, code material or contact proof. */
/** @param state - Reconciled attempt state. @returns The safe receipt reason stored with it. */
function receiptReason(state: string) {
  if (state === MESSAGE_ATTEMPT_STATE.delivered) return MESSAGE_RECEIPT_REASON.delivered;
  if (state === MESSAGE_ATTEMPT_STATE.rejected) return MESSAGE_RECEIPT_REASON.rejected;
  return state === MESSAGE_ATTEMPT_STATE.accepted ? MESSAGE_RECEIPT_REASON.accepted : MESSAGE_RECEIPT_REASON.unknown;
}

export class PostgresMessageReconciliationRepository implements MessageReconciliationRepository<z.infer<typeof messageDeliverySchema>> {
  /** @param execute - Existing guarded actor executor. @param readSecurityConfig - Current external recovery/environment/epoch snapshot. */
  constructor(private readonly execute: ReconciliationDatabaseExecutor, private readonly readSecurityConfig: () => Promise<MessagingSecurityConfig>) {}

  /** @param database - Current native transaction. @param context - Server-derived session and tenant. @returns Nothing for a current canonical leader. @throws MessagingSecretAccessError on insufficient or expired authority. */
  private async authorizeReader(database: RequestDatabase, context: MessageDeliveryReadContext): Promise<void> {
    const actor = (await database.execute<{ actor: string | null }>(sql`select public.current_app_user_id() as actor`)).rows[0]?.actor;
    if (actor !== context.actorUserId) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.permissionDenied);
    const principal = (await database.execute<{ email: string }>(sql`select email from public."user" where id=${context.actorUserId} for share`)).rows[0];
    const accounts = (await database.execute<{ id: string; subject: string }>(sql`select id,"accountId" as subject from public.account where "userId"=${context.actorUserId} and "providerId"=${GOOGLE_IDENTITY_PROVIDER} order by id for share`)).rows;
    const session = (await database.execute<{ expires_at: string | Date }>(sql`select "expiresAt" as expires_at from public.session where id=${context.sessionId} and "userId"=${context.actorUserId} for share`)).rows[0];
    if (!principal || !session) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.authenticationRequired);
    const binding = (await database.execute<{ account_id: string; provider_subject: string }>(sql`select account_id,provider_subject from public.global_session_identity_bindings where session_id=${context.sessionId} and user_id=${context.actorUserId} and normalized_email=${principal.email.trim().toLowerCase()} and invalidated_at is null for share`)).rows[0];
    if (!binding || !accounts.some((account) => account.id === binding.account_id && account.subject === binding.provider_subject)) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.authenticationRequired);
    if (!(await database.execute(sql`select id from public.tribes where id=${context.tribeId} for share`)).rows[0]) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.resourceUnavailable);
    const leaders = (await database.execute<{ user_id: string }>(sql`select user_id from public.tribe_members where tribe_id=${context.tribeId} and role=${TRIBE_MEMBER_ROLE.leader} and status=${TRIBE_MEMBERSHIP_STATUS.active} order by user_id for share`)).rows;
    if (leaders.length !== 1 || leaders[0].user_id !== context.actorUserId) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.permissionDenied);
    const now = new Date((await database.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now);
    if (new Date(session.expires_at) <= now) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.authenticationRequired);
  }

  /** @param context - Server session and tenant. @param deliveryId - Only browser-selected resource. @returns The latest stored original provider identity, never a client-supplied provider ID. */
  async readReference(context: MessageDeliveryReadContext, deliveryId: string): Promise<MessageStatusReference | null> {
    return this.execute(context.actorUserId, async (database) => {
      await this.authorizeReader(database, context);
      if (!(await database.execute(sql`select id from public.message_deliveries where id=${deliveryId} and tribe_id=${context.tribeId} for share`)).rows[0]) return null;
      const row = (await database.execute<OriginalAttemptRow>(sql`select attempt.id,attempt.connection_id,attempt.connection_version,attempt.provider_message_id,delivery.channel,attempt.state,attempt.version from public.message_delivery_attempts attempt inner join public.message_deliveries delivery on delivery.id=attempt.delivery_id and delivery.tribe_id=attempt.tribe_id where attempt.delivery_id=${deliveryId} and attempt.tribe_id=${context.tribeId} and attempt.provider_message_id is not null order by attempt.sequence desc limit 1 for share of attempt,delivery`)).rows[0];
      await this.authorizeReader(database, context);
      return row ? { tribeId: context.tribeId, connectionId: row.connection_id, connectionVersion: row.connection_version, deliveryId, attemptId: row.id, providerMessageId: row.provider_message_id, channel: row.channel, requestId: context.requestId } : null;
    });
  }

  /** @param context - Exact current reconciliation scope. @param reference - Immutable original provider identity. @param observation - Minimal read fact for that ID. @returns Guarded own current metadata after a monotonic transaction. @throws MessagingDeliveryStorageError when commit confirmation is unavailable. */
  async record(context: AuthorizedMessagingContext, reference: MessageStatusReference, observation: MessageStatusObservation) {
    if (context.operation !== MESSAGE_DELIVERY_REAUTHENTICATION_OPERATION.reconcile || context.tribeId !== reference.tribeId || context.connectionId !== reference.connectionId || context.connectionVersion !== reference.connectionVersion || context.resourceId !== reference.connectionId || context.requestId !== reference.requestId || observation.providerMessageId !== reference.providerMessageId) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.resourceUnavailable);
    try {
      return await this.execute(context.actorUserId, async (database) => {
        const authority = await authorizeMessagingSecret(database, context);
        const delivery = (await database.execute<{ state: MessageDelivery["state"]; version: number }>(sql`select state,version from public.message_deliveries where id=${reference.deliveryId} and tribe_id=${reference.tribeId} and connection_id=${reference.connectionId} and connection_version=${reference.connectionVersion} and environment=${context.environment} and security_epoch=${context.securityEpoch} and channel=${reference.channel} for update`)).rows[0];
        if (!delivery) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.resourceUnavailable);
        const current = (await database.execute<CurrentAttemptRow>(sql`select id,connection_id,connection_version,provider_message_id,state,version,authorized_usage_policy_version from public.message_delivery_attempts where id=${reference.attemptId} and delivery_id=${reference.deliveryId} and tribe_id=${reference.tribeId} and connection_id=${reference.connectionId} and connection_version=${reference.connectionVersion} and provider_message_id=${reference.providerMessageId} for update`)).rows[0];
        if (!current) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.resourceUnavailable);
        const security = await this.readSecurityConfig();
        if (security.recoveryLocked || security.environment !== context.environment || security.securityEpoch !== context.securityEpoch) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.connectionIncomplete);
        const now = new Date((await database.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now);
        if (!messagingSecretLifetimeIsCurrent(authority, now)) throw new MessagingSecretAccessError(messagingSecretLifetimeFailure(authority, now));
        const next = reconcileMessageAttemptState(current.state, observation.outcome);
        if (next !== current.state) {
          const reason = receiptReason(next);
          await database.execute(sql`update public.message_delivery_attempts set state=${next},safe_reason=${reason},completed_at=clock_timestamp(),version=version+1 where id=${current.id} and version=${current.version}`);
          await database.execute(sql`update public.message_deliveries set state=${next === MESSAGE_ATTEMPT_STATE.rejected ? MESSAGE_DELIVERY_STATE.failed : next},last_outcome=${reason},lease_token=null,lease_until=null,version=version+1 where id=${reference.deliveryId}`);
          await database.execute(sql`select public.record_messaging_delivery_audit(${reference.deliveryId},${delivery.state},${delivery.version},${MESSAGE_DELIVERY_RECONCILIATION_AUDIT_EVENT},${context.operation},${reason},${current.id},${current.authorized_usage_policy_version},(select completed_at from public.message_delivery_attempts where id=${current.id} and delivery_id=${reference.deliveryId}))`);
        }
        const projection = new PostgresMessageDeliveryReader((identity, run) => {
          if (identity.actorUserId !== context.actorUserId || identity.sessionId !== context.sessionId || identity.tribeId !== context.tribeId) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.permissionDenied);
          return run(database);
        });
        const value = await projection.read({ actorUserId: context.actorUserId, sessionId: context.sessionId, tribeId: context.tribeId, requestId: context.requestId }, reference.deliveryId);
        if (!value) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.resourceUnavailable);
        const finalSecurity = await this.readSecurityConfig();
        if (finalSecurity.recoveryLocked || finalSecurity.environment !== context.environment || finalSecurity.securityEpoch !== context.securityEpoch) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.connectionIncomplete);
        const finalNow = new Date((await database.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now);
        if (!messagingSecretLifetimeIsCurrent(authority, finalNow)) throw new MessagingSecretAccessError(messagingSecretLifetimeFailure(authority, finalNow));
        return messageDeliverySchema.parse(value);
      });
    } catch (error) {
      if (error instanceof MessagingSecretAccessError || error instanceof MessagingDeliveryStorageError) throw error;
      throw new MessagingDeliveryStorageError(MESSAGING_ERROR_CODE.operationUnresolved, { operation: MESSAGE_STORAGE_OPERATION.complete, deliveryId: reference.deliveryId, attemptId: reference.attemptId, cause: error });
    }
  }
}
