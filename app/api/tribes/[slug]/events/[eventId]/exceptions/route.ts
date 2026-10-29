import { tribeEventExceptionResponseSchema } from "@/src/modules/events/application/results/tribe-event-public-dto-schemas";
import {
  TRIBE_EVENT_MUTATION_STATUS,
  TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND,
} from "@/src/modules/events/constants/tribe-events";
import {
  tribeEventExceptionClearQuerySchema,
  tribeEventExceptionSaveQuerySchema,
  tribeEventOccurrenceExceptionBodySchema,
} from "@/src/modules/events/infrastructure/api/schemas/tribe-event-exception-request-schemas";
import { tribeEventRouteParamsSchema } from "@/src/modules/events/infrastructure/api/schemas/tribe-event-request-schemas";
import {
  TRIBE_EVENT_ROUTE_HTTP_STATUS,
  TRIBE_EVENT_ROUTE_RESPONSE,
  mapTribeEventExceptionStatusResponse,
} from "@/src/modules/events/infrastructure/api/tribe-event-route-responses";
import {
  handleTribeEventRoute,
  openTribeEventScope,
  readEventOccurrenceLogMetadata,
  type TribeEventRouteContext,
} from "../../tribe-event-route";

const EXCEPTION_ROUTE_LOG = {
  clearFailureMessage: "Tribe event occurrence restore failed",
  operation: "tribe-event-occurrence-exception",
  saveFailureMessage: "Tribe event occurrence exception failed",
} as const;

/**
 * "Cancelar esta fecha" / "Mover esta fecha": stores the exception of one
 * date of a series (managers only) and answers with the series slots of the
 * visible month (`?month=`) so the calendar updates without a reload.
 */
export async function PUT(request: Request, context: TribeEventRouteContext) {
  return handleTribeEventRoute(
    request,
    context,
    {
      failure: {
        logMessage: EXCEPTION_ROUTE_LOG.saveFailureMessage,
        responseMessage: TRIBE_EVENT_ROUTE_RESPONSE.unexpectedExceptionMessage,
      },
      openScope: openTribeEventScope(EXCEPTION_ROUTE_LOG.operation),
      readLogMetadata: ({ body, params }) => ({
        eventId: params.eventId,
        kind: body.kind,
        originalStartsAt: body.originalStartsAt,
        slug: params.slug,
      }),
      schemas: {
        body: tribeEventOccurrenceExceptionBodySchema,
        params: tribeEventRouteParamsSchema,
        query: tribeEventExceptionSaveQuerySchema,
      },
    },
    async ({ body, modules, params, query, respond }) => {
      const result = await modules.events.useCases.saveTribeEventOccurrenceException({
        ...body,
        eventId: params.eventId,
        tribeSlug: params.slug,
        visibleMonth: query.month ?? null,
      });

      if (result.status !== TRIBE_EVENT_MUTATION_STATUS.exceptionSaved) {
        return mapTribeEventExceptionStatusResponse(result.status);
      }

      return respond(
        {
          message:
            body.kind === TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND.moved
              ? TRIBE_EVENT_ROUTE_RESPONSE.exceptionMovedMessage
              : TRIBE_EVENT_ROUTE_RESPONSE.exceptionCancelledMessage,
          occurrences: result.occurrences,
        },
        tribeEventExceptionResponseSchema,
        TRIBE_EVENT_ROUTE_HTTP_STATUS.ok
      );
    }
  );
}

/**
 * "Restaurar fecha": removes the exception of `?occurrence=` (original
 * start) and answers with the visible month (`?month=`).
 */
export async function DELETE(request: Request, context: TribeEventRouteContext) {
  return handleTribeEventRoute(
    request,
    context,
    {
      failure: {
        logMessage: EXCEPTION_ROUTE_LOG.clearFailureMessage,
        responseMessage: TRIBE_EVENT_ROUTE_RESPONSE.unexpectedExceptionMessage,
      },
      openScope: openTribeEventScope(EXCEPTION_ROUTE_LOG.operation),
      readLogMetadata: readEventOccurrenceLogMetadata("originalStartsAt"),
      schemas: {
        params: tribeEventRouteParamsSchema,
        query: tribeEventExceptionClearQuerySchema,
      },
    },
    async ({ modules, params, query, respond }) => {
      const result = await modules.events.useCases.clearTribeEventOccurrenceException({
        eventId: params.eventId,
        originalStartsAt: query.occurrence,
        tribeSlug: params.slug,
        visibleMonth: query.month ?? null,
      });

      if (result.status !== TRIBE_EVENT_MUTATION_STATUS.exceptionCleared) {
        return mapTribeEventExceptionStatusResponse(result.status);
      }

      return respond(
        {
          message: TRIBE_EVENT_ROUTE_RESPONSE.exceptionClearedMessage,
          occurrences: result.occurrences,
        },
        tribeEventExceptionResponseSchema,
        TRIBE_EVENT_ROUTE_HTTP_STATUS.ok
      );
    }
  );
}
