/** Bounds the native reused leader authority validation. @module admission-leader-authority-reuse-constants */
export const ADMISSION_LEADER_AUTHORITY_REUSE_VALIDATION = {
  sessionLifetimeMs: 3_600_000,
  /** Long enough for the first full check over a remote branch to finish before expiry. */
  shortSessionMs: 6_000,
  expiryMarginMs: 1_500,
  /** A concurrent writer that would wait on this test's own locks fails instead of hanging. */
  concurrentLockTimeoutMs: 5_000,
  /** PostgreSQL `lock_not_available`, raised when that writer gives up waiting. */
  lockNotAvailableCode: "55P03",
  /** Pause beyond the consecutive reuse window, so the next identical check runs again. */
  windowMarginMs: 100,
  timeoutMs: 600_000,
} as const;
