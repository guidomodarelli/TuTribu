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

const POST_EVENT_ROUTE_SCOPE_LOG = {
  setupFailureMessage: "Tribe event post-event route scope setup failed",
} as const;

type RequestModules = Awaited<ReturnType<typeof createRequestModules>>;
type AuthenticatedMember = NonNullable<
  Awaited<ReturnType<RequestModules["auth"]["useCases"]["getAuthenticatedMember"]>>
>;

/**
 * Operation-specific wiring of a post-event route: its log operation and the
 * safe Spanish copy it answers with when the scope cannot be opened.
 */
export type TribeEventPostEventRouteScopeOptions = {
  operation: string;
  unexpectedFailureMessage: string;
};

export type TribeEventPostEventRouteScope =
  | {
      isOpen: true;
      logger: ReturnType<typeof createServerLogger>;
      member: AuthenticatedMember;
      modules: RequestModules;
    }
  | { isOpen: false; response: Response };

/**
 * Composes the request modules and looks up the signed-in member; either
 * step may reject (pool, configuration, Better Auth).
 */
async function loadPostEventRouteSession(requestId: string) {
  const modules = await createRequestModules({ requestId });
  const member = await modules.auth.useCases.getAuthenticatedMember();

  return { member, modules };
}

/**
 * Builds the request scope of one post-event route call. A failure while
 * composing the modules or looking up the Better Auth session is logged here
 * (with `requestId` and the route operation) and becomes the route's safe
 * Spanish 500, so it never escapes as an unclassified framework error.
 *
 * @param request - Incoming request (carries the correlation id).
 * @param options - Log operation and safe failure copy of the route.
 * @returns The open scope, or the response (401 or 500) to return as is.
 */
export async function openTribeEventPostEventRouteScope(
  request: Request,
  options: TribeEventPostEventRouteScopeOptions
): Promise<TribeEventPostEventRouteScope> {
  const { requestId } = resolveRequestContext(request.headers);
  const logger = createServerLogger({
    feature: POST_EVENT_ROUTE_FEATURE,
    operation: options.operation,
    requestId,
  });
  let session: Awaited<ReturnType<typeof loadPostEventRouteSession>>;

  try {
    session = await loadPostEventRouteSession(requestId);
  } catch (error) {
    logger.error({ error, message: POST_EVENT_ROUTE_SCOPE_LOG.setupFailureMessage });

    return {
      isOpen: false,
      response: createJsonResponse(
        { message: options.unexpectedFailureMessage },
        TRIBE_EVENT_ROUTE_HTTP_STATUS.serverError
      ),
    };
  }

  if (!session.member) {
    return {
      isOpen: false,
      response: createJsonResponse(
        { message: TRIBE_EVENT_ROUTE_RESPONSE.unauthorizedMessage },
        TRIBE_EVENT_ROUTE_HTTP_STATUS.unauthorized
      ),
    };
  }

  return { isOpen: true, logger, member: session.member, modules: session.modules };
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
