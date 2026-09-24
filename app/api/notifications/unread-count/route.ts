import { notificationUnreadCountSchema } from "@/src/modules/notifications/application/results/notification-public-dto-schemas";
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

const NOTIFICATION_UNREAD_COUNT_ROUTE_LOG = {
  failureMessage: "Notification unread count lookup failed",
  operation: "notification-unread-count",
} as const;

/**
 * Unread badge count only: the cheap path the bell polls while the tab is
 * visible.
 */
export async function GET(request: Request): Promise<Response> {
  const session = await resolveNotificationRouteSession(
    request,
    NOTIFICATION_UNREAD_COUNT_ROUTE_LOG.operation
  );

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
    const result = await modules.notifications.useCases.getUnreadNotificationCount();

    return createNotificationPublicResponse({
      body: result,
      failureMessage: NOTIFICATION_ROUTE_RESPONSE.unexpectedInboxMessage,
      logger,
      metadata,
      schema: notificationUnreadCountSchema,
    });
  } catch (error) {
    logger.error({ error, message: NOTIFICATION_UNREAD_COUNT_ROUTE_LOG.failureMessage, metadata });

    return createNotificationJsonResponse(
      { message: NOTIFICATION_ROUTE_RESPONSE.unexpectedInboxMessage },
      NOTIFICATION_ROUTE_HTTP_STATUS.serverError
    );
  }
}
