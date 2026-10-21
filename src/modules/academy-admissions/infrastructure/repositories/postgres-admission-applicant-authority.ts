/** Revalidates the applicant's actor, tribe, account and live session, reusing within one transaction the locks its first check took. @module postgres-admission-applicant-authority */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { AdmissionVerificationAccountScope } from "../../domain/repositories/admission-contact-verification";
import { PostgresAuthenticatedAccountProvider } from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import { isAuthenticatedSessionLive } from "@/src/modules/auth/domain/policies/authenticated-session-liveness";
import { AdmissionOperationError } from "../../domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { ADMISSION_VERIFICATION_PURPOSE } from "../../constants/admission-eligibility";

/** Only the facts the applicant owners consume; both come from rows this transaction holds `FOR SHARE`. */
export type AdmissionApplicantAuthority = { userId: string; normalizedEmail: string };
/** Held authority of one transaction: the keys whose full check ran outside a savepoint, plus whether a savepoint section is open. */
type HeldApplicantAuthority = { keys: Set<string>; savepointDepth: number };
/** Only transactions opened through `withReusedAdmissionApplicantAuthority` register here; the entry dies with its scope. */
const heldApplicantAuthority = new WeakMap<RequestDatabase, HeldApplicantAuthority>();

/**
 * Lets repeated applicant checks of one transaction reuse the locks its first full check took.
 *
 * A full check takes, in this order, the tribe, the user and the session `FOR SHARE`, projects the
 * account and samples the database clock last. Nobody else can update or delete those rows before
 * COMMIT, so a later check with the same actor, session and tribe re-reads, in one statement, only
 * what the locks cannot freeze: the transaction actor and the database clock (against the session
 * deadline, re-read from the locked row together with the email).
 *
 * @param database - Transaction of an applicant owner.
 * @param run - The owner's work in that transaction.
 * @returns Its result; the held authority is forgotten when it settles.
 */
export async function withReusedAdmissionApplicantAuthority<Result>(database: RequestDatabase, run: () => Promise<Result>): Promise<Result> {
  if (heldApplicantAuthority.has(database)) return run();
  heldApplicantAuthority.set(database, { keys: new Set(), savepointDepth: 0 });
  try { return await run(); } finally { heldApplicantAuthority.delete(database); }
}

/**
 * Runs a section that may `ROLLBACK TO SAVEPOINT`, which releases every lock taken after the savepoint.
 *
 * Authority registered before the section keeps its locks (they predate the savepoint) and stays
 * reusable inside it; a full check that runs inside the section does not register, so no later check
 * reuses a lock that a rollback may have released.
 * @param database - Transaction that opens the savepoint inside `run`.
 * @param run - The savepoint section.
 * @returns Its result.
 */
export async function withAdmissionApplicantSavepointSection<Result>(database: RequestDatabase, run: () => Promise<Result>): Promise<Result> {
  const held = heldApplicantAuthority.get(database);
  if (!held) return run();
  held.savepointDepth += 1;
  try { return await run(); } finally { held.savepointDepth -= 1; }
}

/** @param context - Server-resolved scope. @returns Key of the authority held for this actor, session and tribe. */
function heldApplicantAuthorityKey(context: AdmissionVerificationAccountScope): string {
  return `${context.userId}:${context.sessionId}:${context.tribeId}`;
}

/**
 * Holds tribe, user and session before any applicant resource and confirms the current account and live session.
 * @param database - Transaction whose actual application actor must match the context.
 * @param context - Original server-derived account, session and tribe.
 * @returns The applicant facts after the database clock is sampled past every lock wait.
 * @throws AdmissionOperationError for another actor or purpose, a missing tribe, or a missing or expired session.
 */
export async function authorizeAdmissionApplicant(database: RequestDatabase, context: AdmissionVerificationAccountScope): Promise<AdmissionApplicantAuthority> {
  if (context.purpose !== ADMISSION_VERIFICATION_PURPOSE.admission) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.permissionDenied);
  const held = heldApplicantAuthority.get(database), key = heldApplicantAuthorityKey(context);
  if (held?.keys.has(key)) return reuseHeldApplicantAuthority(database, context);
  const actor = (await database.execute<{ actor: string | null }>(sql`select public.current_app_user_id() as actor`)).rows[0]?.actor;
  if (actor !== context.userId) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.permissionDenied);
  if (!(await database.execute(sql`select id from public.tribes where id=${context.tribeId} for share`)).rows[0]) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
  await database.execute(sql`select id from public."user" where id=${context.userId} for share`);
  await database.execute(sql`select id from public.session where id=${context.sessionId} and "userId"=${context.userId} for share`);
  const accounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId: context.userId, sessionId: context.sessionId }), (_identity, run) => run(database));
  const account = await accounts.getAuthenticatedAccount(), now = new Date((await database.execute<{ now: Date | string }>(sql`select clock_timestamp() as now`)).rows[0].now);
  if (!account || account.userId !== context.userId || account.session.id !== context.sessionId || !isAuthenticatedSessionLive(account.session.expiresAt, now)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
  if (held && held.savepointDepth === 0) held.keys.add(key);
  return { userId: account.userId, normalizedEmail: account.normalizedEmail };
}

/**
 * Revalidates, in one statement, what the held row locks cannot freeze: the transaction actor and the session deadline against the database clock.
 * @param database - Transaction that already holds this authority's locks.
 * @param context - Server-resolved scope.
 * @returns The applicant facts, re-read from the locked rows.
 */
async function reuseHeldApplicantAuthority(database: RequestDatabase, context: AdmissionVerificationAccountScope): Promise<AdmissionApplicantAuthority> {
  const current = (await database.execute<{ actor: string | null; normalized_email: string | null; expires_at: Date | string | null; now: Date | string }>(sql`select public.current_app_user_id() as actor,(select lower(btrim(account_user.email)) from public."user" account_user where account_user.id=${context.userId}) as normalized_email,(select current_session."expiresAt" from public.session current_session where current_session.id=${context.sessionId} and current_session."userId"=${context.userId}) as expires_at,clock_timestamp() as now`)).rows[0];
  if (current?.actor !== context.userId) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.permissionDenied);
  if (!current.normalized_email || !current.expires_at || !isAuthenticatedSessionLive(new Date(current.expires_at), new Date(current.now))) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
  return { userId: context.userId, normalizedEmail: current.normalized_email };
}
