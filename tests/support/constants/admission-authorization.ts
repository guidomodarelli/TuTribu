/** Bounds native authorization races without changing production leases or pool configuration. */
export const ADMISSION_AUTHORIZATION_TEST = {
  timeoutMs: 180_000,
  concurrentTransactions: 3,
  sessionExpiryDelaySeconds: 10,
  sessionExpiryGraceSeconds: 0.1,
} as const;
