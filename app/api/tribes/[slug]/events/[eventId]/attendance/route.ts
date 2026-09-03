import { TRIBE_EVENT_MUTATION_STATUS } from "@/src/modules/events/constants/tribe-events";
import {
  TRIBE_EVENT_ROUTE_HTTP_STATUS,
  TRIBE_EVENT_ROUTE_QUERY_PARAM,
  TRIBE_EVENT_ROUTE_RESPONSE,
  createJsonResponse,
  mapTribeEventAttendanceStatusResponse,
  readSearchParam,
  readTribeEventAttendanceBody,
} from "@/src/modules/events/infrastructure/api/tribe-event-route-responses";
import { createRequestModules } from "@/src/modules/setup";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const ATTENDANCE_ROUTE_LOG = {
  clearFailureMessage: "Tribe event attendance clear failed",
  feature: "events",
  operation: "tribe-event-attendance",
  setFailureMessage: "Tribe event attendance save failed",
} as const;

type TribeEventRouteContext = {
  params: Promise<{
    eventId: string;
    slug: string;
  }>;
};

/**
 * Records the viewer's answer ("going" / "not going") for one occurrence.
 */
export async function PUT(request: Request, context: TribeEventRouteContext) {
  const { eventId, slug } = await context.params;
  const { requestId } = resolveRequestContext(request.headers);
  const logger = createServerLogger({
    feature: ATTENDANCE_ROUTE_LOG.feature,
    operation: ATTENDANCE_ROUTE_LOG.operation,
    requestId,
  });
  const modules = await createRequestModules({ requestId });
  const authenticatedMember = await modules.auth.useCases.getAuthenticatedMember();

  if (!authenticatedMember) {
    return createJsonResponse(
      { message: TRIBE_EVENT_ROUTE_RESPONSE.unauthorizedMessage },
      TRIBE_EVENT_ROUTE_HTTP_STATUS.unauthorized
    );
  }

  try {
    const body = await request.json().catch(() => null);
    const result = await modules.events.useCases.setTribeEventAttendance({
      ...readTribeEventAttendanceBody(body),
      eventId,
      tribeSlug: slug,
    });

    if (result.status === TRIBE_EVENT_MUTATION_STATUS.attendanceSaved) {
      return createJsonResponse(
        {
          attendance: result.attendance,
          message: TRIBE_EVENT_ROUTE_RESPONSE.attendanceSavedMessage,
        },
        TRIBE_EVENT_ROUTE_HTTP_STATUS.ok
      );
    }

    return mapTribeEventAttendanceStatusResponse(result.status);
  } catch (error) {
    logger.error({
      message: ATTENDANCE_ROUTE_LOG.setFailureMessage,
      error,
      metadata: {
        eventId,
        slug,
        viewerId: authenticatedMember.id,
      },
    });

    return createJsonResponse(
      { message: TRIBE_EVENT_ROUTE_RESPONSE.unexpectedAttendanceMessage },
      TRIBE_EVENT_ROUTE_HTTP_STATUS.serverError
    );
  }
}

/**
 * Removes the viewer's answer for the occurrence given in the `occurrence`
 * query param.
 */
export async function DELETE(request: Request, context: TribeEventRouteContext) {
  const { eventId, slug } = await context.params;
  const { requestId } = resolveRequestContext(request.headers);
  const logger = createServerLogger({
    feature: ATTENDANCE_ROUTE_LOG.feature,
    operation: ATTENDANCE_ROUTE_LOG.operation,
    requestId,
  });
  const modules = await createRequestModules({ requestId });
  const authenticatedMember = await modules.auth.useCases.getAuthenticatedMember();

  if (!authenticatedMember) {
    return createJsonResponse(
      { message: TRIBE_EVENT_ROUTE_RESPONSE.unauthorizedMessage },
      TRIBE_EVENT_ROUTE_HTTP_STATUS.unauthorized
    );
  }

  try {
    const result = await modules.events.useCases.clearTribeEventAttendance({
      eventId,
      occurrenceStartsAt:
        readSearchParam(request, TRIBE_EVENT_ROUTE_QUERY_PARAM.occurrence) ?? "",
      tribeSlug: slug,
    });

    if (result.status === TRIBE_EVENT_MUTATION_STATUS.attendanceCleared) {
      return createJsonResponse(
        {
          attendance: result.attendance,
          message: TRIBE_EVENT_ROUTE_RESPONSE.attendanceClearedMessage,
        },
        TRIBE_EVENT_ROUTE_HTTP_STATUS.ok
      );
    }

    return mapTribeEventAttendanceStatusResponse(result.status);
  } catch (error) {
    logger.error({
      message: ATTENDANCE_ROUTE_LOG.clearFailureMessage,
      error,
      metadata: {
        eventId,
        slug,
        viewerId: authenticatedMember.id,
      },
    });

    return createJsonResponse(
      { message: TRIBE_EVENT_ROUTE_RESPONSE.unexpectedAttendanceMessage },
      TRIBE_EVENT_ROUTE_HTTP_STATUS.serverError
    );
  }
}
