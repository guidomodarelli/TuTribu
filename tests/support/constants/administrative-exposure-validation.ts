/** Bounds observation of a real lock waiter independently of any product deadline. @module administrative-exposure-validation-constants */
export const ADMINISTRATIVE_EXPOSURE_LOCK_OBSERVATION = { timeoutMs: 3_000, intervalMs: 20, statementTimeout: "10s" } as const;
