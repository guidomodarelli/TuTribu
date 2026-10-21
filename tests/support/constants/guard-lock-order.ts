/** Bounds the native observation of an authorization guard's lock order. @module guard-lock-order-constants */

/** Rows the leader guards of admissions and messaging lock, named by the row each one protects. */
export type GuardLockedRow = "tribe" | "user" | "session" | "leader" | "account" | "binding";

export const GUARD_LOCK_ORDER_VALIDATION = {
  /** Every row a probe checks after a guard finished. */
  allRows: ["tribe", "user", "session", "leader", "account", "binding"],
  /** Polls that wait for the guard to queue behind the holder before probing what it already locked. */
  waitObservationPolls: 80,
  waitObservationPollMs: 100,
  /** PostgreSQL `lock_not_available`, raised by a `NOWAIT` probe on a row the guard holds. */
  lockNotAvailableCode: "55P03",
} as const satisfies { allRows: readonly GuardLockedRow[]; [setting: string]: unknown };
