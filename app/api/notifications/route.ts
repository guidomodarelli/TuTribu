import { notificationInboxSchema } from "@/src/modules/notifications/application/results/notification-public-dto-schemas";
import { NOTIFICATION_ROUTE_RESPONSE } from "@/src/modules/notifications/infrastructure/api/notification-route-http";
import { handleNotificationInboxRoute } from "@/app/api/notifications/notification-route-session";

const NOTIFICATION_INBOX_ROUTE_LOG = {
  failureMessage: "Notification inbox lookup failed",
  operation: "notification-inbox",
} as const;

/**
 * Inbox of the signed-in user: newest notifications and the unread count.
 * Called when the bell opens, so the list is fresh without polling it.
 */
export async function GET(request: Request): Promise<Response> {
  return handleNotificationInboxRoute(
    request,
    {
      failureLogMessage: NOTIFICATION_INBOX_ROUTE_LOG.failureMessage,
      operation: NOTIFICATION_INBOX_ROUTE_LOG.operation,
      unexpectedFailureMessage: NOTIFICATION_ROUTE_RESPONSE.unexpectedInboxMessage,
    },
    async ({ modules, respond }) =>
      respond(await modules.notifications.useCases.getNotificationInbox(), notificationInboxSchema)
  );
}
