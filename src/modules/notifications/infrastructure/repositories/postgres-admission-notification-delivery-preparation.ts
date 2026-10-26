/** Prepares a complete original marked email without opening a transaction across secret or provider work. @module postgres-admission-notification-delivery-preparation */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { AuthorizedDeliveryMessagingContext, MessagingSecretMaterialStore } from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import type { NotificationDeliveryPreparation, PreparedNotificationDelivery } from "@/src/modules/messaging/infrastructure/notification-delivery-preparation";
import { authorizeMessagingSecret, messagingSecretLifetimeIsCurrent, type LockedMessagingSecret } from "@/src/modules/messaging/infrastructure/repositories/postgres-messaging-secret-authorizer";
import { MessagingSecretAccessError } from "@/src/modules/messaging/domain/errors/messaging-secret-access-error";
import { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";
import { MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import { NOTIFICATION_DELIVERY_RECOVERY_PURPOSE } from "@/src/modules/messaging/constants/notification-delivery-recovery";
import { readCurrentMarkedAdmissionNotificationDelivery } from "../messaging/admission-notification-resource-authority";

/** Keeps checkout, pool safety and commit confirmation with the original private job owner. */
export type AdmissionNotificationPreparationExecutor = <Result>(actorUserId: string | null, run: (database: RequestDatabase) => Promise<Result>) => Promise<Result>;
/** Contains only the exact original wire intent and native provider, without plaintext credential. */
type PreparedNotificationIntent = Omit<PreparedNotificationDelivery, "credential">;

/** Uses the independently authorized secret read before one final native group/marker/content frame. */
export class PostgresAdmissionNotificationDeliveryPreparation implements NotificationDeliveryPreparation {
  /** @param execute - Original actor transaction owner. @param secrets - Worker-only material port that independently validates the original marker and full group before exposing plaintext. @param readSecurityConfig - Local external scope and keys; no remote call under locks. */
  constructor(private readonly execute: AdmissionNotificationPreparationExecutor, private readonly secrets: MessagingSecretMaterialStore, private readonly readSecurityConfig: () => Promise<MessagingSecurityConfig>) {}

  /** @param database - Existing original actor transaction. @param context - Exact already committed marker. @param signal - Remaining run deadline. @returns Current complete wire content and provider after native waits, without secret bytes. @throws MessagingSecretAccessError for missing group, stale marker, lifetime or unavailable current material. */
  private async readIntent(database: RequestDatabase, context: AuthorizedDeliveryMessagingContext, signal: AbortSignal): Promise<PreparedNotificationIntent> {
    signal.throwIfAborted();
    let authority: LockedMessagingSecret | undefined;
    // The owner validates and locks the complete group before generic reads, then repeats final marker/key checks afterward.
    const delivery = await readCurrentMarkedAdmissionNotificationDelivery(database, context, async () => {
      const config = await this.readSecurityConfig();
      if (config.recoveryLocked || config.environment !== context.environment || config.securityEpoch !== context.securityEpoch || authority && !config.keyrings[MESSAGING_KEY_PURPOSE.credential].keys.has(authority.keyId)) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.connectionIncomplete);
      return config;
    }, async (locked) => {
      signal.throwIfAborted();
      authority = await authorizeMessagingSecret(database, context, false, async (native, marked) => {
        if (native !== database || marked.deliveryId !== locked.deliveryId || marked.tribeId !== locked.tribeId || marked.connectionId !== locked.connectionId || marked.connectionVersion !== locked.connectionVersion || marked.contributingLeaderUserId !== locked.contributingLeaderUserId || marked.environment !== locked.environment || marked.securityEpoch !== locked.securityEpoch || marked.notificationGroupId !== locked.notificationGroupId || marked.deliveryPurpose !== NOTIFICATION_DELIVERY_RECOVERY_PURPOSE) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.resourceUnavailable);
      });
      signal.throwIfAborted();
    });
    const now = new Date((await database.execute<{ now: Date | string }>(sql`select clock_timestamp() as now`)).rows[0].now);
    signal.throwIfAborted();
    if (!authority || !messagingSecretLifetimeIsCurrent(authority, now)) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.resourceUnavailable);
    return { providerId: authority.providerId, intent: { purpose: NOTIFICATION_DELIVERY_RECOVERY_PURPOSE, deliveryId: delivery.deliveryId, attemptId: context.attemptId, connectionId: delivery.connectionId, connectionVersion: delivery.connectionVersion, environment: delivery.environment, securityEpoch: delivery.securityEpoch, channel: delivery.intent.channel, senderId: delivery.intent.senderId, recipient: delivery.normalizedEmail, idempotencyKey: delivery.idempotencyKey, subject: delivery.intent.subject, text: delivery.intent.text } };
  }

  /** @param context - Original committed marked worker scope. @param signal - Remaining run deadline. @returns Transient original generic email and credential only after final current native revalidation. @throws MessagingSecretAccessError when authority, content, destination, provider or material changes; no alternate intent or RPC is produced. */
  async prepare(context: AuthorizedDeliveryMessagingContext, signal: AbortSignal): Promise<PreparedNotificationDelivery> {
    signal.throwIfAborted();
    const material = await this.secrets.loadAuthorizedSecretMaterial(context);
    signal.throwIfAborted();
    const current = await this.execute(context.contributingLeaderUserId, (database) => this.readIntent(database, context, signal));
    signal.throwIfAborted();
    if (material.providerId !== current.providerId) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.resourceUnavailable);
    return { ...current, credential: material.credential };
  }
}
