/** Revalidates tribe management independently of a connection, key or admission policy. @module postgres-messaging-usage-authorizer */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MessagingUsageContext, MessagingUsageSensitiveContext } from "@/src/modules/messaging/domain/repositories/messaging-usage-operations";
import { MessagingUsageOperationError } from "@/src/modules/messaging/domain/errors/messaging-usage-operation-error";
import { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";
import { GOOGLE_IDENTITY_PROVIDER } from "@/src/modules/auth/constants/google-identity-evidence";
import { RECENT_AUTHENTICATION_WINDOW_MS } from "@/src/modules/auth/constants/recent-authentication";
import { TRIBE_MEMBER_ROLE } from "@/src/modules/tribes/constants/tribe-member-role";
import { TRIBE_MEMBERSHIP_STATUS } from "@/src/modules/tribes/constants/tribe-page-access";
import type { MessagingConnectionCreationContext } from "@/src/modules/messaging/domain/repositories/messaging-connection-management";
import type { MessagingConnectionLifecycleContext } from "@/src/modules/messaging/domain/repositories/messaging-connection-lifecycle";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";

/**
 * Prioritizes an expired actual session over secondary Google recency failures after a wait.
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
 * Sensitive actions additionally hold their exact global binding and evidence; read does not demand recency.
 * @param database - Existing transaction whose real actor must match the private context.
 * @param context - Current server-derived session and tribe, with recency for a mutation.
 * @returns Nothing while every locked relationship and post-wait lifetime remains current.
 * @throws MessagingUsageOperationError for a closed actor, tenant, session, leadership or recency.
 */
export async function authorizeMessagingTribeManagement(database: RequestDatabase, context: MessagingUsageContext | MessagingUsageSensitiveContext | MessagingConnectionCreationContext | MessagingConnectionLifecycleContext): Promise<void> {
  const actor = (await database.execute<{ actor: string | null }>(sql`select public.current_app_user_id() as actor`)).rows[0]?.actor;
  if (actor !== context.actorUserId) throw new MessagingUsageOperationError(MESSAGING_ERROR_CODE.permissionDenied);
  const user = (await database.execute<{ email: string }>(sql`select email from public."user" where id=${actor} for share`)).rows[0];
  const session = (await database.execute<{ expires_at: Date | string }>(sql`select "expiresAt" as expires_at from public.session where id=${context.sessionId} and "userId"=${actor} for share`)).rows[0];
  if (!user || !session) throw new MessagingUsageOperationError(MESSAGING_ERROR_CODE.authenticationRequired);
  await currentManagementSessionClock(database,session.expires_at);
  const sensitive = "operation" in context;
  const connectionScoped=sensitive&&(context.operation===REAUTHENTICATION_OPERATION.suspendMessagingConnection||context.operation===REAUTHENTICATION_OPERATION.disconnectMessagingConnection);
  if (sensitive) {
    const resourceId=connectionScoped&&"connectionId" in context?context.connectionId:context.tribeId;
    if(connectionScoped!==("connectionId" in context)||context.resourceId!==resourceId)throw new MessagingUsageOperationError(MESSAGING_ERROR_CODE.permissionDenied);
    const account = (await database.execute<{ subject: string }>(sql`select "accountId" as subject from public.account where id=${context.accountId} and "userId"=${actor} and "providerId"=${GOOGLE_IDENTITY_PROVIDER} for share`)).rows[0];
    const binding = (await database.execute(sql`select session_id from public.global_session_identity_bindings where session_id=${context.sessionId} and user_id=${actor} and account_id=${context.accountId} and provider_subject=${context.subject} and normalized_email=${user.email.trim().toLowerCase()} and invalidated_at is null for share`)).rows[0];
    if (account?.subject !== context.subject || !binding) { await currentManagementSessionClock(database,session.expires_at); throw new MessagingUsageOperationError(MESSAGING_ERROR_CODE.reauthenticationRequired); }
  }
  const tribeLock = connectionScoped||sensitive&&context.operation===REAUTHENTICATION_OPERATION.saveMessagingCredentials?sql`for update`:sql`for share`;
  const tribe = (await database.execute(sql`select id from public.tribes where id=${context.tribeId} ${tribeLock}`)).rows[0];
  if (!tribe) throw new MessagingUsageOperationError(MESSAGING_ERROR_CODE.permissionDenied);
  const leaders = (await database.execute<{ user_id: string }>(sql`select user_id from public.tribe_members where tribe_id=${context.tribeId} and role=${TRIBE_MEMBER_ROLE.leader} and status=${TRIBE_MEMBERSHIP_STATUS.active} order by user_id for share`)).rows;
  if (leaders.length !== 1 || leaders[0].user_id !== actor) throw new MessagingUsageOperationError(MESSAGING_ERROR_CODE.permissionDenied);
  if (sensitive) {
    const evidence = (await database.execute(sql`select id from public.recent_authentication_evidence where user_id=${actor} and session_id=${context.sessionId} and account_id=${context.accountId} and provider_subject=${context.subject} and tribe_id=${context.tribeId} and operation=${context.operation} and resource_id=${context.resourceId} and authenticated_at=${context.authenticatedAt} and valid_until=${context.validUntil} and invalidated_at is null limit 1 for share`)).rows[0];
    if (!evidence) { await currentManagementSessionClock(database,session.expires_at); throw new MessagingUsageOperationError(MESSAGING_ERROR_CODE.reauthenticationRequired); }
  }
  const now = await currentManagementSessionClock(database,session.expires_at);
  if (sensitive) {
    const age = now.getTime() - context.authenticatedAt.getTime();
    if (!Number.isFinite(age) || age < 0 || age >= RECENT_AUTHENTICATION_WINDOW_MS || !Number.isFinite(context.validUntil.getTime()) || now >= context.validUntil) throw new MessagingUsageOperationError(MESSAGING_ERROR_CODE.reauthenticationRequired);
  }
}

/** Preserves the existing usage owner's entrypoint while sharing identical current tribe authority. */
export { authorizeMessagingTribeManagement as authorizeMessagingUsage };
