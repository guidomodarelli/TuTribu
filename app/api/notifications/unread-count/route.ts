import { notificationUnreadCountSchema } from "@/src/modules/notifications/application/results/notification-public-dto-schemas";
import { NOTIFICATION_ROUTE_RESPONSE } from "@/src/modules/notifications/infrastructure/api/notification-route-http";
import { handleNotificationInboxRoute } from "@/app/api/notifications/notification-route-session";

const NOTIFICATION_UNREAD_COUNT_ROUTE_LOG = {
  failureMessage: "Notification unread count lookup failed",
  operation: "notification-unread-count",
} as const;

/**
 * Unread badge count only: the cheap path the bell polls while the tab is
 * visible.
 */
export async function GET(request: Request): Promise<Response> {
  return handleNotificationInboxRoute(
    request,
    {
      failureLogMessage: NOTIFICATION_UNREAD_COUNT_ROUTE_LOG.failureMessage,
      operation: NOTIFICATION_UNREAD_COUNT_ROUTE_LOG.operation,
      unexpectedFailureMessage: NOTIFICATION_ROUTE_RESPONSE.unexpectedInboxMessage,
    },
    async ({ modules, respond }) =>
      respond(await modules.notifications.useCases.getUnreadNotificationCount(), notificationUnreadCountSchema)
  );
}
