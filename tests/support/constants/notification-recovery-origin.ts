/** Selects the genuine upgrade boundary and a separate synthetic delivery lifetime. @module notification-recovery-origin-test-constants */
export const NOTIFICATION_RECOVERY_ORIGIN_TEST = {
  migrationTag: "20261014234500_preserve_notification_recovery_origins",
  deliveryLifetimeMs: 3_600_000,
} as const;

/** Enumerates both native lock orders without a timing-dependent release. */
export const NOTIFICATION_RECOVERY_ORIGIN_LOCK_ORDER = {
  writerFirst: "writer_first", migrationFirst: "migration_first",
} as const;
