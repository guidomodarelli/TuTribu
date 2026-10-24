/** Bounds the native authenticated account projection parity validation. @module authenticated-account-projection-parity-constants */
export const AUTHENTICATED_ACCOUNT_PROJECTION_PARITY_VALIDATION = {
  sessionLifetimeMs: 3_600_000,
  /** Label of the test-owned pool that plays the request client. */
  poolOperation: "authenticated_account_projection_parity",
  timeoutMs: 600_000,
} as const;
