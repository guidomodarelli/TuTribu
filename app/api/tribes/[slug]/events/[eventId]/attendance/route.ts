import {
  tribeEventAttendanceReportResponseSchema,
  tribeEventAttendanceResponseSchema,
} from "@/src/modules/events/application/results/tribe-event-public-dto-schemas";
import {
  TRIBE_EVENT_ATTENDANCE_STATUS,
  TRIBE_EVENT_MUTATION_STATUS,
} from "@/src/modules/events/constants/tribe-events";
import {
  tribeEventAttendanceBodySchema,
  tribeEventEmptyQuerySchema,
  tribeEventOccurrenceQuerySchema,
  tribeEventRouteParamsSchema,
} from "@/src/modules/events/infrastructure/api/schemas/tribe-event-request-schemas";
import { createTribeEventPublicResponse } from "@/src/modules/events/infrastructure/api/tribe-event-public-response";
import { parseTribeEventRouteInput } from "@/src/modules/events/infrastructure/api/tribe-event-route-input";
import {
  TRIBE_EVENT_ROUTE_HTTP_STATUS,
  TRIBE_EVENT_ROUTE_RESPONSE,
  createJsonResponse,
  mapTribeEventAttendanceReportStatusResponse,
  mapTribeEventAttendanceStatusResponse,
} from "@/src/modules/events/infrastructure/api/tribe-event-route-responses";
import { createRequestModules } from "@/src/modules/setup";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const ATTENDANCE_ROUTE_LOG = {
  clearFailureMessage: "Tribe event attendance clear failed",
  feature: "events",
  operation: "tribe-event-attendance",
  reportFailureMessage: "Tribe event attendance report failed",
  setFailureMessage: "Tribe event attendance save failed",
} as const;

type TribeEventRouteContext = {
  params: Promise<{
    eventId: string;
    slug: string;
  }>;
};

/**
 * Manager-only attendance of the occurrence given in the `occurrence` query
 * param: answers grouped by status and, for series, the recent going trend.
 * Authorization is enforced by the use case (403 for everyone else).
 */
export async function GET(request: Request, context: TribeEventRouteContext) {
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

  const input = await parseTribeEventRouteInput({
    logger,
    params: context.params,
    request,
    schemas: {
      params: tribeEventRouteParamsSchema,
      query: tribeEventOccurrenceQuerySchema,
    },
  });

  if (!input.isValid) {
    return input.response;
  }

  const { eventId, slug } = input.params;
  const occurrenceStartsAt = input.query.occurrence;
  const logMetadata = {
    eventId,
    occurrenceStartsAt,
    slug,
    viewerId: authenticatedMember.id,
  };

  try {
    const result = await modules.events.useCases.getTribeEventAttendanceReport({
      eventId,
      occurrenceStartsAt,
      tribeSlug: slug,
    });

    if (result.status === TRIBE_EVENT_MUTATION_STATUS.found) {
      return createTribeEventPublicResponse({
        body: { report: result.report },
        failureMessage: TRIBE_EVENT_ROUTE_RESPONSE.unexpectedAttendanceReportMessage,
        logger,
        metadata: logMetadata,
        schema: tribeEventAttendanceReportResponseSchema,
        status: TRIBE_EVENT_ROUTE_HTTP_STATUS.ok,
      });
    }

    return mapTribeEventAttendanceReportStatusResponse(result.status);
  } catch (error) {
    logger.error({
      message: ATTENDANCE_ROUTE_LOG.reportFailureMessage,
      error,
      metadata: logMetadata,
    });

    return createJsonResponse(
      { message: TRIBE_EVENT_ROUTE_RESPONSE.unexpectedAttendanceReportMessage },
      TRIBE_EVENT_ROUTE_HTTP_STATUS.serverError
    );
  }
}

/**
 * Records the viewer's answer ("going", "maybe", "not going") for one
 * occurrence. A "going" answer on a full occurrence is stored as waitlisted.
 */
