/** Defines one-use proof attachment independently of persistence and provider delivery. @module admission-verification-proof-repository */
import type { VerificationChallengeScope } from "@/src/modules/academy-admissions/domain/entities/contact-verification-challenge";
import type { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";

/** Identity and the original intent must have been claimed by the caller's durable operation ledger. */
export type ApplyAdmissionVerificationProofCommand = {
  scope: VerificationChallengeScope;
  requestId: string;
  proofId: string;
  expectedRequestVersion: number;
  operationId: string;
  ledgerId: string;
};
/** Includes only the incremental pending state; contact, internal audit and private identity stay in their owners. */
export type AdmissionProofApplicationResult =
  | { outcome: "applied"; requestId: string; requestVersion: number; status: "pending"; proofId: string }
  | { outcome: "denied"; code: (typeof ADMISSION_ERROR_CODE)[keyof typeof ADMISSION_ERROR_CODE] };

export interface AdmissionVerificationProofWriter {
  /**
   * Attaches fresh proof/contact/binding/audit without approving or renewing a pending request.
   * @param command - Current scope and original ledger-bound proof/request intent.
   * @returns A stored own transition, confirmed only with the caller's transaction commit.
   */
  applyToPending(command: ApplyAdmissionVerificationProofCommand): Promise<AdmissionProofApplicationResult>;
}
