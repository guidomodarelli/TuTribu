/** Bounds the native messaging leadership guard parity validation and fixes the lock order each guard must keep. @module messaging-leader-guard-parity-constants */
import type { GuardLockedRow } from "./guard-lock-order";

export const MESSAGING_LEADER_GUARD_PARITY_VALIDATION = {
  sessionLifetimeMs: 3_600_000,
  /** `getCurrentLeadership`: the tribe, the actor's session and the canonical leader, all `FOR SHARE`. */
  leadershipLockOrder: ["tribe", "session", "leader"],
  /** Connection configuration reads lock the session first, then the tribe and the canonical leader. */
  configurationLockOrder: ["session", "tribe", "leader"],
  /** Tribe management: the actor, its session, the tribe and the canonical leader. */
  managementLockOrder: ["user", "session", "tribe", "leader"],
  /** A sensitive operation also holds the Google account and its session binding before the tribe. */
  sensitiveManagementLockOrder: ["user", "session", "account", "binding", "tribe", "leader"],
  timeoutMs: 1_800_000,
} as const satisfies {
  leadershipLockOrder: readonly GuardLockedRow[];
  configurationLockOrder: readonly GuardLockedRow[];
  managementLockOrder: readonly GuardLockedRow[];
  sensitiveManagementLockOrder: readonly GuardLockedRow[];
  [setting: string]: unknown;
};
