import {
  NOTIFICATION_ROUTE_HTTP_STATUS,
  NOTIFICATION_ROUTE_RESPONSE,
  createNotificationJsonResponse,
} from "@/src/modules/notifications/infrastructure/api/notification-route-http";
import { createRequestModules } from "@/src/modules/setup";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const NOTIFICATION_ROUTE_LOG_FEATURE = "notifications";

/**
 * Request logger, composed modules, and the signed-in member shared by the
 * notification routes. Without a session the route answers 401 and never
 * touches the inbox.
 *
 * @param request - Incoming request (tracing headers).
 * @param operation - Log operation of the route.
 * @returns The resolved context or the 401 response to return as is.
 */
export async function resolveNotificationRouteSession(request: Request, operation: string) {
  const { requestId } = resolveRequestContext(request.headers);
  const logger = createServerLogger({
    feature: NOTIFICATION_ROUTE_LOG_FEATURE,
    operation,
    requestId,
  });
  const modules = await createRequestModules({ requestId });
  const authenticatedMember = await modules.auth.useCases.getAuthenticatedMember();

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
