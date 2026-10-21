/** Revalidates canonical leadership, native session and the exact operation scope before admission configuration. @module postgres-admission-leader-authorizer */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { AuthorizedAdmissionContext } from "../../domain/repositories/admission-authorization-reader";
import type { ReauthenticationOperation } from "@/src/modules/auth/constants/reauthentication-resources";
import { isAuthenticatedSessionLive } from "@/src/modules/auth/domain/policies/authenticated-session-liveness";
import { AdmissionOperationError } from "../../domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import type { AdmissionAction } from "../../domain/policies/admission-eligibility";
import { ADMISSION_LEADER_AUTHORITY_REUSE, ADMISSION_LEADER_GUARD_DENIAL, ADMISSION_LEADER_GUARD_OUTCOME, type AdmissionLeaderGuardDenialOutcome } from "../../constants/admission-leader-guard";

/**
 * @param database - Original guarded transaction.
 * @returns Authoritative time sampled after preceding waits. Inside a reused authority scope, right after a reused check and with no
 * statement in between, it is the database clock that check just sampled: no wait can have happened since.
 */
export async function admissionDatabaseNow(database: RequestDatabase): Promise<Date> {
  const latest = currentLatestCheck(database);
  if (latest) return latest.now;
  return new Date((await database.execute<{ now: Date | string }>(sql`select clock_timestamp() as now`)).rows[0].now);
}

/** Authority this transaction already locked and verified for one actor, session and tribe. */
type HeldLeaderAuthority = { exclusive: boolean; sessionExpiresAt: Date };
/** The latest reused check of a scope: its key, the statements the transaction had run when it settled, when it settled and its database clock. */
type LatestReusedCheck = { key: string; statements: number; settledAt: number; now: Date };
/** Authorities held by one transaction, and how many statements its connection has run since the scope opened. */
type HeldLeaderAuthorityScope = { authorities: Map<string, HeldLeaderAuthority>; statements: number; latest: LatestReusedCheck | null };
/** Only transactions opened through `withReusedAdmissionLeaderAuthority` register here; the entry dies with its scope. */
const heldLeaderAuthority = new WeakMap<RequestDatabase, HeldLeaderAuthorityScope>();

/** @param database - Transaction. @returns The latest reused check when no statement ran since and it settled within the consecutive window. */
function currentLatestCheck(database: RequestDatabase): LatestReusedCheck | null {
  const scope = heldLeaderAuthority.get(database), latest = scope?.latest;
  if (!scope || !latest || latest.statements !== scope.statements || performance.now() - latest.settledAt > ADMISSION_LEADER_AUTHORITY_REUSE.consecutiveWindowMs) return null;
  return latest;
}

/**
 * Lets repeated leader checks of one savepoint-free transaction reuse the locks its first full check took.
 *
 * Inside the scope, a later check with the same actor, session and tribe skips re-reading rows this
 * transaction still holds `FOR SHARE`/`FOR UPDATE` (tribe, user, session, Google account and binding),
 * which nobody else can change or delete before COMMIT. It still re-runs, in one statement, the actor
 * comparison, the canonical leadership lock (it re-counts leaders, so a concurrently promoted second
 * leader is still detected) and the session expiry against the database clock. A check needing the
 * exclusive tribe lock after only shared checks takes the full path.
 *
 * A reused check identical to the previous one, with no statement run on the transaction's connection
 * since (so no lock wait and no change by this transaction) and within
 * `ADMISSION_LEADER_AUTHORITY_REUSE.consecutiveWindowMs`, is satisfied by that previous check. Every
 * statement counts, whatever API sends it, because the scope counts them on the pg client itself.
 *
 * @param database - Transaction of a command owner that never rolls back to a savepoint, since that would release the locks.
 * @param run - The owner's work in that transaction.
 * @returns Its result; the held authority is forgotten when it settles.
 */
export async function withReusedAdmissionLeaderAuthority<Result>(database: RequestDatabase, run: () => Promise<Result>): Promise<Result> {
  if (heldLeaderAuthority.has(database)) return run();
  const scope: HeldLeaderAuthorityScope = { authorities: new Map(), statements: 0, latest: null };
  const client = database.$client, ownQuery = Object.hasOwn(client, "query"), query = client.query;
  // Counts every statement of this connection while the scope is open; restored when it settles.
  client.query = function countedQuery(this: typeof client, ...args: unknown[]) { scope.statements += 1; return Reflect.apply(query, this, args); } as typeof client.query;
  heldLeaderAuthority.set(database, scope);
  try { return await run(); } finally {
    heldLeaderAuthority.delete(database);
    if (ownQuery) client.query = query; else Reflect.deleteProperty(client, "query");
  }
}

