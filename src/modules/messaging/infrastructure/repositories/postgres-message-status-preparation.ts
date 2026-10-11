/** Authorizes a stored original message through existing native secret guards without a new send marker. @module postgres-message-status-preparation */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { AuthorizedMessagingContext, MessagingSecretStore } from "../../domain/repositories/messaging-repositories";
import type { MessageStatusReference } from "../../domain/repositories/message-status-lookup";
import type { MessageStatusPreparation, PreparedMessageStatusQuery } from "../zavu/message-status-preparation";
import type { OriginalMessageContextResolver } from "../../application/use-cases/reconcile-message-delivery-use-case";
import type { MessagingSecurityConfig } from "../config/messaging-security-config";
import { MESSAGE_DELIVERY_REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/message-delivery-reauthentication";
import { MESSAGING_ERROR_CODE } from "../../constants/messaging-errors";
import { MESSAGE_STATUS_LOOKUP_OPERATION } from "../../constants/message-reconciliation";
import { MESSAGING_KEY_PURPOSE } from "../../constants/messaging-cryptography";
import { MessagingSecretAccessError } from "../../domain/errors/messaging-secret-access-error";
import { ZavuInspectionError } from "../zavu/zavu-inspection-error";
import { authorizeMessagingSecret, messagingSecretLifetimeIsCurrent, type LockedMessagingSecret } from "./postgres-messaging-secret-authorizer";

/** Each callback commits before private material leaves the database boundary. */
type StatusDatabaseExecutor = <Result>(actorUserId: string, run: (database: RequestDatabase) => Promise<Result>) => Promise<Result>;

/** Reads only an authorized original message; credentials and provider payloads remain infrastructure-owned. */
export class PostgresMessageStatusPreparation implements MessageStatusPreparation {
  /** @param resolver - Current account/session/leader/resource/security and exact reconciliation recency. @param execute - Existing guarded actor transaction. @param secrets - Existing human-purpose store with its own locks and lifetime checks. @param readSecurityConfig - Current external recovery/epoch/keyrings, read again after the final SQL wait. @param clock - Server time sampled after that final external read. */
  constructor(private readonly resolver: OriginalMessageContextResolver, private readonly execute: StatusDatabaseExecutor, private readonly secrets: MessagingSecretStore, private readonly readSecurityConfig: () => Promise<MessagingSecurityConfig>, private readonly clock: () => Date = () => new Date()) {}

  /** @param reference - Original immutable message metadata from protected storage. @returns Current native authority, never authority selected by the reference itself. */
  private async resolve(reference: MessageStatusReference): Promise<AuthorizedMessagingContext> {
    const resolved = await this.resolver.execute({ tribeId: reference.tribeId, connectionId: reference.connectionId, connectionVersion: reference.connectionVersion, operation: MESSAGE_DELIVERY_REAUTHENTICATION_OPERATION.reconcile, requestId: reference.requestId });
    if (!resolved.allowed) throw new ZavuInspectionError(MESSAGE_STATUS_LOOKUP_OPERATION, resolved.failure);
    const context = resolved.context;
    if (context.tribeId !== reference.tribeId || context.connectionId !== reference.connectionId || context.connectionVersion !== reference.connectionVersion || context.resourceId !== reference.connectionId || context.operation !== MESSAGE_DELIVERY_REAUTHENTICATION_OPERATION.reconcile) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.resourceUnavailable);
    return context;
  }

  /** @param context - Actual current native human scope. @param reference - Original stored message identity. @returns The original sender only after guarded storage and a clock sampled after waits. */
  private async readOwned(context: AuthorizedMessagingContext, reference: MessageStatusReference): Promise<{ senderId: string; authority: LockedMessagingSecret }> {
    return this.execute(context.actorUserId, async (database) => {
      const authority = await authorizeMessagingSecret(database, context);
      const row = (await database.execute<{ sender_id: string | null; channel: string }>(sql`
        select delivery.frozen_intent->>'senderId' as sender_id, delivery.channel
        from public.message_delivery_attempts attempt
        inner join public.message_deliveries delivery on delivery.id=attempt.delivery_id and delivery.tribe_id=attempt.tribe_id
        where attempt.id=${reference.attemptId} and attempt.delivery_id=${reference.deliveryId}
          and attempt.tribe_id=${reference.tribeId} and attempt.connection_id=${reference.connectionId}
          and attempt.connection_version=${reference.connectionVersion} and attempt.provider_message_id=${reference.providerMessageId}
          and delivery.connection_id=${context.connectionId} and delivery.connection_version=${context.connectionVersion}
          and delivery.environment=${context.environment} and delivery.security_epoch=${context.securityEpoch}
        for share of attempt, delivery
      `)).rows[0];
      if (!row?.sender_id || row.channel !== reference.channel) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.resourceUnavailable);
      const now = new Date((await database.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now);
      if (!messagingSecretLifetimeIsCurrent(authority, now)) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.reauthenticationRequired);
      return { senderId: row.sender_id, authority };
    });
  }

  /** @param reference - Protected original delivery/attempt/provider identity. @param signal - Exact read cancellation. @returns Transient material after repeated native authorization, with no held transaction or new marker. */
  async prepare(reference: MessageStatusReference, signal: AbortSignal): Promise<PreparedMessageStatusQuery> {
    signal.throwIfAborted();
    const original = Object.freeze({ ...reference }), context = await this.resolve(original);
    signal.throwIfAborted();
    const initial = await this.readOwned(context, original);
    signal.throwIfAborted();
    const credential = await this.secrets.loadAuthorizedSecret(context);
    signal.throwIfAborted();
    const current = await this.resolve(original);
    if (current.actorUserId !== context.actorUserId || current.sessionId !== context.sessionId || current.accountId !== context.accountId || current.subject !== context.subject || current.environment !== context.environment || current.securityEpoch !== context.securityEpoch || current.secretRef !== context.secretRef) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.permissionDenied);
    const latest = await this.readOwned(current, original);
    signal.throwIfAborted();
    if (latest.senderId !== initial.senderId || latest.authority.keyId !== initial.authority.keyId) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.resourceUnavailable);
    const security = await this.readSecurityConfig();
    signal.throwIfAborted();
    if (security.recoveryLocked || security.environment !== current.environment || security.securityEpoch !== current.securityEpoch || !security.keyrings[MESSAGING_KEY_PURPOSE.credential].keys.has(latest.authority.keyId)) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.connectionIncomplete);
    if (!messagingSecretLifetimeIsCurrent(latest.authority, this.clock())) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.reauthenticationRequired);
    return { reference: original, credential, senderId: latest.senderId };
  }
}
