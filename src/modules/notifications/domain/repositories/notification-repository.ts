import type { NOTIFICATION_MUTATION_STATUS } from "@/src/modules/notifications/constants/notifications";
import type { NotificationInbox } from "@/src/modules/notifications/domain/entities/notification";

/**
 * Persistence of the inbox of the signed-in user (request context) plus the
 * retention purge (maintenance context). The recipient is always the
 * request user (`app.current_user_id`); the adapter repeats the recipient and
 * tribe-access guards in SQL because the runtime role bypasses RLS.
 */

export type GetNotificationInboxRepositoryQuery = {
  limit: number;
  unreadCountCap: number;
};

export type CountUnreadNotificationsRepositoryQuery = {
  unreadCountCap: number;
};

export type MarkNotificationReadRepositoryCommand = {
  notificationId: string;
  unreadCountCap: number;
};

export type MarkNotificationReadRepositoryResult =
  | { status: typeof NOTIFICATION_MUTATION_STATUS.marked; unreadCount: number }
  | { status: typeof NOTIFICATION_MUTATION_STATUS.notFound };

export type MarkAllNotificationsReadRepositoryResult = {
  markedCount: number;
  unreadCount: number;
};

export type PurgeReadNotificationsRepositoryCommand = {
  batchSize: number;
  /** Read notifications whose `read_at` is before this instant are purged. */
  readBefore: string;
};

export interface NotificationRepository {
  countUnread(query: CountUnreadNotificationsRepositoryQuery): Promise<number>;
  getInbox(query: GetNotificationInboxRepositoryQuery): Promise<NotificationInbox>;
  /** Marks every unread notification of the user as read (idempotent). */
  markAllRead(query: CountUnreadNotificationsRepositoryQuery): Promise<MarkAllNotificationsReadRepositoryResult>;
  /** Marks one own notification as read; already read is still `marked`. */
  markRead(command: MarkNotificationReadRepositoryCommand): Promise<MarkNotificationReadRepositoryResult>;
  /** Deletes one bounded batch; returns how many rows it removed. */
  purgeReadBatch(command: PurgeReadNotificationsRepositoryCommand): Promise<number>;
}
