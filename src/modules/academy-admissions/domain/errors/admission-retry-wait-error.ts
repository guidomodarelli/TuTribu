/** Names the retry wait behind an `admission_ineligible` submission. @module admission-retry-wait-error */

/** Closed reason of a submission refused while the previous own request keeps its retry wait. */
const ADMISSION_RETRY_WAIT_ERROR_CODE = "retry_wait_active";

/**
 * Private cause of an `admission_ineligible` submission sent before the previous cancelled, expired or rejected request let a new one in:
 * the route boundary logs its code, so the 409 says it was the wait. It is never serialized to the browser, whose preview shows the
 * wait and its date before offering the form.
 */
export class AdmissionRetryWaitError extends Error {
  readonly code = ADMISSION_RETRY_WAIT_ERROR_CODE;
  /** @param retryAllowedAt - Instant from which a new request is accepted. */
  constructor(public readonly retryAllowedAt: Date) {
    super(`Admission submission refused until ${retryAllowedAt.toISOString()}: ${ADMISSION_RETRY_WAIT_ERROR_CODE}`);
    this.name = "AdmissionRetryWaitError";
  }
}
