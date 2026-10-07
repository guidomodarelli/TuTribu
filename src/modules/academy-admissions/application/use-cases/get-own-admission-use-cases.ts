/** Reads only the current account's preadmission request with no membership prerequisite or effects. @module get-own-admission-use-cases */
import type { AuthenticatedAccountProvider } from "@/src/modules/auth/domain/repositories/authenticated-account-provider";
import { isAuthenticatedSessionLive } from "@/src/modules/auth/domain/policies/authenticated-session-liveness";
import type { AdmissionOwnRequestReader } from "@/src/modules/academy-admissions/domain/repositories/admission-query-reader";
import { admissionRequestSchema } from "../results/admission-flow-result-schemas";
import { admissionOperationFailure } from "../results/admission-operation-failure";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";

/** Account identity belongs to the native provider, never a query field. */
type OwnAdmissionQuery = { tribeId: string; requestId: string; admissionRequestId?: string };

/** The actual reader independently rechecks session and ownership under its protected database context. */
export class GetOwnAdmissionUseCases {
  /** @param accounts - Current native private identity. @param reader - Own scope-restricted DTO projection, never a provider response. @param clock - Fresh current time after account/reader waits. */
  constructor(private readonly accounts: AuthenticatedAccountProvider, private readonly reader: AdmissionOwnRequestReader<unknown>, private readonly clock: () => Date) {}
  /**
   * Validates the own DTO and discards a query result if its original session changed or expired while waiting.
   * @param query - Boundary-resolved tribe and safe correlation only.
   * @returns An allowlisted own request or null; no claim, fabricated version, grant or new presentation.
   */
  async getOwn(query: OwnAdmissionQuery) {
    try {
      const first = await this.accounts.getAuthenticatedAccount();
      if (!first || !isAuthenticatedSessionLive(first.session.expiresAt, this.clock())) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
      const result = await this.reader.readOwn({ ...query, userId: first.userId, sessionId: first.session.id });
      const current = await this.accounts.getAuthenticatedAccount();
      if (!current || current.userId !== first.userId || current.session.id !== first.session.id || !isAuthenticatedSessionLive(current.session.expiresAt, this.clock())) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
      if (result === null) return { ok: true as const, value: null };
      const parsed = admissionRequestSchema.safeParse(result);
      if (!parsed.success || query.admissionRequestId && parsed.data.id !== query.admissionRequestId.toLowerCase()) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.publicContractUnusable);
      return { ok: true as const, value: parsed.data };
    } catch (error) { return admissionOperationFailure(error); }
  }
}
