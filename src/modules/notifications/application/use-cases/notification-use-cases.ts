import type {
  MarkNotificationReadCommand,
  PurgeReadNotificationsCommand,
} from "@/src/modules/notifications/application/commands/notification-command";
import type {
  NotificationInboxResult,
  NotificationMarkAllReadResult,
  NotificationMarkReadResult,
  NotificationPurgeResult,
  NotificationUnreadCountResult,
} from "@/src/modules/notifications/application/results/notification-result";
import {
  NOTIFICATION_INBOX,
  NOTIFICATION_RETENTION,
} from "@/src/modules/notifications/constants/notifications";
import type { NotificationRepository } from "@/src/modules/notifications/domain/repositories/notification-repository";

type NotificationUseCaseDependencies = {
  notificationRepository: NotificationRepository;
};

const MILLISECONDS_PER_DAY = 86_400_000;

/**
 * Newest notifications of the signed-in user plus the unread badge count.
 * Notifications of tribes the user can no longer read are left out.
 */
export function getNotificationInbox({ notificationRepository }: NotificationUseCaseDependencies) {
  return async (): Promise<NotificationInboxResult> =>
    notificationRepository.getInbox({
      limit: NOTIFICATION_INBOX.listLimit,
      unreadCountCap: NOTIFICATION_INBOX.unreadCountCap,
    });
}

/**
 * Unread badge count only (cheap polling path).
 */
export function getUnreadNotificationCount({
  notificationRepository,
}: NotificationUseCaseDependencies) {
  return async (): Promise<NotificationUnreadCountResult> => ({
    unreadCount: await notificationRepository.countUnread({
      unreadCountCap: NOTIFICATION_INBOX.unreadCountCap,
    }),
  });
}

/**
 * Marks one own notification as read (idempotent) and returns the fresh
 * unread count so the client updates the badge without reloading the list.
 */
export function markNotificationRead({ notificationRepository }: NotificationUseCaseDependencies) {
  return async (command: MarkNotificationReadCommand): Promise<NotificationMarkReadResult> =>
    notificationRepository.markRead({
      notificationId: command.notificationId,
      unreadCountCap: NOTIFICATION_INBOX.unreadCountCap,
    });
}

/**
 * "Marcar todas como leídas": marks every unread notification of the user.
 */
export function markAllNotificationsRead({
  notificationRepository,
}: NotificationUseCaseDependencies) {
  return async (): Promise<NotificationMarkAllReadResult> => {
    const { unreadCount } = await notificationRepository.markAllRead({
      unreadCountCap: NOTIFICATION_INBOX.unreadCountCap,
    });

    return { unreadCount };
  };
}

/**
 * Retention: deletes read notifications older than
 * `NOTIFICATION_RETENTION.readRetentionDays`, one bounded batch at a time and
 * at most `maxBatchesPerRun` batches, so a run never holds a long delete. A
 * partial run finishes in the next cron invocation.
 */
export function purgeReadNotifications({ notificationRepository }: NotificationUseCaseDependencies) {
  return async (command: PurgeReadNotificationsCommand = {}): Promise<NotificationPurgeResult> => {
    const now = command.now ? Date.parse(command.now) : Date.now();
    const readBefore = new Date(
      now - NOTIFICATION_RETENTION.readRetentionDays * MILLISECONDS_PER_DAY
    ).toISOString();
    let purgedCount = 0;
    let batchCount = 0;

    while (batchCount < NOTIFICATION_RETENTION.maxBatchesPerRun) {
      const deletedCount = await notificationRepository.purgeReadBatch({
        batchSize: NOTIFICATION_RETENTION.purgeBatchSize,
        readBefore,
      });

      batchCount += 1;
      purgedCount += deletedCount;

      if (deletedCount < NOTIFICATION_RETENTION.purgeBatchSize) {
        return { batchCount, isComplete: true, purgedCount };
      }
    }

    return { batchCount, isComplete: false, purgedCount };
  };
}
