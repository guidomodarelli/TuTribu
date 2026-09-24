import type {
  InboxNotification,
  NotificationInbox,
} from "@/src/modules/notifications/domain/entities/notification";

/**
 * Internal contracts the notification use cases hand to route handlers and
 * the platform layout. The inbox item already carries every display fact the
 * UI needs to build the Spanish copy and the deep link; nothing else from the
 * database crosses this boundary.
 */

export type NotificationItemResult = InboxNotification;

export type NotificationInboxResult = NotificationInbox;

export type NotificationUnreadCountResult = {
  unreadCount: number;
};

export type NotificationMarkReadResult =
  | { status: "marked"; unreadCount: number }
  | { status: "not_found" };

export type NotificationMarkAllReadResult = {
  unreadCount: number;
};

export type NotificationPurgeResult = {
  /** Batches run in this call (bounded by the retention constants). */
  batchCount: number;
  /** False when the batch cap was reached with rows possibly left. */
  isComplete: boolean;
  purgedCount: number;
};
