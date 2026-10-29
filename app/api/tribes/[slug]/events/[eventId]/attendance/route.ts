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
import {
  TRIBE_EVENT_ROUTE_HTTP_STATUS,
  TRIBE_EVENT_ROUTE_RESPONSE,
  mapTribeEventAttendanceReportStatusResponse,
  mapTribeEventAttendanceStatusResponse,
} from "@/src/modules/events/infrastructure/api/tribe-event-route-responses";
import {
  handleTribeEventRoute,
  openTribeEventScope,
  readEventOccurrenceLogMetadata,
  type TribeEventRouteContext,
} from "../../tribe-event-route";

const ATTENDANCE_ROUTE_LOG = {
  clearFailureMessage: "Tribe event attendance clear failed",
  operation: "tribe-event-attendance",
  reportFailureMessage: "Tribe event attendance report failed",
  setFailureMessage: "Tribe event attendance save failed",
} as const;

/**
 * Manager-only attendance of the occurrence given in the `occurrence` query
 * param: answers grouped by status and, for series, the recent going trend.
 * Authorization is enforced by the use case (403 for everyone else).
 */
export async function GET(request: Request, context: TribeEventRouteContext) {
  return handleTribeEventRoute(
    request,
    context,
    {
      failure: {
        logMessage: ATTENDANCE_ROUTE_LOG.reportFailureMessage,
        responseMessage: TRIBE_EVENT_ROUTE_RESPONSE.unexpectedAttendanceReportMessage,
      },
      openScope: openTribeEventScope(ATTENDANCE_ROUTE_LOG.operation),
      readLogMetadata: readEventOccurrenceLogMetadata("occurrenceStartsAt"),
      schemas: {
        params: tribeEventRouteParamsSchema,
        query: tribeEventOccurrenceQuerySchema,
      },
    },
    async ({ modules, params, query, respond }) => {
      const result = await modules.events.useCases.getTribeEventAttendanceReport({
        eventId: params.eventId,
        occurrenceStartsAt: query.occurrence,
        tribeSlug: params.slug,
      });

      if (result.status === TRIBE_EVENT_MUTATION_STATUS.found) {
        return respond(
          { report: result.report },
          tribeEventAttendanceReportResponseSchema,
          TRIBE_EVENT_ROUTE_HTTP_STATUS.ok
        );
      }

      return mapTribeEventAttendanceReportStatusResponse(result.status);
    }
  );
}

/**
 * Records the viewer's answer ("going", "maybe", "not going") for one
 * occurrence. A "going" answer on a full occurrence is stored as waitlisted.
 */
export async function PUT(request: Request, context: TribeEventRouteContext) {
  return handleTribeEventRoute(
    request,
    context,
    {
      failure: {
        logMessage: ATTENDANCE_ROUTE_LOG.setFailureMessage,
        responseMessage: TRIBE_EVENT_ROUTE_RESPONSE.unexpectedAttendanceMessage,
      },
      openScope: openTribeEventScope(ATTENDANCE_ROUTE_LOG.operation),
      readLogMetadata: ({ params }) => ({ eventId: params.eventId, slug: params.slug }),
      schemas: {
        body: tribeEventAttendanceBodySchema,
        params: tribeEventRouteParamsSchema,
        query: tribeEventEmptyQuerySchema,
      },
    },
    async ({ body, modules, params, respond }) => {
      const result = await modules.events.useCases.setTribeEventAttendance({
        ...body,
        eventId: params.eventId,
        tribeSlug: params.slug,
      });

      if (result.status === TRIBE_EVENT_MUTATION_STATUS.attendanceSaved) {
        return respond(
          {
            attendance: result.attendance,
            message:
              result.attendance.viewerStatus === TRIBE_EVENT_ATTENDANCE_STATUS.waitlisted
                ? TRIBE_EVENT_ROUTE_RESPONSE.attendanceWaitlistedMessage
                : TRIBE_EVENT_ROUTE_RESPONSE.attendanceSavedMessage,
          },
          tribeEventAttendanceResponseSchema,
          TRIBE_EVENT_ROUTE_HTTP_STATUS.ok
        );
      }

      return mapTribeEventAttendanceStatusResponse(result.status);
    }
  );
}

/**
 * Removes the viewer's answer for the occurrence given in the `occurrence`
 * query param. Freeing a seat promotes the first person on the waitlist.
 */
export async function DELETE(request: Request, context: TribeEventRouteContext) {
  return handleTribeEventRoute(
    request,
    context,
    {
      failure: {
        logMessage: ATTENDANCE_ROUTE_LOG.clearFailureMessage,
        responseMessage: TRIBE_EVENT_ROUTE_RESPONSE.unexpectedAttendanceMessage,
      },
      openScope: openTribeEventScope(ATTENDANCE_ROUTE_LOG.operation),
      readLogMetadata: ({ params }) => ({ eventId: params.eventId, slug: params.slug }),
      schemas: {
        params: tribeEventRouteParamsSchema,
        query: tribeEventOccurrenceQuerySchema,
      },
    },
    async ({ modules, params, query, respond }) => {
      const result = await modules.events.useCases.clearTribeEventAttendance({
        eventId: params.eventId,
        occurrenceStartsAt: query.occurrence,
        tribeSlug: params.slug,
      });

      if (result.status === TRIBE_EVENT_MUTATION_STATUS.attendanceCleared) {
        return respond(
          {
            attendance: result.attendance,
            message: TRIBE_EVENT_ROUTE_RESPONSE.attendanceClearedMessage,
          },
          tribeEventAttendanceResponseSchema,
          TRIBE_EVENT_ROUTE_HTTP_STATUS.ok
        );
      }

      return mapTribeEventAttendanceStatusResponse(result.status);
    }
  );
}
