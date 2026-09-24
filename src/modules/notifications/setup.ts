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
  getNotificationInbox,
  getUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
  purgeReadNotifications,
} from "@/src/modules/notifications/application/use-cases/notification-use-cases";
import type { NotificationRepository } from "@/src/modules/notifications/domain/repositories/notification-repository";

type NotificationsModuleDependencies = {
  notificationRepository: NotificationRepository;
};

type NotificationsModule = {
  useCases: {
    getNotificationInbox: () => Promise<NotificationInboxResult>;
    getUnreadNotificationCount: () => Promise<NotificationUnreadCountResult>;
    markAllNotificationsRead: () => Promise<NotificationMarkAllReadResult>;
    markNotificationRead: (command: MarkNotificationReadCommand) => Promise<NotificationMarkReadResult>;
    purgeReadNotifications: (command?: PurgeReadNotificationsCommand) => Promise<NotificationPurgeResult>;
  };
};

/**
 * Composes the generic in-app notification inbox. Producers (events, and
 * future modules) enqueue through their own adapters or SQL triggers; this
 * module only reads, marks, and purges.
 */
export function buildNotificationsModule(
  dependencies: NotificationsModuleDependencies
): NotificationsModule {
  return {
    useCases: {
      getNotificationInbox: getNotificationInbox(dependencies),
      getUnreadNotificationCount: getUnreadNotificationCount(dependencies),
      markAllNotificationsRead: markAllNotificationsRead(dependencies),
      markNotificationRead: markNotificationRead(dependencies),
      purgeReadNotifications: purgeReadNotifications(dependencies),
    },
  };
}
