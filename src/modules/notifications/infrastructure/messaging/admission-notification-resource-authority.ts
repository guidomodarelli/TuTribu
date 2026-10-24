/** Composes current complete-group authority at the generic marker, secret and provider seams. @module admission-notification-resource-authority */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { AuthorizedDeliveryMessagingContext } from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import type { CurrentAdmissionNotificationDelivery } from "../../domain/repositories/admission-notification-delivery-authority";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import type { QueuedMessageDeliveryResourceAuthority, MarkedMessageDeliveryResourceAuthority } from "@/src/modules/messaging/infrastructure/message-delivery-resource-authority";
import { MessagingSecretAccessError } from "@/src/modules/messaging/domain/errors/messaging-secret-access-error";
import { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";
import { MESSAGE_ATTEMPT_STATE, MESSAGE_DELIVERY_STATE, MESSAGE_RESERVATION_STATE } from "@/src/modules/messaging/constants/message-delivery";
import { MESSAGING_SECRET_DELIVERY_SCOPE } from "@/src/modules/messaging/constants/messaging-secret-access";
import { ADMISSION_NOTIFICATION_GROUP_AUTHORITY_CURRENT } from "../../constants/admission-notification-group-authority";
import { PostgresAdmissionNotificationDeliveryAuthority, type AdmissionNotificationLockedResourceWork } from "../repositories/postgres-admission-notification-delivery-authority";

/** @param database - Original guarded actor transaction. @param context - Confirmed marker, lease and consumed reservation. @param readSecurityConfig - Current local material only. @param whileResourceLocked - Optional same-transaction native work inside the validated full-resource frame, before its final checks; never an RPC or checkout. @returns Complete original content and transient destination after current group and marker checks. @throws MessagingSecretAccessError on any closed marker/resource relationship. */
export async function readCurrentMarkedAdmissionNotificationDelivery(database: RequestDatabase, context: AuthorizedDeliveryMessagingContext, readSecurityConfig: () => Promise<MessagingSecurityConfig>, whileResourceLocked?: AdmissionNotificationLockedResourceWork): Promise<CurrentAdmissionNotificationDelivery> {
    /** @param current - Original native transaction. @param tribeId - Exact existing delivery tenant. @returns Actual private principal and committed live marker, never a caller flag. */
    const authorize = async (current: typeof database, tribeId: string) => {
      if (tribeId !== context.tribeId || context.operation !== MESSAGING_SECRET_DELIVERY_SCOPE.operation) return false;
      return Boolean((await current.execute(sql`select delivery.id from public.message_deliveries delivery
        join public.message_delivery_attempts attempt on attempt.delivery_id=delivery.id and attempt.tribe_id=delivery.tribe_id and attempt.connection_id=delivery.connection_id and attempt.connection_version=delivery.connection_version
        join public.messaging_usage_reservations reservation on reservation.id=attempt.reservation_id and reservation.attempt_id=attempt.id and reservation.delivery_id=delivery.id and reservation.tribe_id=delivery.tribe_id
        where public.current_app_user_id()=${context.contributingLeaderUserId} and delivery.id=${context.deliveryId} and delivery.tribe_id=${context.tribeId}
          and delivery.connection_id=${context.connectionId} and delivery.connection_version=${context.connectionVersion} and delivery.environment=${context.environment} and delivery.security_epoch=${context.securityEpoch}
          and delivery.state=${MESSAGE_DELIVERY_STATE.queued} and delivery.lease_token=${context.leaseToken} and delivery.lease_until>clock_timestamp() and delivery.deadline_at>clock_timestamp()
          and attempt.id=${context.attemptId} and attempt.version=${context.attemptVersion} and attempt.lease_token=${context.leaseToken} and attempt.state=${MESSAGE_ATTEMPT_STATE.inFlight}
          and attempt.authorized_usage_policy_version=${context.authorizedUsagePolicyVersion} and reservation.state=${MESSAGE_RESERVATION_STATE.consumed}`)).rows[0]);
    };
    const result = await new PostgresAdmissionNotificationDeliveryAuthority(database, authorize, readSecurityConfig, whileResourceLocked).read({ tribeId: context.tribeId, deliveryId: context.deliveryId });
    if (result.status !== ADMISSION_NOTIFICATION_GROUP_AUTHORITY_CURRENT || result.delivery.connectionId !== context.connectionId || result.delivery.connectionVersion !== context.connectionVersion || result.delivery.contributingLeaderUserId !== context.contributingLeaderUserId || result.delivery.environment !== context.environment || result.delivery.securityEpoch !== context.securityEpoch) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.resourceUnavailable);
    return result.delivery;
}

/** @param readSecurityConfig - Current local external configuration, with no provider RPC. @returns Distinct pre-marker and exact marked-resource guards for existing owner transactions. */
export function createAdmissionNotificationResourceAuthority(readSecurityConfig: () => Promise<MessagingSecurityConfig>): { queued: QueuedMessageDeliveryResourceAuthority; marked: MarkedMessageDeliveryResourceAuthority } {
  const queued: QueuedMessageDeliveryResourceAuthority = async (database, scope, authorize) => (await new PostgresAdmissionNotificationDeliveryAuthority(database, authorize, readSecurityConfig).read(scope)).status === ADMISSION_NOTIFICATION_GROUP_AUTHORITY_CURRENT;
  const marked: MarkedMessageDeliveryResourceAuthority = async (database, context) => { await readCurrentMarkedAdmissionNotificationDelivery(database, context, readSecurityConfig); };
  return { queued, marked };
}
