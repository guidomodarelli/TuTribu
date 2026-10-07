/** Defines code-request accounting separately from local code validation and external billable attempts. @module verification-request-budget */
import type { VerificationChallengeScope } from "@/src/modules/academy-admissions/domain/entities/contact-verification-challenge";
import type { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
export type VerificationRequestBudgetCommand = { scope: VerificationChallengeScope; operationId: string; challengeId: string };
/** Protected index fields are private input to challenge/outbox persistence, never a public response. */
export type VerificationRequestBudgetResult =
  | { allowed: true; replayed: boolean; contactSubjectId: string; fingerprintKeyId: string; contactFingerprint: Uint8Array }
  | { allowed: false; code: (typeof ADMISSION_ERROR_CODE)[keyof typeof ADMISSION_ERROR_CODE] };
export interface VerificationRequestBudget {
  /**
   * Counts an original authorized request once, under account/contact and diagnostic limits.
   * @param command - Current scope and the original ledger-bound issuance intent.
   * @returns Private persistent accounting or a safe denial, in the caller's transaction.
   */
  consume(command: VerificationRequestBudgetCommand): Promise<VerificationRequestBudgetResult>;
}
