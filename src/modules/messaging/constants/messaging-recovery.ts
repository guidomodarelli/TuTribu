/** Bounds explicit private restoration reconciliation independently of ordinary maintenance. @module messaging-recovery-constants */
export const MESSAGING_RECOVERY = {
  defaultBatchSize: 25,
  maximumBatchSize: 100,
  operation: "reconcile_messaging_recovery",
  cause: "security_context_changed",
  event: "recovery_locked",
} as const;