/** @param context - Server-resolved scope. @returns Key of the authority held for this actor, session and tribe. */
function heldLeaderAuthorityKey(context: AuthorizedAdmissionContext): string {
  return `${context.userId}:${context.sessionId}:${context.tribeId}`;
}

/**
 * Holds tribe, native account/session and canonical leadership before policy/ledger resources.
 *
 * The full path is one call to `public.authorize_admission_leader`, which keeps the former
 * sequential guard's lock order (tribe, user, session, account projection, canonical leadership,
 * and for a sensitive operation the Google account and its session binding), re-projects the
 * account after every wait and samples the database clock last.
 * @param database - Transaction whose actual application actor must match the context.
 * @param context - Private server-resolved request scope, never a client role.
 * @param scope - Server-selected action/resource and optional exact mutation purpose; a mutation locks the tribe exclusively.
 * @returns Nothing while current leader and live session remain valid; no recent account confirmation is required.
 */
export async function authorizeAdmissionLeader(database: RequestDatabase, context: AuthorizedAdmissionContext, scope: { action: AdmissionAction; resourceId: string; operation?: ReauthenticationOperation }): Promise<void> {
  const operation = scope.operation;
  const held = heldLeaderAuthority.get(database)?.authorities, reusable = held?.get(heldLeaderAuthorityKey(context));
  if (reusable && (reusable.exclusive || !operation)) return reuseHeldLeaderAuthority(database, context, scope, reusable);
  if (context.resourceId !== scope.resourceId || context.action !== scope.action
    || operation && context.sensitiveOperation !== operation) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.permissionDenied);
  const guard = (await database.execute<{ outcome: string; session_expires_at: Date | string | null }>(sql`select outcome,session_expires_at from public.authorize_admission_leader(${context.tribeId},${context.userId},${context.sessionId},${Boolean(operation)})`)).rows[0];
  const denial = guard && Object.hasOwn(ADMISSION_LEADER_GUARD_DENIAL, guard.outcome) ? ADMISSION_LEADER_GUARD_DENIAL[guard.outcome as AdmissionLeaderGuardDenialOutcome] : undefined;
  if (denial) throw new AdmissionOperationError(denial);
  if (guard?.outcome !== ADMISSION_LEADER_GUARD_OUTCOME.authorized || !guard.session_expires_at) throw new Error(`authorizeAdmissionLeader failed: unknown guard outcome for tribe ${context.tribeId}`);
  held?.set(heldLeaderAuthorityKey(context), { exclusive: Boolean(operation) || reusable?.exclusive === true, sessionExpiresAt: new Date(guard.session_expires_at) });
}

/**
 * Revalidates, in one statement, what the held row locks cannot freeze: the transaction actor, canonical leadership and session expiry.
 * @param database - Transaction that already holds this authority's locks.
 * @param context - Server-resolved scope. @param scope - Requested action/resource/operation, compared exactly as the full path does.
 * @param held - Authority verified earlier in this transaction.
 * @returns Nothing while the same leader and live session remain valid.
 */
async function reuseHeldLeaderAuthority(database: RequestDatabase, context: AuthorizedAdmissionContext, scope: { action: AdmissionAction; resourceId: string; operation?: ReauthenticationOperation }, held: HeldLeaderAuthority): Promise<void> {
  if (context.resourceId !== scope.resourceId || context.action !== scope.action
    || scope.operation && context.sensitiveOperation !== scope.operation) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.permissionDenied);
  const key = heldLeaderAuthorityKey(context), owner = heldLeaderAuthority.get(database);
  if (currentLatestCheck(database)?.key === key) return;
  // The fenced subquery takes the leadership lock first, so the clock is sampled after any wait.
  const current = (await database.execute<{ actor: string | null; locked: boolean | null; now: Date | string }>(sql`select held.actor,held.locked,clock_timestamp() as now from (select public.current_app_user_id() as actor,case when public.current_app_user_id()=${context.userId} then public.lock_admission_canonical_leader(${context.tribeId}) else false end as locked offset 0) held`)).rows[0];
  if (current?.actor !== context.userId || current.locked !== true) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.permissionDenied);
  const now = new Date(current.now);
  if (!isAuthenticatedSessionLive(held.sessionExpiresAt, now)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
  if (owner) owner.latest = { key, statements: owner.statements, settledAt: performance.now(), now };
}
