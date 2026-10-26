/** Bounds native commit barriers without changing any production timeout, lease or pool. */
export const ADMISSION_SUBMISSION_CONCURRENCY_TEST = {
  timeoutMs: 900_000,
  concurrentTransactions: 4,
  duplicateCommandCount: 4,
  holdDeadlineSeconds: 60,
  heartbeatSeconds: 0.1,
  observationPauseSeconds: 0.05,
  statementTimeout: "10s",
} as const;
