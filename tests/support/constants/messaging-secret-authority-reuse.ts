/** Bounds the native reused messaging worker authority validation. @module messaging-secret-authority-reuse-constants */
export const MESSAGING_SECRET_AUTHORITY_REUSE_VALIDATION = {
  /** Statements of one full ungrouped worker check: actor, delivery source, tribe, leaders, connection, version, delivery, attempt, reservation and envelope. */
  fullWorkerCheckStatements: 10,
  /** Long enough for the first full check over a remote branch to finish before the lease ends. */
  shortLeaseMs: 6_000,
  expiryMarginMs: 1_500,
  /** A concurrent writer that would wait on this test's own locks fails instead of hanging. */
  concurrentLockTimeoutMs: 5_000,
  /** PostgreSQL `lock_not_available`, raised when that writer gives up waiting. */
  lockNotAvailableCode: "55P03",
  timeoutMs: 600_000,
} as const;
