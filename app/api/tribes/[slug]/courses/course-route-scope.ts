/**
 * Opens the request scope of the course management route handlers. It lives
 * apart from `route-helpers` because it composes the request modules
 * (composition root), while the helpers stay pure.
 *
 * @module course-route-scope
 */

import {
  handleMemberRoute,
  type MemberRouteFailureCopy,
  type OpenMemberRouteScope,
} from "@/app/api/member-route-scope";
import { COURSE_ROUTE_LOG, COURSE_ROUTE_RESPONSE } from "./route-helpers";

/**
 * Runs a course management route: opens the member scope (401 without a
 * session) and answers a thrown error with the logged, safe 500.
 *
 * @param request - Incoming request.
 * @param failure - Failure copy and log metadata (the viewer id is appended).
 * @param handle - Route body run with the open scope.
 * @returns The route response.
 */
export function runCourseRoute(
  request: Request,
  failure: MemberRouteFailureCopy,
  handle: (scope: OpenMemberRouteScope) => Promise<Response>
): Promise<Response> {
  return handleMemberRoute(
    request,
    {
      feature: COURSE_ROUTE_LOG.feature,
      operation: COURSE_ROUTE_LOG.operation,
      unauthorizedMessage: COURSE_ROUTE_RESPONSE.unauthorizedMessage,
    },
    failure,
    handle
  );
}
