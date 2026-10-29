import {
  tribeEventDeleteResponseSchema,
  tribeEventSaveResponseSchema,
} from "@/src/modules/events/application/results/tribe-event-public-dto-schemas";
import { TRIBE_EVENT_MUTATION_STATUS } from "@/src/modules/events/constants/tribe-events";
import {
  tribeEventEmptyQuerySchema,
  tribeEventMonthQuerySchema,
  tribeEventUpdateBodySchema,
  tribeEventRouteParamsSchema,
} from "@/src/modules/events/infrastructure/api/schemas/tribe-event-request-schemas";
import {
  TRIBE_EVENT_ROUTE_HTTP_STATUS,
  TRIBE_EVENT_ROUTE_RESPONSE,
  mapTribeEventMutationStatusResponse,
} from "@/src/modules/events/infrastructure/api/tribe-event-route-responses";
import {
  handleTribeEventRoute,
  openTribeEventScope,
  readViewerAttendanceStreakFragment,
  type TribeEventRouteContext,
} from "../tribe-event-route";

const EVENT_ROUTE_LOG = {
  deleteFailureMessage: "Tribe event deletion failed",
  operation: "manage-tribe-event",
  updateFailureMessage: "Tribe event update failed",
} as const;

export async function PATCH(request: Request, context: TribeEventRouteContext) {
  return handleTribeEventRoute(
    request,
    context,
    {
      failure: {
        logMessage: EVENT_ROUTE_LOG.updateFailureMessage,
        responseMessage: TRIBE_EVENT_ROUTE_RESPONSE.unexpectedUpdateMessage,
      },
      openScope: openTribeEventScope(EVENT_ROUTE_LOG.operation),
      readLogMetadata: ({ params }) => ({ eventId: params.eventId, slug: params.slug }),
      schemas: {
        body: tribeEventUpdateBodySchema,
        params: tribeEventRouteParamsSchema,
        query: tribeEventMonthQuerySchema,
      },
    },
    async (route) => {
      const { eventId, slug } = route.params;
      const result = await route.modules.events.useCases.updateTribeEvent({
        ...route.body,
        eventId,
        tribeSlug: slug,
        visibleMonth: route.query.month ?? null,
      });

      if (result.status === TRIBE_EVENT_MUTATION_STATUS.updated) {
        // Editing a past series can change the viewer's last finished
        // occurrences: return the recomputed streak next to the result.
        const streakFragment = await readViewerAttendanceStreakFragment(route, {
          eventId,
          tribeSlug: slug,
        });

        return route.respond(
          {
            ...streakFragment,
            event: result.event,
            message: TRIBE_EVENT_ROUTE_RESPONSE.updateSuccessMessage,
            occurrences: result.occurrences,
          },
          tribeEventSaveResponseSchema,
          TRIBE_EVENT_ROUTE_HTTP_STATUS.ok
        );
      }

      return mapTribeEventMutationStatusResponse(result.status);
    }
  );
}

export async function DELETE(request: Request, context: TribeEventRouteContext) {
  return handleTribeEventRoute(
    request,
    context,
    {
      failure: {
        logMessage: EVENT_ROUTE_LOG.deleteFailureMessage,
        responseMessage: TRIBE_EVENT_ROUTE_RESPONSE.unexpectedDeleteMessage,
      },
      openScope: openTribeEventScope(EVENT_ROUTE_LOG.operation),
      readLogMetadata: ({ params }) => ({ eventId: params.eventId, slug: params.slug }),
      schemas: {
        params: tribeEventRouteParamsSchema,
        query: tribeEventEmptyQuerySchema,
      },
    },
    async (route) => {
      const { eventId, slug } = route.params;
      const result = await route.modules.events.useCases.deleteTribeEvent({
        eventId,
        tribeSlug: slug,
      });

      if (result.status === TRIBE_EVENT_MUTATION_STATUS.deleted) {
        const streakFragment = await readViewerAttendanceStreakFragment(route, {
          eventId,
          tribeSlug: slug,
        });

        return route.respond(
          { ...streakFragment, message: TRIBE_EVENT_ROUTE_RESPONSE.deleteSuccessMessage },
          tribeEventDeleteResponseSchema,
          TRIBE_EVENT_ROUTE_HTTP_STATUS.ok
        );
      }

      return mapTribeEventMutationStatusResponse(result.status);
    }
  );
}
