/** Bounds real base-binding transport checks on one owned database branch. */
export const ADMISSION_BASE_BINDING_VALIDATION = {
  timeoutMs: 1_200_000,
  maximumStatements: 5,
  initialRequestVersion: 1,
  boundRequestVersion: 2,
  sqlHelpers: 2,
  concurrentTransactions: 3,
  permissionDeniedSqlState: "42501",
} as const;
