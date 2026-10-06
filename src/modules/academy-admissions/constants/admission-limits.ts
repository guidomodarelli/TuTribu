/**
 * Defines the admission-owned durations and content limits fixed by the feature contract.
 *
 * @module admission-limits
 */

import { MILLISECONDS_PER_SECOND, SECONDS_PER_DAY, SECONDS_PER_MINUTE } from "@/src/constants/time";

/** Converts elapsed time using the repository's canonical unit factors. */
const MINUTE_MS = MILLISECONDS_PER_SECOND * SECONDS_PER_MINUTE;
const DAY_MS = MILLISECONDS_PER_SECOND * SECONDS_PER_DAY;
const INVITATION_DEFAULT_VALIDITY_DAYS = 7;
const PENDING_VALIDITY_DAYS = 30;
const REJECTION_RETRY_WAIT_DAYS = 7;
const PENDING_REMINDER_DELAY_DAYS = 3;
const VERIFICATION_CODE_VALIDITY_MINUTES = 10;
const VERIFICATION_PROOF_FRESHNESS_MINUTES = 15;

export const ADMISSION_LIMIT = {
  invitationDefaultValidityMs: INVITATION_DEFAULT_VALIDITY_DAYS * DAY_MS,
  pendingValidityMs: PENDING_VALIDITY_DAYS * DAY_MS,
  rejectionRetryWaitMs: REJECTION_RETRY_WAIT_DAYS * DAY_MS,
  submissionCadenceMs: DAY_MS,
  pendingReminderDelayMs: PENDING_REMINDER_DELAY_DAYS * DAY_MS,
  batchRequestCount: 50,
  csvDataRowCount: 10_000,
  /** Five MiB, enforced independently of the ten-thousand-row ceiling. */
  csvByteCount: 5_242_880,
  displayNameCharacters: 100,
  internalMessageCharacters: 500,
  externalMessageCharacters: 200,
  verificationCodeDigits: 6,
  verificationCodeValidityMs: VERIFICATION_CODE_VALIDITY_MINUTES * MINUTE_MS,
  verificationChallengeFailureCount: 5,
  verificationProofFreshnessMs: VERIFICATION_PROOF_FRESHNESS_MINUTES * MINUTE_MS,
  verificationResendWaitMs: MINUTE_MS,
} as const;
