import type { TribeEventPostEventResult } from "@/src/modules/events/application/results/tribe-event-post-event-result";
import type { TribeEventPostEventView } from "@/src/modules/events/application/results/tribe-event-post-event-public-dto-schemas";
import {
  TRIBE_EVENT_ROUTE_HTTP_STATUS,
  TRIBE_EVENT_ROUTE_RESPONSE,
  createJsonResponse,
} from "@/src/modules/events/infrastructure/api/tribe-event-route-responses";
import { createRequestModules } from "@/src/modules/setup";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

/**
 * Shared wiring of the post-event route handlers (resources, reaction,
 * conversation): request-scoped logger and modules, and the session check.
 */

const POST_EVENT_ROUTE_FEATURE = "events";

type RequestModules = Awaited<ReturnType<typeof createRequestModules>>;
type AuthenticatedMember = NonNullable<
  Awaited<ReturnType<RequestModules["auth"]["useCases"]["getAuthenticatedMember"]>>
>;

export type TribeEventPostEventRouteScope =
  | {
      isAuthenticated: true;
      logger: ReturnType<typeof createServerLogger>;
      member: AuthenticatedMember;
      modules: RequestModules;
    }
  | { isAuthenticated: false; response: Response };

/**
 * Builds the request scope of one post-event route call.
 *
 * @param request - Incoming request (carries the correlation id).
 * @param operation - Stable operation key of the route for the logs.
 * @returns The scope, or the 401 response when there is no session.
 */
export async function openTribeEventPostEventRouteScope(
  request: Request,
  operation: string
): Promise<TribeEventPostEventRouteScope> {
  const { requestId } = resolveRequestContext(request.headers);
  const logger = createServerLogger({ feature: POST_EVENT_ROUTE_FEATURE, operation, requestId });
  const modules = await createRequestModules({ requestId });
  const member = await modules.auth.useCases.getAuthenticatedMember();

  if (!member) {
    return {
      isAuthenticated: false,
      response: createJsonResponse(
        { message: TRIBE_EVENT_ROUTE_RESPONSE.unauthorizedMessage },
        TRIBE_EVENT_ROUTE_HTTP_STATUS.unauthorized
      ),
    };
  }

  return { isAuthenticated: true, logger, member, modules };
}

/**
 * Adds the courses permission to the post-event view: "Convertir en lección"
 * is offered only when there is a recording and the viewer manages the tribe
 * courses (asked to the courses module only in that case).
 *
 * @param modules - Request-scoped modules.
 * @param tribeSlug - Tribe of the occurrence.
 * @param postEvent - Post-event result of the events module.
 * @returns The public view before DTO validation.
 */
export async function composeTribeEventPostEventView(
  modules: RequestModules,
  tribeSlug: string,
  postEvent: TribeEventPostEventResult
): Promise<TribeEventPostEventView> {
  const canConvertToLesson =
    postEvent.recording !== null &&
    (await modules.courses.useCases.canManageTribeCourses({ tribeSlug }));

  return {
    ...postEvent,
    viewerPermissions: { ...postEvent.viewerPermissions, canConvertToLesson },
  };
}
