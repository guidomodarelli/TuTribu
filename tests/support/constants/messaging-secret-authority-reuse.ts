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

/** Seeds and bounds the native reused human messaging authority validation. */
export const MESSAGING_HUMAN_SECRET_AUTHORITY_FIXTURE = {
  /** Identity, tribe, messaging and secret retirement artifacts the human check reads. */
  migrations: ["20261005090000_create_admission_identity_evidence.sql", "20261005091000_create_academy_admission_core.sql", "20261005091500_guard_admission_evidence_transitions.sql", "20261005092000_create_tenant_messaging.sql", "20261005092500_guard_messaging_attempts.sql", "20261005095000_guard_global_identity_context.sql", "20261005100000_guard_messaging_secret_retirement.sql"],
  keyBytes: 32,
  sessionLifetimeMs: 3_600_000,
  /** Statements of one full human check: actor, user, Google account, session, identity binding, tribe, leaders, connection, version and envelope. */
  fullHumanCheckStatements: 10,
  /** Statements of a provider read whose second check is reused: one full check, the provider row, the reused check and the clock. */
  providerReadWithReuseStatements: 13,
  /** Long enough for the first full check over a remote branch to finish before the session ends. */
  shortSessionMs: 6_000,
} as const;
