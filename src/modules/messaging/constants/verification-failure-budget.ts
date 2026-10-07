/**
 * Names the private account-wide failure ledger and its moving-hour window.
 * @module verification-failure-budget-constants
 */
import { MILLISECONDS_PER_SECOND, SECONDS_PER_HOUR } from "@/src/constants/time";

/** Shares the same namespace across every tribe, contact and verification purpose. */
export const VERIFICATION_FAILURE_LOCK_DOMAIN = "messaging_account_verification_failures";
/** Selects local validation failures rather than requests or externally billable attempts. */
export const VERIFICATION_FAILURE_EVENT_TYPE = "code_failure";
/** Uses elapsed hours independently of the UTC daily ceiling. */
export const VERIFICATION_FAILURE_HOURLY_WINDOW_MS = SECONDS_PER_HOUR * MILLISECONDS_PER_SECOND;
