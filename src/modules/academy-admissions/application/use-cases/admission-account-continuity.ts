/** Pins the native account that starts an admission read or command and rejects results a different or expired session would receive. @module admission-account-continuity */
import type { AuthenticatedAccountProvider } from "@/src/modules/auth/domain/repositories/authenticated-account-provider";
import type { AuthenticatedAccount } from "@/src/modules/auth/domain/entities/authenticated-account";
import { isAuthenticatedSessionLive } from "@/src/modules/auth/domain/policies/authenticated-session-liveness";
import { AdmissionOperationError } from "../../domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";

/**
 * Reads the current account for flows that also serve anonymous visitors.
 * @param accounts - Current native identity.
 * @param clock - Fresh time for the session liveness check.
 * @returns The live account, or null for an anonymous read.
 * @throws AdmissionOperationError when a signed-in session already expired.
 */
export async function readLiveAdmissionAccount(accounts: AuthenticatedAccountProvider, clock: () => Date): Promise<AuthenticatedAccount | null> {
  const account = await accounts.getAuthenticatedAccount();
  if (account && !isAuthenticatedSessionLive(account.session.expiresAt, clock())) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
  return account;
}

/**
 * Reads the current account for flows that require a signed-in actor.
 * @param accounts - Current native identity.
 * @param clock - Fresh time for the session liveness check.
 * @returns The live account.
 * @throws AdmissionOperationError when nobody is signed in or the session expired.
 */
export async function requireLiveAdmissionAccount(accounts: AuthenticatedAccountProvider, clock: () => Date): Promise<AuthenticatedAccount> {
  const account = await accounts.getAuthenticatedAccount();
  if (!account || !isAuthenticatedSessionLive(account.session.expiresAt, clock())) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
  return account;
}

/** Account that finished the reads and the render time sampled right after it. */
type ConfirmedAdmissionAccount<Account> = { current: Account; now: Date };

/**
 * Confirms, after every awaited read, that the same live session (or the same anonymous visitor) is still the one being served.
 * @param accounts - Current native identity.
 * @param first - Account read before the facts; null for an anonymous read.
 * @param clock - Fresh time sampled after the second account read.
 * @returns The current account and the render time.
 * @throws AdmissionOperationError when the account, session or liveness changed.
 */
export async function confirmSameAdmissionAccount(accounts: AuthenticatedAccountProvider, first: AuthenticatedAccount, clock: () => Date): Promise<ConfirmedAdmissionAccount<AuthenticatedAccount>>;
export async function confirmSameAdmissionAccount(accounts: AuthenticatedAccountProvider, first: AuthenticatedAccount | null, clock: () => Date): Promise<ConfirmedAdmissionAccount<AuthenticatedAccount | null>>;
export async function confirmSameAdmissionAccount(accounts: AuthenticatedAccountProvider, first: AuthenticatedAccount | null, clock: () => Date): Promise<ConfirmedAdmissionAccount<AuthenticatedAccount | null>> {
  const current = await accounts.getAuthenticatedAccount(), now = clock();
  const kept = first ? current?.userId === first.userId && current.session.id === first.session.id && isAuthenticatedSessionLive(current.session.expiresAt, now) : current === null;
  if (!kept) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
  return { current, now };
}
