import {
  LESSON_EVENT_SOURCE_HTTP_STATUS,
  LESSON_EVENT_SOURCE_RESPONSE,
  createLessonEventSourceJsonResponse,
} from "@/src/modules/courses/infrastructure/api/lesson-event-source-http";
import { createRequestModules } from "@/src/modules/setup";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

/**
 * Shared wiring of the "Convertir en lección" route handlers (conversion and
 * conversion targets): request-scoped logger and modules, and the session
 * check.
 */

const LESSON_EVENT_SOURCE_ROUTE_FEATURE = "courses";

const LESSON_EVENT_SOURCE_ROUTE_SCOPE_LOG = {
  setupFailureMessage: "Lesson conversion route scope setup failed",
} as const;

type RequestModules = Awaited<ReturnType<typeof createRequestModules>>;
type AuthenticatedMember = NonNullable<
  Awaited<ReturnType<RequestModules["auth"]["useCases"]["getAuthenticatedMember"]>>
>;

/**
 * Operation-specific wiring of a lesson conversion route: its log operation
 * and the safe Spanish copy it answers with when the scope cannot be opened.
 */
export type LessonEventSourceRouteScopeOptions = {
  operation: string;
  unexpectedFailureMessage: string;
};

export type LessonEventSourceRouteScope =
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
async function loadLessonEventSourceRouteSession(requestId: string) {
  const modules = await createRequestModules({ requestId });
  const member = await modules.auth.useCases.getAuthenticatedMember();

  return { member, modules };
}

/**
 * Builds the request scope of one lesson conversion route call. A failure
 * while composing the modules or looking up the Better Auth session is logged
 * here (with `requestId` and the route operation) and becomes the route's
 * safe Spanish 500, so it never escapes as an unclassified framework error.
 * Follows `resolveNotificationRouteSession`.
 *
 * @param request - Incoming request (carries the correlation id).
 * @param options - Log operation and safe failure copy of the route.
 * @returns The open scope, or the response (401 or 500) to return as is.
 */
export async function openLessonEventSourceRouteScope(
  request: Request,
  options: LessonEventSourceRouteScopeOptions
): Promise<LessonEventSourceRouteScope> {
  const { requestId } = resolveRequestContext(request.headers);
  const logger = createServerLogger({
    feature: LESSON_EVENT_SOURCE_ROUTE_FEATURE,
    operation: options.operation,
    requestId,
  });
  let session: Awaited<ReturnType<typeof loadLessonEventSourceRouteSession>>;

  try {
    session = await loadLessonEventSourceRouteSession(requestId);
  } catch (error) {
    logger.error({ error, message: LESSON_EVENT_SOURCE_ROUTE_SCOPE_LOG.setupFailureMessage });

    return {
      isOpen: false,
      response: createLessonEventSourceJsonResponse(
        { message: options.unexpectedFailureMessage },
        LESSON_EVENT_SOURCE_HTTP_STATUS.serverError
      ),
    };
  }

  if (!session.member) {
    return {
      isOpen: false,
      response: createLessonEventSourceJsonResponse(
        { message: LESSON_EVENT_SOURCE_RESPONSE.unauthorizedMessage },
        LESSON_EVENT_SOURCE_HTTP_STATUS.unauthorized
      ),
    };
  }

  return { isOpen: true, logger, member: session.member, modules: session.modules };
}
