/** Bounds native snapshot/privilege validation on one owned disposable branch. */
export const ADMISSION_LOCKED_FACTS_VALIDATION = {
  timeoutMs: 1_200_000,
  concurrentTransactions: 3,
  permissionDeniedSqlState: "42501",
  initialPolicyVersion: 1,
  changedPolicyVersion: 2,
} as const;
