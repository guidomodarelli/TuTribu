import { notificationMarkReadResponseSchema } from "@/src/modules/notifications/application/results/notification-public-dto-schemas";
import { NOTIFICATION_MUTATION_STATUS } from "@/src/modules/notifications/constants/notifications";
import {
  notificationEmptyQuerySchema,
  notificationMarkReadBodySchema,
  notificationRouteParamsSchema,
} from "@/src/modules/notifications/infrastructure/api/notification-request-schemas";
import {
  NOTIFICATION_ROUTE_HTTP_STATUS,
  NOTIFICATION_ROUTE_RESPONSE,
  createNotificationJsonResponse,
  createNotificationPublicResponse,
  parseNotificationRouteInput,
} from "@/src/modules/notifications/infrastructure/api/notification-route-http";
import { resolveNotificationRouteSession } from "@/app/api/notifications/notification-route-session";

const NOTIFICATION_MARK_READ_ROUTE_LOG = {
  failureMessage: "Notification mark as read failed",
  operation: "notification-mark-read",
} as const;

type NotificationRouteContext = {
  params: Promise<{ notificationId: string }>;
};

/**
 * Marks one own notification as read (idempotent). Responds with the fresh
 * unread count so the bell updates incrementally; another user's (or an
 * unknown) notification answers 404 without revealing whether it exists.
 */
export async function PATCH(request: Request, context: NotificationRouteContext): Promise<Response> {
  const session = await resolveNotificationRouteSession(request, {
    operation: NOTIFICATION_MARK_READ_ROUTE_LOG.operation,
    unexpectedFailureMessage: NOTIFICATION_ROUTE_RESPONSE.unexpectedMarkMessage,
  });

  if (!session.isResolved) {
    return session.response;
  }

  const { logger, modules } = session;
  const input = await parseNotificationRouteInput({
    logger,
    params: context.params,
    request,
    schemas: {
      body: notificationMarkReadBodySchema,
      params: notificationRouteParamsSchema,
      query: notificationEmptyQuerySchema,
    },
  });

  if (!input.isValid) {
    return input.response;
  }

  const metadata = { ...session.metadata, notificationId: input.params.notificationId };

  try {
    const result = await modules.notifications.useCases.markNotificationRead({
      notificationId: input.params.notificationId,
    });

    if (result.status !== NOTIFICATION_MUTATION_STATUS.marked) {
      return createNotificationJsonResponse(
        { message: NOTIFICATION_ROUTE_RESPONSE.notificationNotFoundMessage },
        NOTIFICATION_ROUTE_HTTP_STATUS.notFound
      );
    }

    return createNotificationPublicResponse({
      body: { unreadCount: result.unreadCount },
      failureMessage: NOTIFICATION_ROUTE_RESPONSE.unexpectedMarkMessage,
      logger,
      metadata,
      schema: notificationMarkReadResponseSchema,
    });
  } catch (error) {
    logger.error({ error, message: NOTIFICATION_MARK_READ_ROUTE_LOG.failureMessage, metadata });

    return createNotificationJsonResponse(
      { message: NOTIFICATION_ROUTE_RESPONSE.unexpectedMarkMessage },
      NOTIFICATION_ROUTE_HTTP_STATUS.serverError
    );
  }
}
