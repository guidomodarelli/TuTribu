import {
  tribeEventListResponseSchema,
  tribeEventSaveResponseSchema,
} from "@/src/modules/events/application/results/tribe-event-public-dto-schemas";
import { TRIBE_EVENT_MUTATION_STATUS } from "@/src/modules/events/constants/tribe-events";
import {
  tribeEventListQuerySchema,
  tribeEventMonthQuerySchema,
  tribeEventMutationBodySchema,
  tribeEventsRouteParamsSchema,
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
  type TribeEventsRouteContext,
} from "./tribe-event-route";

const EVENT_ROUTE_LOG = {
  createFailureMessage: "Tribe event creation failed",
  listFailureMessage: "Tribe event listing failed",
  operation: "manage-tribe-events",
} as const;

export async function GET(request: Request, context: TribeEventsRouteContext) {
  return handleTribeEventRoute(
    request,
    context,
    {
      failure: {
        logMessage: EVENT_ROUTE_LOG.listFailureMessage,
        responseMessage: TRIBE_EVENT_ROUTE_RESPONSE.unexpectedListMessage,
      },
      openScope: openTribeEventScope(EVENT_ROUTE_LOG.operation),
      schemas: {
        params: tribeEventsRouteParamsSchema,
        query: tribeEventListQuerySchema,
      },
    },
    async ({ modules, params, query, respond }) => {
      const result = await modules.events.useCases.listTribeEvents({
        eventTypes: query.type ?? [],
        month: query.month ?? null,
        occurrence: null,
        tribeSlug: params.slug,
      });

      return respond(result, tribeEventListResponseSchema, TRIBE_EVENT_ROUTE_HTTP_STATUS.ok);
    }
  );
}

export async function POST(request: Request, context: TribeEventsRouteContext) {
  return handleTribeEventRoute(
    request,
    context,
    {
      failure: {
        logMessage: EVENT_ROUTE_LOG.createFailureMessage,
        responseMessage: TRIBE_EVENT_ROUTE_RESPONSE.unexpectedCreateMessage,
      },
      openScope: openTribeEventScope(EVENT_ROUTE_LOG.operation),
      schemas: {
        body: tribeEventMutationBodySchema,
        params: tribeEventsRouteParamsSchema,
        query: tribeEventMonthQuerySchema,
      },
    },
    async (route) => {
      const { slug } = route.params;
      const result = await route.modules.events.useCases.createTribeEvent({
        ...route.body,
        tribeSlug: slug,
        visibleMonth: route.query.month ?? null,
      });

      if (result.status === TRIBE_EVENT_MUTATION_STATUS.created) {
        // A new event can start in the past, so it may displace one of the
        // viewer's last finished occurrences, or end before the instant the
        // calendar watches: return the recomputed streak and next refresh.
        const streakFragment = await readViewerAttendanceStreakFragment(route, {
          eventId: result.event.id,
          tribeSlug: slug,
        });

        return route.respond(
          {
            ...streakFragment,
            event: result.event,
            message: TRIBE_EVENT_ROUTE_RESPONSE.createSuccessMessage,
            occurrences: result.occurrences,
          },
          tribeEventSaveResponseSchema,
          TRIBE_EVENT_ROUTE_HTTP_STATUS.created
        );
      }

      return mapTribeEventMutationStatusResponse(result.status);
    }
  );
}
