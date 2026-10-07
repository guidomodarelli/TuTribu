/** Defines atomic private issuance independently of HTTP and provider transport. @module contact-verification-issuer */
import type { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import type { VerificationChallengeScope } from "@/src/modules/academy-admissions/domain/entities/contact-verification-challenge";

/** The operation ledger binds the original scope and explicit current-challenge expectation. */
export type IssueContactVerificationCommand = {
  scope: VerificationChallengeScope;
  operationId: string;
  ledgerId: string;
  expectedCurrentChallengeId: string | null;
};

/** No recoverable code, destination, credential or cryptographic material leaves the writer. */
export type ContactVerificationIssuanceResult =
  | { outcome: "denied"; code: (typeof ADMISSION_ERROR_CODE)[keyof typeof ADMISSION_ERROR_CODE] }
  | { outcome: "issued"; challengeId: string; deliveryId: string; diagnosticId: string | null; expiresAt: Date; resendAllowedAt: Date };

/** Owns issuance and explicit resend; delivery confirmation never substitutes local verification. */
export interface ContactVerificationIssuer {
  /**
   * Commits the new challenge, protected code, request accounting and queued delivery together.
   * @param command - Current owner scope and durable original operation identity.
   * @returns Minimal private transition, confirmed only by the caller's commit.
   */
  issue(command: IssueContactVerificationCommand): Promise<ContactVerificationIssuanceResult>;
}
