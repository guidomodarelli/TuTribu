/** Derives the current account and normalizes explicit admission intent before its atomic owner. @module submit-admission-use-case */
import type { AuthenticatedAccountProvider } from "@/src/modules/auth/domain/repositories/authenticated-account-provider";
import { isAuthenticatedSessionLive } from "@/src/modules/auth/domain/policies/authenticated-session-liveness";
import type { AdmissionCommandWriter, AdmissionSubmissionIntent, AdmissionCommittedOutcome } from "@/src/modules/academy-admissions/domain/repositories/admission-repositories";
import { normalizeAdmissionContact } from "@/src/modules/academy-admissions/domain/value-objects/admission-contact";
import { ADMISSION_CONTACT_TYPE, ADMISSION_CONTACT_NORMALIZATION_STATUS } from "@/src/modules/academy-admissions/constants/admission-contact";
import { ADMISSION_OPERATION_TYPE, ADMISSION_REQUEST_SOURCE } from "@/src/modules/academy-admissions/constants/admission-request";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";
import { admissionOperationFailure } from "../results/admission-operation-failure";

/** The validated browser action cannot select email, actor, session, role, evidence or API credentials. */
export type SubmitAdmissionInput = {
  tribeId: string; requestId: string; operationId: string; expectedPolicyVersion: number; confirmed: true;
  phone?: string; country?: string; proofId?: string; message?: string; invitationToken?: string; legacyInvitationToken?: string;
};

/** The writer owns current opening, prior state, cadence, ledger/CAS and the final indivisible effect. */
export class SubmitAdmissionUseCase<Result extends AdmissionCommittedOutcome = AdmissionCommittedOutcome> {
  /** @param accounts - Native current private global account. @param writer - Own atomic writer, without sender/SDK dependencies. @param clock - Fresh time sampled after account resolution. */
  constructor(private readonly accounts: AuthenticatedAccountProvider, private readonly writer: AdmissionCommandWriter<Result>, private readonly clock: () => Date) {}

  /**
   * Preserves the original operation/expected version while deriving authority exclusively from the server.
   * @param input - Boundary-validated explicit confirmation and contact/source choice.
   * @returns Confirmed historical result, registered started work, or a safe own failure.
   */
  async execute(input: SubmitAdmissionInput) {
    try {
      const account = await this.accounts.getAuthenticatedAccount();
      if (!account || !isAuthenticatedSessionLive(account.session.expiresAt, this.clock())) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
      if (input.country && !input.phone) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
      const normalized = normalizeAdmissionContact(input.phone ? { type: ADMISSION_CONTACT_TYPE.phone, value: input.phone, country: input.country } : { type: ADMISSION_CONTACT_TYPE.email, value: account.normalizedEmail });
      if (normalized.status !== ADMISSION_CONTACT_NORMALIZATION_STATUS.valid) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
      const source: AdmissionSubmissionIntent["source"] = input.invitationToken ? { kind: ADMISSION_REQUEST_SOURCE.personal, token: input.invitationToken }
        : input.legacyInvitationToken ? { kind: ADMISSION_REQUEST_SOURCE.legacy, token: input.legacyInvitationToken } : { kind: ADMISSION_REQUEST_SOURCE.common };
      const intent: AdmissionSubmissionIntent = {
        tribeId: input.tribeId, requestId: input.requestId, userId: account.userId, sessionId: account.session.id,
        operationId: input.operationId, type: ADMISSION_OPERATION_TYPE.submit, expectedPolicyVersion: input.expectedPolicyVersion, confirmed: input.confirmed,
        source, contact: normalized.contact, proofId: input.proofId ?? null, message: input.message?.trim() || null,
      };
      return { ok: true as const, value: await this.writer.submit(intent) };
    } catch (error) { return admissionOperationFailure(error); }
  }
}
