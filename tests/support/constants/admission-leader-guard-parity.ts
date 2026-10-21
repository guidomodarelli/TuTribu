/** Bounds the native admission leader guard parity validation and fixes the lock order the guard must keep. @module admission-leader-guard-parity-constants */
import type { GuardLockedRow } from "./guard-lock-order";

/** Outcome of one guard call: authorized or the closed error code it raised. */
export type AdmissionLeaderGuardOutcome = "authorized" | "permission_denied" | "resource_unavailable" | "authentication_required";

export const ADMISSION_LEADER_GUARD_PARITY_VALIDATION = {
  sessionLifetimeMs: 3_600_000,
  /** Order of the locks of a read: the tribe `FOR SHARE`, then the native identity and canonical leadership. */
  sharedLockOrder: ["tribe", "user", "session", "leader"],
  /** A sensitive operation takes the tribe `FOR UPDATE` and also holds the Google account and its session binding. */
  exclusiveLockOrder: ["tribe", "user", "session", "leader", "account", "binding"],
  timeoutMs: 900_000,
} as const satisfies {
  sharedLockOrder: readonly GuardLockedRow[];
  exclusiveLockOrder: readonly GuardLockedRow[];
  [setting: string]: unknown;
};
