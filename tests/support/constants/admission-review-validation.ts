/** Bounds only isolated reviewer browser validation, never product requests or leases. @module admission-review-validation */
export const ADMISSION_REVIEW_BROWSER_VALIDATION = {
  testTimeoutMs: 600_000,
  artifactEnvironment: "ADMISSION_REVIEW_FILTER_ARTIFACT_ROOT",
  captureFile: "admission-review-filter-captures.json",
  pendingAgeCaptureFile: "pending-age-review-captures.json",
} as const;
/** Only SQLSTATE is safe to retain from a provider exception; messages and SQL parameters stay private. */
export const ADMISSION_REVIEW_SQL_STATE_PATTERN = /^[0-9A-Z]{5}$/u;