export async function PUT(request: Request, context: TribeEventRouteContext) {
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

  const input = await parseTribeEventRouteInput({
    logger,
    params: context.params,
    request,
    schemas: {
      body: tribeEventAttendanceBodySchema,
      params: tribeEventRouteParamsSchema,
      query: tribeEventEmptyQuerySchema,
    },
  });

  if (!input.isValid) {
    return input.response;
  }

  const { eventId, slug } = input.params;
  const logMetadata = { eventId, slug, viewerId: authenticatedMember.id };

  try {
    const result = await modules.events.useCases.setTribeEventAttendance({
      ...input.body,
      eventId,
      tribeSlug: slug,
    });

    if (result.status === TRIBE_EVENT_MUTATION_STATUS.attendanceSaved) {
      return createTribeEventPublicResponse({
        body: {
          attendance: result.attendance,
          message:
            result.attendance.viewerStatus === TRIBE_EVENT_ATTENDANCE_STATUS.waitlisted
              ? TRIBE_EVENT_ROUTE_RESPONSE.attendanceWaitlistedMessage
              : TRIBE_EVENT_ROUTE_RESPONSE.attendanceSavedMessage,
        },
        failureMessage: TRIBE_EVENT_ROUTE_RESPONSE.unexpectedAttendanceMessage,
        logger,
        metadata: logMetadata,
        schema: tribeEventAttendanceResponseSchema,
        status: TRIBE_EVENT_ROUTE_HTTP_STATUS.ok,
      });
    }

    return mapTribeEventAttendanceStatusResponse(result.status);
  } catch (error) {
    logger.error({
      message: ATTENDANCE_ROUTE_LOG.setFailureMessage,
      error,
      metadata: logMetadata,
    });

    return createJsonResponse(
      { message: TRIBE_EVENT_ROUTE_RESPONSE.unexpectedAttendanceMessage },
      TRIBE_EVENT_ROUTE_HTTP_STATUS.serverError
    );
  }
}

/**
 * Removes the viewer's answer for the occurrence given in the `occurrence`
 * query param. Freeing a seat promotes the first person on the waitlist.
 */
export async function DELETE(request: Request, context: TribeEventRouteContext) {
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

  const input = await parseTribeEventRouteInput({
    logger,
    params: context.params,
    request,
    schemas: {
      params: tribeEventRouteParamsSchema,
      query: tribeEventOccurrenceQuerySchema,
    },
  });

  if (!input.isValid) {
    return input.response;
  }

  const { eventId, slug } = input.params;
  const logMetadata = { eventId, slug, viewerId: authenticatedMember.id };

  try {
    const result = await modules.events.useCases.clearTribeEventAttendance({
      eventId,
      occurrenceStartsAt: input.query.occurrence,
      tribeSlug: slug,
    });

    if (result.status === TRIBE_EVENT_MUTATION_STATUS.attendanceCleared) {
      return createTribeEventPublicResponse({
        body: {
          attendance: result.attendance,
          message: TRIBE_EVENT_ROUTE_RESPONSE.attendanceClearedMessage,
        },
        failureMessage: TRIBE_EVENT_ROUTE_RESPONSE.unexpectedAttendanceMessage,
        logger,
        metadata: logMetadata,
        schema: tribeEventAttendanceResponseSchema,
        status: TRIBE_EVENT_ROUTE_HTTP_STATUS.ok,
      });
    }

    return mapTribeEventAttendanceStatusResponse(result.status);
  } catch (error) {
    logger.error({
      message: ATTENDANCE_ROUTE_LOG.clearFailureMessage,
      error,
      metadata: logMetadata,
    });

    return createJsonResponse(
      { message: TRIBE_EVENT_ROUTE_RESPONSE.unexpectedAttendanceMessage },
      TRIBE_EVENT_ROUTE_HTTP_STATUS.serverError
    );
  }
}
