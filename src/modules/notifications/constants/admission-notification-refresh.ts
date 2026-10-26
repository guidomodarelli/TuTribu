/** Owns admission refresh timing and the ordinary inbox policy independently of message dispatch. @module admission-notification-refresh-constants */
import type { AdmissionNotificationRefreshSnapshot } from "../application/results/notification-refresh-state";

/** Refreshes visible admission state every fifteen seconds; no provider request is implied. */
export const ADMISSION_NOTIFICATION_REFRESH_INTERVAL_MS = 15_000;
/** Keeps unrelated notification contexts on the existing one-minute count policy. */
export const ORDINARY_NOTIFICATION_REFRESH_INTERVAL_MS = 60_000;
/** Uses only own read outcomes; exception text never becomes refresh feedback. */
export const NOTIFICATION_REFRESH_OUTCOME = { refreshed: "refreshed", failed: "failed", skipped: "skipped" } as const;
/** Provides one deterministic server/hydration snapshot, without browser interests. */
export const EMPTY_ADMISSION_NOTIFICATION_REFRESH_SNAPSHOT: AdmissionNotificationRefreshSnapshot = { activeOwners: 0, revision: 0 };
/** Names the single current-account inbox refresh owner, without exposing a user identifier. */
export const NOTIFICATION_CENTER_REFRESH_SCOPE = "notification-center";
