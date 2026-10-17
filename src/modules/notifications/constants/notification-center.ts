/** Owns the shared transport-to-panel load state vocabulary. @module notification-center-constants */
import type { NotificationListStatus } from "../application/results/notification-refresh-state";

/** Cached rows stay visible independently of the last read's outcome. */
export const NOTIFICATION_LIST_STATUS = { error: "error", idle: "idle", loaded: "loaded", loading: "loading" } as const satisfies Record<string, NotificationListStatus>;
