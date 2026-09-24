import { notificationInboxSchema } from "@/src/modules/notifications/application/results/notification-public-dto-schemas";
import {
  notificationEmptyParamsSchema,
  notificationEmptyQuerySchema,
} from "@/src/modules/notifications/infrastructure/api/notification-request-schemas";
import {
  NOTIFICATION_ROUTE_HTTP_STATUS,
  NOTIFICATION_ROUTE_RESPONSE,
  createNotificationJsonResponse,
  createNotificationPublicResponse,
  parseNotificationRouteInput,
} from "@/src/modules/notifications/infrastructure/api/notification-route-http";
import { resolveNotificationRouteSession } from "@/app/api/notifications/notification-route-session";

const NOTIFICATION_INBOX_ROUTE_LOG = {
  failureMessage: "Notification inbox lookup failed",
  operation: "notification-inbox",
} as const;

/**
 * Inbox of the signed-in user: newest notifications and the unread count.
 * Called when the bell opens, so the list is fresh without polling it.
 */
export async function GET(request: Request): Promise<Response> {
  const session = await resolveNotificationRouteSession(request, NOTIFICATION_INBOX_ROUTE_LOG.operation);

  if (!session.isResolved) {
    return session.response;
  }

  const { logger, metadata, modules } = session;
  const input = await parseNotificationRouteInput({
    logger,
    params: Promise.resolve({}),
    request,
    schemas: { params: notificationEmptyParamsSchema, query: notificationEmptyQuerySchema },
  });

  if (!input.isValid) {
    return input.response;
  }

  try {
    const inbox = await modules.notifications.useCases.getNotificationInbox();

    return createNotificationPublicResponse({
      body: inbox,
      failureMessage: NOTIFICATION_ROUTE_RESPONSE.unexpectedInboxMessage,
      logger,
      metadata,
      schema: notificationInboxSchema,
    });
  } catch (error) {
    logger.error({ error, message: NOTIFICATION_INBOX_ROUTE_LOG.failureMessage, metadata });

    return createNotificationJsonResponse(
      { message: NOTIFICATION_ROUTE_RESPONSE.unexpectedInboxMessage },
      NOTIFICATION_ROUTE_HTTP_STATUS.serverError
    );
  }
}
