/** Derives the current account and normalizes explicit admission intent before its atomic owner. @module submit-admission-use-case */
import type { AuthenticatedAccountProvider } from "@/src/modules/auth/domain/repositories/authenticated-account-provider";
import { requireLiveAdmissionAccount } from "./admission-account-continuity";
import { normalizeApplicantContact } from "./admission-applicant-contact";
import type { AdmissionCommandWriter, AdmissionSubmissionIntent, AdmissionCommittedOutcome } from "@/src/modules/academy-admissions/domain/repositories/admission-repositories";
import { ADMISSION_CONTACT_TYPE, ADMISSION_CONTACT_NORMALIZATION_STATUS } from "@/src/modules/academy-admissions/constants/admission-contact";
import { ADMISSION_OPERATION_TYPE, ADMISSION_REQUEST_SOURCE } from "@/src/modules/academy-admissions/constants/admission-request";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";
import { admissionOperationFailure } from "../results/admission-operation-failure";
import { normalizeAdmissionWhatsappNumber } from "../../domain/value-objects/admission-whatsapp-number";
import type { AcademyAdmissionIntent } from "@/src/modules/tribes/domain/repositories/academy-admission-entry";

/** The validated browser action cannot select email, actor, session, role, evidence or API credentials. */
export type SubmitAdmissionInput = AcademyAdmissionIntent & { tribeId: string };

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
      const account = await requireLiveAdmissionAccount(this.accounts, this.clock);
      const normalized = normalizeApplicantContact(input, account);
      if (normalized.status !== ADMISSION_CONTACT_NORMALIZATION_STATUS.valid) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
      const source = admissionSubmissionSource(input);
      const intent: AdmissionSubmissionIntent = {
        tribeId: input.tribeId, requestId: input.requestId, userId: account.userId, sessionId: account.session.id,
        operationId: input.operationId, type: ADMISSION_OPERATION_TYPE.submit, expectedPolicyVersion: input.expectedPolicyVersion, confirmed: input.confirmed,
        source, contact: normalized.contact, proofId: input.proofId ?? null, message: input.message?.trim() || null,
        // With phone contact, that same number is the one reviewers compare with the group; a separate declared number is ignored.
        ...declaredWhatsappNumber(normalized.contact, input.whatsappNumber),
      };
      return { ok: true as const, value: await this.writer.submit(intent) };
    } catch (error) { return admissionOperationFailure(error); }
  }
}

/** @param input - Proposed invitation tokens. @returns The personal source first, then the legacy one, else the common source. */
function admissionSubmissionSource(input: Pick<SubmitAdmissionInput, "invitationToken" | "legacyInvitationToken">): AdmissionSubmissionIntent["source"] {
  if (input.invitationToken) return { kind: ADMISSION_REQUEST_SOURCE.personal, token: input.invitationToken };
  return input.legacyInvitationToken ? { kind: ADMISSION_REQUEST_SOURCE.legacy, token: input.legacyInvitationToken } : { kind: ADMISSION_REQUEST_SOURCE.common };
}

/** @param contact - Normalized submission contact. @param whatsappNumber - Separately declared group number, if any. @returns The phone contact itself, else the normalized declared number, else nothing. */
function declaredWhatsappNumber(contact: NonNullable<AdmissionSubmissionIntent["contact"]>, whatsappNumber: string | undefined): { whatsappNumber?: string | null } {
  if (contact.type === ADMISSION_CONTACT_TYPE.phone) return { whatsappNumber: contact.value };
  return whatsappNumber !== undefined ? { whatsappNumber: normalizeAdmissionWhatsappNumber(whatsappNumber) } : {};
}
