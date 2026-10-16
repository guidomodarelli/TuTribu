/** Prepares a complete original marked email without opening a transaction across secret or provider work. @module postgres-admission-notification-delivery-preparation */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { AuthorizedDeliveryMessagingContext, MessagingSecretStore } from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import type { NotificationDeliveryPreparation, PreparedNotificationDelivery } from "@/src/modules/messaging/infrastructure/notification-delivery-preparation";
import { authorizeMessagingSecret, messagingSecretLifetimeIsCurrent } from "@/src/modules/messaging/infrastructure/repositories/postgres-messaging-secret-authorizer";
import { MessagingSecretAccessError } from "@/src/modules/messaging/domain/errors/messaging-secret-access-error";
import { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";
import { MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import { NOTIFICATION_DELIVERY_RECOVERY_PURPOSE } from "@/src/modules/messaging/constants/notification-delivery-recovery";
import { readCurrentMarkedAdmissionNotificationDelivery } from "../messaging/admission-notification-resource-authority";

/** Keeps checkout, pool safety and commit confirmation with the original private job owner. */
export type AdmissionNotificationPreparationExecutor = <Result>(actorUserId: string | null, run: (database: RequestDatabase) => Promise<Result>) => Promise<Result>;
/** Contains only the exact original wire intent and native provider, without plaintext credential. */
type PreparedNotificationIntent = Omit<PreparedNotificationDelivery, "credential">;

/** Rechecks current group/marker on both sides of the independently authorized secret read. */
export class PostgresAdmissionNotificationDeliveryPreparation implements NotificationDeliveryPreparation {
  /** @param execute - Original actor transaction owner. @param secrets - Worker-only store with its own current marker/group guards. @param readSecurityConfig - Local external scope and keys; no remote call under locks. */
  constructor(private readonly execute: AdmissionNotificationPreparationExecutor, private readonly secrets: MessagingSecretStore, private readonly readSecurityConfig: () => Promise<MessagingSecurityConfig>) {}

  /** @param database - Existing original actor transaction. @param context - Exact already committed marker. @param signal - Remaining run deadline. @returns Current complete wire content and provider after native waits, without secret bytes. @throws MessagingSecretAccessError for missing group, stale marker, lifetime or unavailable current material. */
  private async readIntent(database: RequestDatabase, context: AuthorizedDeliveryMessagingContext, signal: AbortSignal): Promise<PreparedNotificationIntent> {
    const authority = await authorizeMessagingSecret(database, context, false, async (native, marked) => { await readCurrentMarkedAdmissionNotificationDelivery(native, marked, this.readSecurityConfig); });
    signal.throwIfAborted();
    const provider = (await database.execute<{ provider: string }>(sql`select provider from public.tenant_messaging_connections where id=${context.connectionId} and tribe_id=${context.tribeId} and is_selected and selected_version=${context.connectionVersion} for share`)).rows[0];
    signal.throwIfAborted();
    if (!provider) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.resourceUnavailable);
    // Preserve the owner's final MAC check after generic native waits; no later snapshot can bypass it.
    const delivery = await readCurrentMarkedAdmissionNotificationDelivery(database, context, async () => {
      const config = await this.readSecurityConfig();
      if (config.recoveryLocked || config.environment !== context.environment || config.securityEpoch !== context.securityEpoch || !config.keyrings[MESSAGING_KEY_PURPOSE.credential].keys.has(authority.keyId)) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.connectionIncomplete);
      return config;
    });
    const now = new Date((await database.execute<{ now: Date | string }>(sql`select clock_timestamp() as now`)).rows[0].now);
    signal.throwIfAborted();
    if (!messagingSecretLifetimeIsCurrent(authority, now)) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.resourceUnavailable);
    return { providerId: provider.provider, intent: { purpose: NOTIFICATION_DELIVERY_RECOVERY_PURPOSE, deliveryId: delivery.deliveryId, attemptId: context.attemptId, connectionId: delivery.connectionId, connectionVersion: delivery.connectionVersion, environment: delivery.environment, securityEpoch: delivery.securityEpoch, channel: delivery.intent.channel, senderId: delivery.intent.senderId, recipient: delivery.normalizedEmail, idempotencyKey: delivery.idempotencyKey, subject: delivery.intent.subject, text: delivery.intent.text } };
  }

  /** @param context - Original committed marked worker scope. @param signal - Remaining run deadline. @returns Transient original generic email and credential only after final current native revalidation. @throws MessagingSecretAccessError when authority, content, destination, provider or material changes; no alternate intent or RPC is produced. */
  async prepare(context: AuthorizedDeliveryMessagingContext, signal: AbortSignal): Promise<PreparedNotificationDelivery> {
    signal.throwIfAborted();
    const original = await this.execute(context.contributingLeaderUserId, (database) => this.readIntent(database, context, signal));
    signal.throwIfAborted();
    const credential = await this.secrets.loadAuthorizedSecret(context);
    signal.throwIfAborted();
    const current = await this.execute(context.contributingLeaderUserId, (database) => this.readIntent(database, context, signal));
    signal.throwIfAborted();
    if (JSON.stringify(original) !== JSON.stringify(current)) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.resourceUnavailable);
    return { ...original, credential };
  }
}
