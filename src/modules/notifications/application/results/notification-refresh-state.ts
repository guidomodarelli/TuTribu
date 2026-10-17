/** Defines safe client refresh observations without carrying notification content or account identity. @module notification-refresh-state */

/** A skipped read neither confirms freshness nor replaces the previous failure. */
export type AdmissionNotificationRefreshOutcome = "refreshed" | "failed" | "skipped";
/** Shared interest contains no user, tribe, request or notification payload. */
export type AdmissionNotificationRefreshSnapshot = { readonly activeOwners: number; readonly revision: number };
/** Keeps own inbox loading separate from its cached row contents. */
export type NotificationListStatus = "error" | "idle" | "loaded" | "loading";
