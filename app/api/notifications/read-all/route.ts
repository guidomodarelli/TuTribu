import { notificationMarkReadResponseSchema } from "@/src/modules/notifications/application/results/notification-public-dto-schemas";
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

const NOTIFICATION_MARK_ALL_READ_ROUTE_LOG = {
  failureMessage: "Notification mark all as read failed",
  operation: "notification-mark-all-read",
} as const;

/**
 * "Marcar todas como leídas" (idempotent): responds with the fresh unread
 * count so the client updates without reloading the list.
 */
export async function POST(request: Request): Promise<Response> {
  const session = await resolveNotificationRouteSession(request, {
    operation: NOTIFICATION_MARK_ALL_READ_ROUTE_LOG.operation,
    unexpectedFailureMessage: NOTIFICATION_ROUTE_RESPONSE.unexpectedMarkMessage,
  });

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
    const result = await modules.notifications.useCases.markAllNotificationsRead();

    return createNotificationPublicResponse({
      body: result,
      failureMessage: NOTIFICATION_ROUTE_RESPONSE.unexpectedMarkMessage,
      logger,
      metadata,
      schema: notificationMarkReadResponseSchema,
    });
  } catch (error) {
    logger.error({ error, message: NOTIFICATION_MARK_ALL_READ_ROUTE_LOG.failureMessage, metadata });

    return createNotificationJsonResponse(
      { message: NOTIFICATION_ROUTE_RESPONSE.unexpectedMarkMessage },
      NOTIFICATION_ROUTE_HTTP_STATUS.serverError
    );
  }
}
