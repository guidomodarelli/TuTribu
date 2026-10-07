/**
 * Defines local verification authority without exposing SQL, cryptographic material or transport contracts.
 * @module contact-verification-repository
 */
import type { VerificationChallengeScope } from "@/src/modules/academy-admissions/domain/entities/contact-verification-challenge";
import type { VERIFICATION_CHALLENGE_REASON } from "@/src/modules/academy-admissions/constants/verification-challenge";

/** The owning use case authorizes scope and binds the complete code intent to its operation ledger. */
export type ValidateContactVerificationCommand = {
  scope: VerificationChallengeScope;
  challengeId: string;
  operationId: string;
  code: string;
};

/** An adapter's stored transition becomes confirmed only when the caller commits its guarded transaction. */
export type ContactVerificationResult =
  | { outcome: "denied"; reason: (typeof VERIFICATION_CHALLENGE_REASON)[keyof typeof VERIFICATION_CHALLENGE_REASON] }
  | { outcome: "wrong_code" }
  | { outcome: "verified"; purpose: VerificationChallengeScope["purpose"]; proofId: string | null; verifiedAt: Date };

/** Owns local consumption independently of issuance, delivery and diagnostic completion in other owners. */
export interface ContactVerificationWriter {
  /**
   * Consumes a current challenge, its local failure budget and proof/envelope effects atomically.
   * @param command - Current authorized scope and operation-ledger-bound local validation intent.
   * @returns A minimal own transition without a MAC, key, ciphertext, credential or provider payload.
   */
  validate(command: ValidateContactVerificationCommand): Promise<ContactVerificationResult>;
}
