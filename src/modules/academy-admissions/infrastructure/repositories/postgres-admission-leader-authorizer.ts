/** Revalidates canonical leadership, native session and resource-bound recency before admission configuration. @module postgres-admission-leader-authorizer */
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
import type { AdmissionAction } from "../../domain/policies/admission-eligibility";

/** @param database - Original guarded transaction. @returns Authoritative time sampled after preceding waits. */
export async function admissionDatabaseNow(database: RequestDatabase): Promise<Date> {
  return new Date((await database.execute<{ now: Date | string }>(sql`select clock_timestamp() as now`)).rows[0].now);
}

/**
 * Holds tribe, native account/session and canonical leadership before policy/ledger resources.
 * @param database - Transaction whose actual application actor must match the context.
 * @param context - Private server-resolved request scope, never a client role.
 * @param scope - Server-selected action/resource and optional exact mutation purpose; read-only metadata needs no recency.
 * @returns Nothing while current leader, session and necessary recency remain valid.
 */
export async function authorizeAdmissionLeader(database: RequestDatabase, context: AuthorizedAdmissionContext, scope: { action: AdmissionAction; resourceId: string; operation?: ReauthenticationOperation }): Promise<void> {
  const operation = scope.operation;
  const actor = (await database.execute<{ actor: string | null }>(sql`select public.current_app_user_id() as actor`)).rows[0]?.actor;
  if (actor !== context.userId || context.resourceId !== scope.resourceId
    || context.action !== scope.action
    || operation && context.sensitiveOperation !== operation) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.permissionDenied);
  const tribe = (await database.execute(sql`select id from public.tribes where id=${context.tribeId} ${operation ? sql`for update` : sql`for share`}`)).rows[0];
  if (!tribe) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
  await database.execute(sql`select id from public."user" where id=${actor} for share`);
  const session = (await database.execute(sql`select id from public.session where id=${context.sessionId} and "userId"=${actor} for share`)).rows[0];
  if (!session) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
  const accounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId: context.userId, sessionId: context.sessionId }), (_identity, run) => run(database));
  const current = await accounts.getAuthenticatedAccount();
  if (!current) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
  const leadership = (await database.execute<{ locked: boolean }>(sql`select public.lock_admission_canonical_leader(${context.tribeId}) as locked`)).rows[0];
  if (leadership?.locked !== true) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.permissionDenied);
  if (operation) {
    if (current.googleAccount) {
      await database.execute(sql`select id from public.account where id=${current.googleAccount.id} and "userId"=${actor} for share`);
      await database.execute(sql`select session_id from public.global_session_identity_bindings where session_id=${context.sessionId} and user_id=${actor} for share`);
    }
    await database.execute(sql`select intent_id from public.recent_authentication_evidence where user_id=${actor} and session_id=${context.sessionId} and tribe_id=${context.tribeId} and operation=${operation} and resource_id=${scope.resourceId} for share`);
  }
  const refreshed = await accounts.getAuthenticatedAccount(), now = await admissionDatabaseNow(database);
  if (!refreshed || !isAuthenticatedSessionLive(refreshed.session.expiresAt, now)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
  if (operation) {
    if (!refreshed.googleAccount) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.reauthenticationRequired);
    const recentScope = { userId: actor, sessionId: context.sessionId, accountId: refreshed.googleAccount.id, subject: refreshed.googleAccount.subject, tribeId: context.tribeId, operation, resourceId: scope.resourceId };
    if (!refreshed.recentAuthentication.some((evidence) => evaluateRecentAuthentication({ now, scope: recentScope, evidence, sessionActive: true, currentLeaderUserId: actor }).allowed)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.reauthenticationRequired);
  }
}
