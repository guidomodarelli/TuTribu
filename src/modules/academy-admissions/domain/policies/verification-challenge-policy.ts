/** Proposes local challenge/proof transitions; persistence and accumulated counters own atomicity. */
import { ADMISSION_LIMIT } from "@/src/modules/academy-admissions/constants/admission-limits";
import { ADMISSION_PROOF_STATUS, ADMISSION_VERIFICATION_PURPOSE } from "@/src/modules/academy-admissions/constants/admission-eligibility";
import { VERIFICATION_CHALLENGE_REASON, VERIFICATION_CHALLENGE_SCOPE_FIELDS, VERIFICATION_CHALLENGE_STATE, VERIFICATION_TRANSITION_OUTCOME } from "@/src/modules/academy-admissions/constants/verification-challenge";
import type { AdmissionVerificationProof } from "@/src/modules/academy-admissions/domain/entities/admission-verification-proof";
import type { ContactVerificationChallenge, VerificationChallengeScope } from "@/src/modules/academy-admissions/domain/entities/contact-verification-challenge";

type VerificationDenialReason = (typeof VERIFICATION_CHALLENGE_REASON)[keyof typeof VERIFICATION_CHALLENGE_REASON];
type ContactChallengeEvaluationInput = {
  now: Date; scope: VerificationChallengeScope; challenge: ContactVerificationChallenge;
  currentChallengeId: string | null; accountFailureBudgetAvailable: boolean;
};

/** Compares canonical contact and the security scope shared by challenge and proof. */
function matchesVerificationScope(stored: VerificationChallengeScope, current: VerificationChallengeScope): boolean {
  return stored.contact.type === current.contact.type && stored.contact.value === current.contact.value
    && VERIFICATION_CHALLENGE_SCOPE_FIELDS.every((field) => stored[field] === current[field]);
}

/**
 * Checks local usability before the application performs a keyed MAC verification.
 *
 * Provider availability, country-policy edits and send quota are intentionally
 * absent: they do not prevent checking a delivered, current local code.
 *
 * @param input - Authoritative clock, current challenge, exact scope and abuse budget.
 * @returns Permission for one verification attempt, or a closed safe reason.
 */
export function evaluateContactChallenge(input: ContactChallengeEvaluationInput): { allowed: true } | { allowed: false; reason: VerificationDenialReason } {
  const challenge = input.challenge;
  if (!matchesVerificationScope(challenge, input.scope) || challenge.channel !== input.scope.channel) return { allowed: false, reason: VERIFICATION_CHALLENGE_REASON.scopeMismatch };
  if (input.currentChallengeId !== challenge.id || challenge.state !== VERIFICATION_CHALLENGE_STATE.issued || challenge.invalidatedAt !== null || challenge.verifiedAt !== null || challenge.codeMac === null) {
    return { allowed: false, reason: VERIFICATION_CHALLENGE_REASON.unavailable };
  }
  const nowMs = input.now.getTime();
  if (!Number.isFinite(nowMs) || !Number.isFinite(challenge.createdAt.getTime()) || !Number.isFinite(challenge.expiresAt.getTime()) || nowMs < challenge.createdAt.getTime() || nowMs >= challenge.expiresAt.getTime() || nowMs - challenge.createdAt.getTime() >= ADMISSION_LIMIT.verificationCodeValidityMs) {
    return { allowed: false, reason: VERIFICATION_CHALLENGE_REASON.expired };
  }
  if (!Number.isInteger(challenge.failedAttempts) || challenge.failedAttempts < 0 || challenge.failedAttempts >= ADMISSION_LIMIT.verificationChallengeFailureCount) return { allowed: false, reason: VERIFICATION_CHALLENGE_REASON.attemptsExhausted };
  if (!input.accountFailureBudgetAvailable) return { allowed: false, reason: VERIFICATION_CHALLENGE_REASON.accountRateLimited };
  return { allowed: true };
}

/**
 * Proposes a one-use transition without mutating its supplied snapshot.
 *
 * The writer commits CAS, global failure accounting and envelope destruction
 * together. A successful diagnostic only proves that diagnostic; admission proof
 * issuance is a separate operation allowed exclusively for admission purpose.
 *
 * @param input - Evaluated current facts and the result of real keyed verification.
 * @returns A verified proposal, one counted wrong-code proposal, or a denial without effects.
 */
