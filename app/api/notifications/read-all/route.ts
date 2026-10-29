import { notificationMarkReadResponseSchema } from "@/src/modules/notifications/application/results/notification-public-dto-schemas";
import { NOTIFICATION_ROUTE_RESPONSE } from "@/src/modules/notifications/infrastructure/api/notification-route-http";
import { handleNotificationInboxRoute } from "@/app/api/notifications/notification-route-session";

const NOTIFICATION_MARK_ALL_READ_ROUTE_LOG = {
  failureMessage: "Notification mark all as read failed",
  operation: "notification-mark-all-read",
} as const;

/**
 * "Marcar todas como leídas" (idempotent): responds with the fresh unread
 * count so the client updates without reloading the list.
 */
export async function POST(request: Request): Promise<Response> {
  return handleNotificationInboxRoute(
    request,
    {
      failureLogMessage: NOTIFICATION_MARK_ALL_READ_ROUTE_LOG.failureMessage,
      operation: NOTIFICATION_MARK_ALL_READ_ROUTE_LOG.operation,
      unexpectedFailureMessage: NOTIFICATION_ROUTE_RESPONSE.unexpectedMarkMessage,
    },
    async ({ modules, respond }) =>
      respond(await modules.notifications.useCases.markAllNotificationsRead(), notificationMarkReadResponseSchema)
  );
}
