import { composeTribeEventPostEventView } from "@/app/api/tribes/[slug]/events/post-event-route-scope";
import {
  tribeEventPostEventResponseSchema,
  tribeEventPostEventSaveResponseSchema,
} from "@/src/modules/events/application/results/tribe-event-post-event-public-dto-schemas";
import { TRIBE_EVENT_MUTATION_STATUS } from "@/src/modules/events/constants/tribe-events";
import {
  tribeEventPostEventBodySchema,
  tribeEventPostEventQuerySchema,
} from "@/src/modules/events/infrastructure/api/schemas/tribe-event-post-event-request-schemas";
import {
  tribeEventEmptyQuerySchema,
  tribeEventRouteParamsSchema,
} from "@/src/modules/events/infrastructure/api/schemas/tribe-event-request-schemas";
import {
  TRIBE_EVENT_ROUTE_HTTP_STATUS,
  TRIBE_EVENT_ROUTE_RESPONSE,
  mapTribeEventPostEventStatusResponse,
} from "@/src/modules/events/infrastructure/api/tribe-event-route-responses";
import {
  handleTribeEventRoute,
  openTribeEventPostEventScope,
  readEventOccurrenceLogMetadata,
  type TribeEventRouteContext,
} from "../../tribe-event-route";

const POST_EVENT_ROUTE_LOG = {
  loadFailureMessage: "Tribe event post-event load failed",
  operation: "tribe-event-post-event",
  saveFailureMessage: "Tribe event post-event save failed",
} as const;

/**
 * Post-event view of `?occurrence=` (original start): recording, materials,
 * "¿Cómo estuvo?" counts with the viewer's reaction, and what the viewer may
 * do (manage resources, participate, convert the recording into a lesson).
 */
export async function GET(request: Request, context: TribeEventRouteContext) {
  return handleTribeEventRoute(
    request,
    context,
    {
      failure: {
        logMessage: POST_EVENT_ROUTE_LOG.loadFailureMessage,
        responseMessage: TRIBE_EVENT_ROUTE_RESPONSE.unexpectedPostEventLoadMessage,
      },
      openScope: openTribeEventPostEventScope(
        POST_EVENT_ROUTE_LOG.operation,
        TRIBE_EVENT_ROUTE_RESPONSE.unexpectedPostEventLoadMessage
      ),
      readLogMetadata: readEventOccurrenceLogMetadata("originalStartsAt"),
      schemas: { params: tribeEventRouteParamsSchema, query: tribeEventPostEventQuerySchema },
    },
    async ({ modules, params, query, respond }) => {
      const result = await modules.events.useCases.getTribeEventPostEvent({
        eventId: params.eventId,
        originalStartsAt: query.occurrence,
        tribeSlug: params.slug,
      });

      if (result.status !== TRIBE_EVENT_MUTATION_STATUS.found) {
        return mapTribeEventPostEventStatusResponse(
          result.status,
          TRIBE_EVENT_ROUTE_RESPONSE.postEventForbiddenMessage
        );
      }

      return respond(
        {
          postEvent: await composeTribeEventPostEventView(modules, params.slug, result.postEvent),
        },
        tribeEventPostEventResponseSchema,
        TRIBE_EVENT_ROUTE_HTTP_STATUS.ok
      );
    }
  );
}

/**
 * "Agregar grabación y materiales" (event managers): replaces the recording
 * and the materials of a finished occurrence and answers with the fresh
 * post-event view, so the dialog updates without reloading the route. The
 * first recording notifies attendees in the same transaction.
 */
export async function PUT(request: Request, context: TribeEventRouteContext) {
  return handleTribeEventRoute(
    request,
    context,
    {
      failure: {
        logMessage: POST_EVENT_ROUTE_LOG.saveFailureMessage,
        responseMessage: TRIBE_EVENT_ROUTE_RESPONSE.unexpectedPostEventSaveMessage,
      },
      openScope: openTribeEventPostEventScope(
        POST_EVENT_ROUTE_LOG.operation,
        TRIBE_EVENT_ROUTE_RESPONSE.unexpectedPostEventSaveMessage
      ),
      readLogMetadata: ({ body, params }) => ({
        eventId: params.eventId,
        hasRecording: body.recordingUrl !== null,
        materialCount: body.materials.length,
        originalStartsAt: body.occurrenceStartsAt,
        slug: params.slug,
      }),
      schemas: {
        body: tribeEventPostEventBodySchema,
        params: tribeEventRouteParamsSchema,
        query: tribeEventEmptyQuerySchema,
      },
    },
    async ({ body, modules, params, respond }) => {
      const result = await modules.events.useCases.saveTribeEventPostEvent({
        eventId: params.eventId,
        materials: body.materials,
        originalStartsAt: body.occurrenceStartsAt,
        recordingUrl: body.recordingUrl,
        tribeSlug: params.slug,
      });

      if (result.status !== TRIBE_EVENT_MUTATION_STATUS.postEventSaved) {
        return mapTribeEventPostEventStatusResponse(
          result.status,
          TRIBE_EVENT_ROUTE_RESPONSE.postEventForbiddenMessage
        );
      }

      return respond(
        {
          message: TRIBE_EVENT_ROUTE_RESPONSE.postEventSavedMessage,
          postEvent: await composeTribeEventPostEventView(modules, params.slug, result.postEvent),
        },
        tribeEventPostEventSaveResponseSchema,
        TRIBE_EVENT_ROUTE_HTTP_STATUS.ok
      );
    }
  );
}
