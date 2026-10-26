/** Bounds native authorization races without changing production leases or pool configuration. */
export const ADMISSION_AUTHORIZATION_TEST = {
  timeoutMs: 180_000,
  concurrentTransactions: 3,
  mismatchStatementTimeoutMs: 1000,
  statementTimeoutSetting: "statement_timeout",
  sessionExpiryDelaySeconds: 10,
  sessionExpiryGraceSeconds: 0.1,
  insufficientPrivilegeSqlState: "42501",
  scopeActorReferenceStatements: 2,
  scopeActorMaximumStatements: 1,
  scopeActorNativeFunctions: 2,
} as const;
