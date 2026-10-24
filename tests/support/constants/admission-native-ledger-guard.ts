/** Bounds real guarded-ledger transport and rejection checks. */
export const ADMISSION_NATIVE_LEDGER_GUARD_TEST = {
  timeoutMs: 1_200_000,
  concurrentTransactions: 4,
  authorizationCallsPerSubmission: 5,
} as const;
