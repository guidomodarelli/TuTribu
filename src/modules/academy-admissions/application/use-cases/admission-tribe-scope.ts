/** Resolves the URL-selected tribe into the internal scope every scoped admission read or command runs in. @module admission-tribe-scope */
import type { AuthenticatedAccountProvider } from "@/src/modules/auth/domain/repositories/authenticated-account-provider";
import type { AuthenticatedAccount } from "@/src/modules/auth/domain/entities/authenticated-account";
import type { AdmissionFailure } from "../results/admission-errors";
import { admissionOperationFailure } from "../results/admission-operation-failure";
import { requireLiveAdmissionAccount } from "./admission-account-continuity";
import type { TribePageFailures } from "@/src/modules/shared/application/live-account-tribe-page-read";
import { AdmissionOperationError } from "../../domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";

/** Internal tenant plus safe correlation of one scoped call; never a permission. */
export type AdmissionTribeScope = { tribeId: string; requestId: string };
/** Canonical routing port: a public slug maps to the internal tribe or to a semantic failure. */
export type AdmissionTribeRouting = { execute(query: { slug: string; requestId: string }): Promise<{ ok: true; value: { tribeId: string } } | { ok: false; failure: AdmissionFailure }> };

/**
 * @param routing - Canonical slug resolver.
 * @param query - Validated slug and safe correlation.
 * @returns The internal scope, or the routing failure unchanged.
 */
export async function resolveAdmissionTribeScope(routing: AdmissionTribeRouting, query: { slug: string; requestId: string }): Promise<{ ok: true; value: AdmissionTribeScope } | { ok: false; failure: AdmissionFailure }> {
  const tribe = await routing.execute({ slug: query.slug, requestId: query.requestId });
  if (!tribe.ok) return tribe;
  return { ok: true, value: { tribeId: tribe.value.tribeId, requestId: query.requestId } };
}

/** Account that opened a scoped read and the internal scope of its tribe. */
type OpenedAdmissionRead = { first: AuthenticatedAccount; scope: AdmissionTribeScope };

/**
 * Runs a signed-in scoped read: pins the live account first, resolves the tribe, then reads; any thrown failure is contained.
 * @param owners - Current native identity, fresh clock for the session liveness check and canonical slug resolver.
 * @param query - Validated slug and safe correlation.
 * @param read - Reads inside the scope, from the account that opened it.
 * @returns The read result, the routing failure unchanged, or the contained application failure.
 */
export async function runScopedAdmissionRead<Result>({ accounts, clock, routing }: { accounts: AuthenticatedAccountProvider; clock: () => Date; routing: AdmissionTribeRouting }, query: { slug: string; requestId: string }, read: (opened: OpenedAdmissionRead) => Promise<Result>): Promise<Result | { ok: false; failure: AdmissionFailure }> {
  try {
    const first = await requireLiveAdmissionAccount(accounts, clock);
    const tribe = await resolveAdmissionTribeScope(routing, query);
    if (!tribe.ok) return tribe;
    return await read({ first, scope: tribe.value });
  } catch (error) { return admissionOperationFailure(error); }
}

/** Closed failures of an admission leader page read: authentication required, the original routing failure and any throw as an admission failure. */
export const ADMISSION_TRIBE_PAGE_FAILURES: TribePageFailures<AdmissionFailure, { ok: false; failure: AdmissionFailure }, ReturnType<typeof admissionOperationFailure>> = {
  authenticationRequired: () => new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired),
  rejectTribe: (failure) => ({ ok: false, failure }),
  closeFailure: admissionOperationFailure,
};
