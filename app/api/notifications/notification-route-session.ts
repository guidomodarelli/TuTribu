import {
  NOTIFICATION_ROUTE_HTTP_STATUS,
  NOTIFICATION_ROUTE_RESPONSE,
  createNotificationJsonResponse,
} from "@/src/modules/notifications/infrastructure/api/notification-route-http";
import { createRequestModules } from "@/src/modules/setup";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const NOTIFICATION_ROUTE_LOG_FEATURE = "notifications";

const NOTIFICATION_ROUTE_SESSION_LOG = {
  failureMessage: "Notification route session resolution failed",
} as const;

/**
 * Operation-specific wiring of a notification route: its log operation and
 * the safe Spanish copy it answers with on an unexpected failure.
 */
export type NotificationRouteSessionOptions = {
  operation: string;
  unexpectedFailureMessage: string;
};

/**
 * Composes the request modules and looks up the signed-in member; either
 * step may reject (pool, configuration, Better Auth).
 */
async function loadRequestSession(requestId: string) {
  const modules = await createRequestModules({ requestId });
  const authenticatedMember = await modules.auth.useCases.getAuthenticatedMember();

  return { authenticatedMember, modules };
}

/**
 * Request logger, composed modules, and the signed-in member shared by the
 * notification routes. Without a session the route answers 401 and never
 * touches the inbox. A failure while composing the modules or looking up the
 * Better Auth session is logged here (with `requestId` and the route
 * operation) and becomes the same safe no-store 500 the route handlers use,
 * so it never escapes as an unclassified framework error.
 *
 * @param request - Incoming request (tracing headers).
 * @param options - Log operation and safe failure copy of the route.
 * @returns The resolved context or the response (401 or 500) to return as is.
 */
export async function resolveNotificationRouteSession(
  request: Request,
  options: NotificationRouteSessionOptions
) {
  const { requestId } = resolveRequestContext(request.headers);
  const logger = createServerLogger({
    feature: NOTIFICATION_ROUTE_LOG_FEATURE,
    operation: options.operation,
    requestId,
  });
  let loadedSession: Awaited<ReturnType<typeof loadRequestSession>>;

  try {
    loadedSession = await loadRequestSession(requestId);
  } catch (error) {
    logger.error({ error, message: NOTIFICATION_ROUTE_SESSION_LOG.failureMessage });

    return {
      isResolved: false,
      response: createNotificationJsonResponse(
        { message: options.unexpectedFailureMessage },
        NOTIFICATION_ROUTE_HTTP_STATUS.serverError
      ),
    } as const;
  }

  const { authenticatedMember, modules } = loadedSession;

  if (!authenticatedMember) {
    return {
      isResolved: false,
      response: createNotificationJsonResponse(
        { message: NOTIFICATION_ROUTE_RESPONSE.unauthorizedMessage },
        NOTIFICATION_ROUTE_HTTP_STATUS.unauthorized
      ),
    } as const;
  }

  return {
    isResolved: true,
    logger,
    metadata: { userId: authenticatedMember.id },
    modules,
  } as const;
}
