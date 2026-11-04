/** Bounds the safe cause chain that server diagnostics may record. @module error-cause-summary-constants */

/** Deepest cause chain walked; deeper links are dropped, never serialized. */
export const ERROR_CAUSE_SUMMARY_MAX_ENTRIES = 6;
/** Error class names that may be logged: identifiers only, never free text. */
export const ERROR_CAUSE_NAME_PATTERN = /^[A-Za-z]\w{0,63}$/;
/** Closed error codes that may be logged (own codes, SQLSTATE, Node codes); free text is dropped. */
export const ERROR_CAUSE_CODE_PATTERN = /^[A-Za-z0-9_.:-]{1,64}$/;
/** Name recorded when an error class name is not a safe identifier. */
export const UNNAMED_ERROR_CAUSE = "UnnamedError";
/**
 * Name recorded for a plain closed failure (a use case result such as `{ code, cause }`) found in a chain: it is not an error
 * instance, but its code and its own cause say which layer failed.
 */
export const CLOSED_FAILURE_CAUSE = "ClosedFailure";
