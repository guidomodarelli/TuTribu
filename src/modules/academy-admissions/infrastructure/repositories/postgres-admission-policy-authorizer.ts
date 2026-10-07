/** Revalidates policy leadership and exact signed recency under the original transaction. @module postgres-admission-policy-authorizer */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { AuthorizedAdmissionContext } from "../../domain/repositories/admission-authorization-reader";
import type { ReauthenticationOperation } from "@/src/modules/auth/constants/reauthentication-resources";
import { PostgresAuthenticatedAccountProvider } from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import { evaluateRecentAuthentication } from "@/src/modules/auth/domain/policies/recent-authentication";
import { isAuthenticatedSessionLive } from "@/src/modules/auth/domain/policies/authenticated-session-liveness";
import { AdmissionOperationError } from "../../domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { ADMISSION_ACTION } from "../../constants/admission-eligibility";
import { TRIBE_MEMBER_ROLE } from "@/src/modules/tribes/constants/tribe-member-role";
import { TRIBE_MEMBERSHIP_STATUS } from "@/src/modules/tribes/constants/tribe-page-access";

/** @param database - Original guarded transaction. @returns Authoritative time sampled after preceding waits. */
export async function admissionPolicyDatabaseNow(database: RequestDatabase): Promise<Date> {
  return new Date((await database.execute<{ now: Date | string }>(sql`select clock_timestamp() as now`)).rows[0].now);
}

/**
 * Holds tribe, native account/session and canonical leadership before policy/ledger resources.
 * @param database - Transaction whose actual application actor must match the context.
 * @param context - Private server-resolved request scope, never a client role.
 * @param operation - Exact server-selected mutation purpose; absent for read-only metadata.
 * @returns Nothing while current leader, session and necessary recency remain valid.
 */
export async function authorizeAdmissionPolicy(database: RequestDatabase, context: AuthorizedAdmissionContext, operation?: ReauthenticationOperation): Promise<void> {
  const actor = (await database.execute<{ actor: string | null }>(sql`select public.current_app_user_id() as actor`)).rows[0]?.actor;
  if (actor !== context.userId || context.resourceId !== context.tribeId
    || context.action !== (operation ? ADMISSION_ACTION.configurePolicy : ADMISSION_ACTION.readPolicy)
    || operation && context.sensitiveOperation !== operation) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.permissionDenied);
  const tribe = (await database.execute(sql`select id from public.tribes where id=${context.tribeId} ${operation ? sql`for update` : sql`for share`}`)).rows[0];
  if (!tribe) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
  await database.execute(sql`select id from public."user" where id=${actor} for share`);
  const session = (await database.execute(sql`select id from public.session where id=${context.sessionId} and "userId"=${actor} for share`)).rows[0];
  if (!session) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
  const accounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId: context.userId, sessionId: context.sessionId }), (_identity, run) => run(database));
  const current = await accounts.getAuthenticatedAccount();
  if (!current) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
  const leaders = (await database.execute<{ user_id: string }>(sql`select user_id from public.tribe_members where tribe_id=${context.tribeId} and role=${TRIBE_MEMBER_ROLE.leader} and status=${TRIBE_MEMBERSHIP_STATUS.active} order by user_id for share`)).rows;
  if (leaders.length !== 1 || leaders[0].user_id !== actor) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.permissionDenied);
  if (operation) {
    if (current.googleAccount) {
      await database.execute(sql`select id from public.account where id=${current.googleAccount.id} and "userId"=${actor} for share`);
      await database.execute(sql`select session_id from public.global_session_identity_bindings where session_id=${context.sessionId} and user_id=${actor} for share`);
    }
    await database.execute(sql`select intent_id from public.recent_authentication_evidence where user_id=${actor} and session_id=${context.sessionId} and tribe_id=${context.tribeId} and operation=${operation} and resource_id=${context.tribeId} for share`);
  }
  const refreshed = await accounts.getAuthenticatedAccount(), now = await admissionPolicyDatabaseNow(database);
  if (!refreshed || !isAuthenticatedSessionLive(refreshed.session.expiresAt, now)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
  if (operation) {
    if (!refreshed.googleAccount) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.reauthenticationRequired);
    const scope = { userId: actor, sessionId: context.sessionId, accountId: refreshed.googleAccount.id, subject: refreshed.googleAccount.subject, tribeId: context.tribeId, operation, resourceId: context.tribeId };
    if (!refreshed.recentAuthentication.some((evidence) => evaluateRecentAuthentication({ now, scope, evidence, sessionActive: true, currentLeaderUserId: actor }).allowed)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.reauthenticationRequired);
  }
}
