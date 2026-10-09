/** Names the local validation namespace and safe denial mapping while issuance/resend retain their shared namespaces. @module admission-contact-verification-constants */
import {VERIFICATION_CHALLENGE_REASON} from "./verification-challenge";
import {ADMISSION_ERROR_CODE} from "./admission-errors";
/** Keeps code validation separate from both diagnostic confirmation and proof attachment. */
export const ADMISSION_CONTACT_VERIFICATION_OPERATION="verify_contact_challenge";
/** Keeps a known rejection from retaining partial issuer writes while its outer original ledger completes. */
export const ADMISSION_ISSUANCE_EFFECT_SQL={begin:"SAVEPOINT admission_issuance_effect",rollback:"ROLLBACK TO SAVEPOINT admission_issuance_effect",release:"RELEASE SAVEPOINT admission_issuance_effect"}as const;
/** Maps only domain reasons; raw provider messages or storage payloads never select user copy. */
export const ADMISSION_CONTACT_VERIFICATION_DENIAL_CODE={
  [VERIFICATION_CHALLENGE_REASON.scopeMismatch]:ADMISSION_ERROR_CODE.challengeInvalidated,
  [VERIFICATION_CHALLENGE_REASON.unavailable]:ADMISSION_ERROR_CODE.challengeInvalidated,
  [VERIFICATION_CHALLENGE_REASON.expired]:ADMISSION_ERROR_CODE.challengeExpired,
  [VERIFICATION_CHALLENGE_REASON.attemptsExhausted]:ADMISSION_ERROR_CODE.verificationAttemptsExceeded,
  [VERIFICATION_CHALLENGE_REASON.accountRateLimited]:ADMISSION_ERROR_CODE.usageLimitReached,
  [VERIFICATION_CHALLENGE_REASON.wrongCode]:ADMISSION_ERROR_CODE.verificationCodeIncorrect,
  [VERIFICATION_CHALLENGE_REASON.proofUnavailable]:ADMISSION_ERROR_CODE.proofUnavailable,
  [VERIFICATION_CHALLENGE_REASON.proofExpired]:ADMISSION_ERROR_CODE.proofUnavailable,
}as const;