export function proposeContactChallengeValidation(input: ContactChallengeEvaluationInput & { codeMatches: boolean }):
  | { outcome: "denied"; reason: VerificationDenialReason }
  | { outcome: "wrong_code"; challenge: ContactVerificationChallenge; recordAccountFailure: true }
  | { outcome: "verified"; challenge: ContactVerificationChallenge; purpose: VerificationChallengeScope["purpose"] } {
  const evaluation = evaluateContactChallenge(input);
  if (!evaluation.allowed) return { outcome: VERIFICATION_TRANSITION_OUTCOME.denied, reason: evaluation.reason };
  if (!input.codeMatches) {
    const failedAttempts = input.challenge.failedAttempts + 1;
    const exhausted = failedAttempts >= ADMISSION_LIMIT.verificationChallengeFailureCount;
    return { outcome: VERIFICATION_TRANSITION_OUTCOME.wrongCode, recordAccountFailure: true, challenge: { ...input.challenge, version: input.challenge.version + 1, failedAttempts,
      state: exhausted ? VERIFICATION_CHALLENGE_STATE.invalidated : VERIFICATION_CHALLENGE_STATE.issued,
      invalidatedAt: exhausted ? input.now : null,
      invalidationReason: exhausted ? VERIFICATION_CHALLENGE_REASON.attemptsExhausted : null,
      codeMac: exhausted ? null : input.challenge.codeMac,
      codeEnvelopeId: exhausted ? null : input.challenge.codeEnvelopeId,
    } };
  }
  return { outcome: VERIFICATION_TRANSITION_OUTCOME.verified, purpose: input.challenge.purpose, challenge: { ...input.challenge, state: VERIFICATION_CHALLENGE_STATE.verified, version: input.challenge.version + 1, verifiedAt: input.now, codeMac: null, codeEnvelopeId: null } };
}

/**
 * Proposes applying an available proof once within fifteen minutes of verification.
 *
 * The request writer must atomically confirm scope, proof and contact binding.
 * Applying a proof does not approve a request or restart its pending deadline.
 * Historical applied proofs are evaluated separately during pending review.
 *
 * @param input - Current admission scope, verification facts and exact target request.
 * @returns An application proposal or a denial without reusing/reviving evidence.
 */
export function proposeAdmissionProofApplication(input: { now: Date; scope: VerificationChallengeScope; proof: AdmissionVerificationProof; requestId: string }):
  | { outcome: "applied"; proof: AdmissionVerificationProof }
  | { outcome: "denied"; reason: VerificationDenialReason } {
  const proof = input.proof;
  if (input.scope.purpose !== ADMISSION_VERIFICATION_PURPOSE.admission || !matchesVerificationScope(proof, input.scope)) return { outcome: VERIFICATION_TRANSITION_OUTCOME.denied, reason: VERIFICATION_CHALLENGE_REASON.scopeMismatch };
  if (!input.requestId || proof.status !== ADMISSION_PROOF_STATUS.available || proof.appliedRequestId !== null || proof.appliedAt !== null || proof.invalidatedAt !== null) return { outcome: VERIFICATION_TRANSITION_OUTCOME.denied, reason: VERIFICATION_CHALLENGE_REASON.proofUnavailable };
  const ageMs = input.now.getTime() - proof.verifiedAt.getTime();
  if (!Number.isFinite(ageMs) || !Number.isFinite(proof.applyBefore.getTime()) || ageMs < 0 || ageMs >= ADMISSION_LIMIT.verificationProofFreshnessMs || input.now.getTime() >= proof.applyBefore.getTime()) return { outcome: VERIFICATION_TRANSITION_OUTCOME.denied, reason: VERIFICATION_CHALLENGE_REASON.proofExpired };
  return { outcome: VERIFICATION_TRANSITION_OUTCOME.applied, proof: { ...proof, status: ADMISSION_PROOF_STATUS.applied, appliedRequestId: input.requestId, appliedAt: input.now } };
}
