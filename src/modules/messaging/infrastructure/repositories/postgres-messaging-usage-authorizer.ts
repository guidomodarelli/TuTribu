/** Revalidates tribe management independently of a connection, key or admission policy. @module postgres-messaging-usage-authorizer */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MessagingUsageContext, MessagingUsageSensitiveContext } from "@/src/modules/messaging/domain/repositories/messaging-usage-operations";
import { MessagingUsageOperationError } from "@/src/modules/messaging/domain/errors/messaging-usage-operation-error";
import { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";
import { MESSAGING_GUARD_OUTCOME } from "@/src/modules/messaging/constants/messaging-leader-guard";
import type { MessagingConnectionCreationContext } from "@/src/modules/messaging/domain/repositories/messaging-connection-management";
import type { MessagingConnectionLifecycleContext } from "@/src/modules/messaging/domain/repositories/messaging-connection-lifecycle";
import type { NotificationDeliveryRecoveryContext } from "@/src/modules/messaging/domain/repositories/notification-delivery-recovery";
import { MESSAGE_DELIVERY_REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/message-delivery-reauthentication";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";

/**
 * Holds current principal and canonical leadership through the caller's guarded transaction, in one call to `public.authorize_messaging_tribe_management`.
 * It keeps the former order: user and session `FOR SHARE` and a liveness check; for a sensitive action, its Google account and session binding;
 * the tribe (`FOR UPDATE` for connection, credential and delivery operations); the original delivery; the canonical leaders and a final liveness check.
 * Sensitive actions additionally hold their exact Google session binding; no recent account confirmation is required.
 * @param database - Existing transaction whose real actor must match the private context.
 * @param context - Current server-derived session and tribe, with the exact operation for a mutation.
 * @returns Nothing while every locked relationship and post-wait lifetime remains current.
 * @throws MessagingUsageOperationError for a closed actor, tenant, session, binding, leadership or crossed operation.
 */
export async function authorizeMessagingTribeManagement(database: RequestDatabase, context: MessagingUsageContext | MessagingUsageSensitiveContext | MessagingConnectionCreationContext | MessagingConnectionLifecycleContext | NotificationDeliveryRecoveryContext): Promise<void> {
  const sensitive = "operation" in context;
  const connectionScoped=sensitive&&(context.operation===REAUTHENTICATION_OPERATION.suspendMessagingConnection||context.operation===REAUTHENTICATION_OPERATION.disconnectMessagingConnection);
  const deliveryScoped=sensitive&&context.operation===MESSAGE_DELIVERY_REAUTHENTICATION_OPERATION.recoverNotification;
  // Evaluated here but reported by the SQL guard at the former point: after the first session liveness check.
  const sensitiveScopeMatches=!sensitive||(()=>{
    const resourceId=deliveryScoped&&"deliveryId" in context?context.deliveryId:connectionScoped&&"connectionId" in context?context.connectionId:context.tribeId;
    return connectionScoped===("connectionId" in context)&&deliveryScoped===("deliveryId" in context)&&context.resourceId===resourceId;
  })();
  const exclusive=connectionScoped||deliveryScoped||sensitive&&context.operation===REAUTHENTICATION_OPERATION.saveMessagingCredentials;
  const google=sensitive?{accountId:context.accountId,subject:context.subject}:{accountId:null,subject:null};
  const deliveryId=deliveryScoped&&"deliveryId" in context?context.deliveryId:null;
  const outcome=(await database.execute<{ outcome: string }>(sql`select outcome from public.authorize_messaging_tribe_management(${context.tribeId},${context.actorUserId},${context.sessionId},${sensitive},${sensitiveScopeMatches},${google.accountId},${google.subject},${exclusive},${deliveryId})`)).rows[0]?.outcome;
  if (outcome === MESSAGING_GUARD_OUTCOME.authorized) return;
  throw new MessagingUsageOperationError(outcome === MESSAGING_GUARD_OUTCOME.authenticationRequired ? MESSAGING_ERROR_CODE.authenticationRequired : MESSAGING_ERROR_CODE.permissionDenied);
}

/** Preserves the existing usage owner's entrypoint while sharing identical current tribe authority. */
export { authorizeMessagingTribeManagement as authorizeMessagingUsage };
