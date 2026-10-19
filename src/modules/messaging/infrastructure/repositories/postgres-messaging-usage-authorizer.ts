/** Revalidates tribe management independently of a connection, key or admission policy. @module postgres-messaging-usage-authorizer */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MessagingUsageContext, MessagingUsageSensitiveContext } from "@/src/modules/messaging/domain/repositories/messaging-usage-operations";
import { MessagingUsageOperationError } from "@/src/modules/messaging/domain/errors/messaging-usage-operation-error";
import { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";
import { GOOGLE_IDENTITY_PROVIDER } from "@/src/modules/auth/constants/google-identity-evidence";
import { TRIBE_MEMBER_ROLE } from "@/src/modules/tribes/constants/tribe-member-role";
import { TRIBE_MEMBERSHIP_STATUS } from "@/src/modules/tribes/constants/tribe-page-access";
import type { MessagingConnectionCreationContext } from "@/src/modules/messaging/domain/repositories/messaging-connection-management";
import type { MessagingConnectionLifecycleContext } from "@/src/modules/messaging/domain/repositories/messaging-connection-lifecycle";
import type { NotificationDeliveryRecoveryContext } from "@/src/modules/messaging/domain/repositories/notification-delivery-recovery";
import { MESSAGE_DELIVERY_REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/message-delivery-reauthentication";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";

/**
 * Prioritizes an expired actual session over secondary session-binding failures after a wait.
 * @param database - Caller transaction holding the session row lock.
 * @param expiresAt - Consumed SQL session lifetime, never a browser claim.
 * @returns Current SQL time while the locked session remains live.
 * @throws MessagingUsageOperationError when the actual session is expired or its lifetime cannot be used.
 */
async function currentManagementSessionClock(database:RequestDatabase,expiresAt:Date|string):Promise<Date> {
  const now=new Date((await database.execute<{now:Date|string}>(sql`select clock_timestamp() as now`)).rows[0].now);
  const deadline=new Date(expiresAt);
  if(!Number.isFinite(now.getTime())||!Number.isFinite(deadline.getTime())||now>=deadline)throw new MessagingUsageOperationError(MESSAGING_ERROR_CODE.authenticationRequired);
  return now;
}

/**
 * Holds current principal and canonical leadership through the caller's guarded transaction.
 * Sensitive actions additionally hold their exact Google session binding; no recent account confirmation is required.
 * @param database - Existing transaction whose real actor must match the private context.
 * @param context - Current server-derived session and tribe, with the exact operation for a mutation.
 * @returns Nothing while every locked relationship and post-wait lifetime remains current.
 * @throws MessagingUsageOperationError for a closed actor, tenant, session, binding, leadership or crossed operation.
 */
export async function authorizeMessagingTribeManagement(database: RequestDatabase, context: MessagingUsageContext | MessagingUsageSensitiveContext | MessagingConnectionCreationContext | MessagingConnectionLifecycleContext | NotificationDeliveryRecoveryContext): Promise<void> {
  const actor = (await database.execute<{ actor: string | null }>(sql`select public.current_app_user_id() as actor`)).rows[0]?.actor;
  if (actor !== context.actorUserId) throw new MessagingUsageOperationError(MESSAGING_ERROR_CODE.permissionDenied);
  const user = (await database.execute<{ email: string }>(sql`select email from public."user" where id=${actor} for share`)).rows[0];
  const session = (await database.execute<{ expires_at: Date | string }>(sql`select "expiresAt" as expires_at from public.session where id=${context.sessionId} and "userId"=${actor} for share`)).rows[0];
  if (!user || !session) throw new MessagingUsageOperationError(MESSAGING_ERROR_CODE.authenticationRequired);
  await currentManagementSessionClock(database,session.expires_at);
  const sensitive = "operation" in context;
  const connectionScoped=sensitive&&(context.operation===REAUTHENTICATION_OPERATION.suspendMessagingConnection||context.operation===REAUTHENTICATION_OPERATION.disconnectMessagingConnection);
  const deliveryScoped=sensitive&&context.operation===MESSAGE_DELIVERY_REAUTHENTICATION_OPERATION.recoverNotification;
  if (sensitive) {
    const resourceId=deliveryScoped&&"deliveryId" in context?context.deliveryId:connectionScoped&&"connectionId" in context?context.connectionId:context.tribeId;
    if(connectionScoped!==("connectionId" in context)||deliveryScoped!==("deliveryId" in context)||context.resourceId!==resourceId)throw new MessagingUsageOperationError(MESSAGING_ERROR_CODE.permissionDenied);
    const account = (await database.execute<{ subject: string }>(sql`select "accountId" as subject from public.account where id=${context.accountId} and "userId"=${actor} and "providerId"=${GOOGLE_IDENTITY_PROVIDER} for share`)).rows[0];
    const binding = (await database.execute(sql`select session_id from public.global_session_identity_bindings where session_id=${context.sessionId} and user_id=${actor} and account_id=${context.accountId} and provider_subject=${context.subject} and normalized_email=${user.email.trim().toLowerCase()} and invalidated_at is null for share`)).rows[0];
    if (account?.subject !== context.subject || !binding) { await currentManagementSessionClock(database,session.expires_at); throw new MessagingUsageOperationError(MESSAGING_ERROR_CODE.authenticationRequired); }
  }
  const tribeLock = connectionScoped||deliveryScoped||sensitive&&context.operation===REAUTHENTICATION_OPERATION.saveMessagingCredentials?sql`for update`:sql`for share`;
  const tribe = (await database.execute(sql`select id from public.tribes where id=${context.tribeId} ${tribeLock}`)).rows[0];
  if (!tribe) throw new MessagingUsageOperationError(MESSAGING_ERROR_CODE.permissionDenied);
  if(deliveryScoped&&"deliveryId" in context){
    const original=(await database.execute(sql`select id from public.message_deliveries where id=${context.deliveryId} and tribe_id=${context.tribeId}`)).rows[0];
    if(!original)throw new MessagingUsageOperationError(MESSAGING_ERROR_CODE.permissionDenied);
  }
  const leaders = (await database.execute<{ user_id: string }>(sql`select user_id from public.tribe_members where tribe_id=${context.tribeId} and role=${TRIBE_MEMBER_ROLE.leader} and status=${TRIBE_MEMBERSHIP_STATUS.active} order by user_id for share`)).rows;
  if (leaders.length !== 1 || leaders[0].user_id !== actor) throw new MessagingUsageOperationError(MESSAGING_ERROR_CODE.permissionDenied);
  await currentManagementSessionClock(database,session.expires_at);
}

/** Preserves the existing usage owner's entrypoint while sharing identical current tribe authority. */
export { authorizeMessagingTribeManagement as authorizeMessagingUsage };
