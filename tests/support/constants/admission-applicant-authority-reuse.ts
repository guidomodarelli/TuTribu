/** Bounds the native reused applicant authority validation. @module admission-applicant-authority-reuse-constants */
export const ADMISSION_APPLICANT_AUTHORITY_REUSE_VALIDATION = {
  /** Statements of one full check: actor, tribe, user and session locks, account projection and database clock. */
  fullCheckStatements: 6,
  /** Long enough for the first full check over a remote branch to finish before expiry. */
  shortSessionMs: 6_000,
  expiryMarginMs: 1_500,
  /** A concurrent writer that would wait on this test's own locks fails instead of hanging. */
  concurrentLockTimeoutMs: 5_000,
  /** PostgreSQL `lock_not_available`, raised when that writer gives up waiting. */
  lockNotAvailableCode: "55P03",
  /** Savepoint the test opens and rolls back to, as the issuance effect does on a denial. */
  savepointSql: { begin: "savepoint applicant_authority_probe", rollback: "rollback to savepoint applicant_authority_probe", release: "release savepoint applicant_authority_probe" },
  timeoutMs: 600_000,
} as const;
