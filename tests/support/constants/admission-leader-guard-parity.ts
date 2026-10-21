/** Bounds the native leader guard parity validation and fixes the lock order the guard must keep. @module admission-leader-guard-parity-constants */

/** Rows the leader guard locks, named by the row each one protects. */
export type AdmissionLeaderGuardLockedRow = "tribe" | "user" | "session" | "leader" | "account" | "binding";

/** Outcome of one guard call: authorized or the closed error code it raised. */
export type AdmissionLeaderGuardOutcome = "authorized" | "permission_denied" | "resource_unavailable" | "authentication_required";

export const ADMISSION_LEADER_GUARD_PARITY_VALIDATION = {
  sessionLifetimeMs: 3_600_000,
  /** Order of the locks of a read: the tribe `FOR SHARE`, then the native identity and canonical leadership. */
  sharedLockOrder: ["tribe", "user", "session", "leader"],
  /** A sensitive operation takes the tribe `FOR UPDATE` and also holds the Google account and its session binding. */
  exclusiveLockOrder: ["tribe", "user", "session", "leader", "account", "binding"],
  /** Polls that wait for the guard to queue behind the holder before probing what it already locked. */
  waitObservationPolls: 80,
  waitObservationPollMs: 100,
  /** PostgreSQL `lock_not_available`, raised by a `NOWAIT` probe on a row the guard holds. */
  lockNotAvailableCode: "55P03",
  timeoutMs: 900_000,
} as const satisfies {
  sharedLockOrder: readonly AdmissionLeaderGuardLockedRow[];
  exclusiveLockOrder: readonly AdmissionLeaderGuardLockedRow[];
  [setting: string]: unknown;
};
