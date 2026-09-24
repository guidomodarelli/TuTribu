import {
  composeTribeEventPostEventView,
  openTribeEventPostEventRouteScope,
} from "@/app/api/tribes/[slug]/events/post-event-route-scope";
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
import { createTribeEventPublicResponse } from "@/src/modules/events/infrastructure/api/tribe-event-public-response";
import { parseTribeEventRouteInput } from "@/src/modules/events/infrastructure/api/tribe-event-route-input";
import {
  TRIBE_EVENT_ROUTE_HTTP_STATUS,
  TRIBE_EVENT_ROUTE_RESPONSE,
  createJsonResponse,
  mapTribeEventPostEventStatusResponse,
} from "@/src/modules/events/infrastructure/api/tribe-event-route-responses";

const POST_EVENT_ROUTE_LOG = {
  loadFailureMessage: "Tribe event post-event load failed",
  operation: "tribe-event-post-event",
  saveFailureMessage: "Tribe event post-event save failed",
} as const;

type TribeEventRouteContext = {
  params: Promise<{
    eventId: string;
    slug: string;
  }>;
};

/**
 * Post-event view of `?occurrence=` (original start): recording, materials,
 * "¿Cómo estuvo?" counts with the viewer's reaction, and what the viewer may
 * do (manage resources, participate, convert the recording into a lesson).
 */
export async function GET(request: Request, context: TribeEventRouteContext) {
  const scope = await openTribeEventPostEventRouteScope(request, POST_EVENT_ROUTE_LOG.operation);

  if (!scope.isAuthenticated) {
    return scope.response;
  }

  const { logger, member, modules } = scope;
  const input = await parseTribeEventRouteInput({
    logger,
    params: context.params,
    request,
    schemas: { params: tribeEventRouteParamsSchema, query: tribeEventPostEventQuerySchema },
  });

  if (!input.isValid) {
    return input.response;
  }

  const { eventId, slug } = input.params;
  const logMetadata = {
    eventId,
    originalStartsAt: input.query.occurrence,
    slug,
    viewerId: member.id,
  };

  try {
    const result = await modules.events.useCases.getTribeEventPostEvent({
      eventId,
      originalStartsAt: input.query.occurrence,
      tribeSlug: slug,
    });

    if (result.status !== TRIBE_EVENT_MUTATION_STATUS.found) {
      return mapTribeEventPostEventStatusResponse(
        result.status,
        TRIBE_EVENT_ROUTE_RESPONSE.postEventForbiddenMessage
      );
    }

    return createTribeEventPublicResponse({
      body: {
        postEvent: await composeTribeEventPostEventView(modules, slug, result.postEvent),
      },
      failureMessage: TRIBE_EVENT_ROUTE_RESPONSE.unexpectedPostEventLoadMessage,
      logger,
      metadata: logMetadata,
      schema: tribeEventPostEventResponseSchema,
      status: TRIBE_EVENT_ROUTE_HTTP_STATUS.ok,
    });
  } catch (error) {
    logger.error({
      error,
      message: POST_EVENT_ROUTE_LOG.loadFailureMessage,
      metadata: logMetadata,
    });

    return createJsonResponse(
      { message: TRIBE_EVENT_ROUTE_RESPONSE.unexpectedPostEventLoadMessage },
      TRIBE_EVENT_ROUTE_HTTP_STATUS.serverError
    );
  }
}

/**
 * "Agregar grabación y materiales" (event managers): replaces the recording
 * and the materials of a finished occurrence and answers with the fresh
 * post-event view, so the dialog updates without reloading the route. The
 * first recording notifies attendees in the same transaction.
 */
export async function PUT(request: Request, context: TribeEventRouteContext) {
  const scope = await openTribeEventPostEventRouteScope(request, POST_EVENT_ROUTE_LOG.operation);

  if (!scope.isAuthenticated) {
    return scope.response;
  }

  const { logger, member, modules } = scope;
  const input = await parseTribeEventRouteInput({
    logger,
    params: context.params,
    request,
    schemas: {
      body: tribeEventPostEventBodySchema,
      params: tribeEventRouteParamsSchema,
      query: tribeEventEmptyQuerySchema,
    },
  });

  if (!input.isValid) {
    return input.response;
  }

  const { eventId, slug } = input.params;
  const logMetadata = {
    eventId,
    hasRecording: input.body.recordingUrl !== null,
    materialCount: input.body.materials.length,
    originalStartsAt: input.body.occurrenceStartsAt,
    slug,
    viewerId: member.id,
  };

  try {
    const result = await modules.events.useCases.saveTribeEventPostEvent({
      eventId,
      materials: input.body.materials,
      originalStartsAt: input.body.occurrenceStartsAt,
      recordingUrl: input.body.recordingUrl,
      tribeSlug: slug,
    });

    if (result.status !== TRIBE_EVENT_MUTATION_STATUS.postEventSaved) {
      return mapTribeEventPostEventStatusResponse(
        result.status,
        TRIBE_EVENT_ROUTE_RESPONSE.postEventForbiddenMessage
      );
    }

    return createTribeEventPublicResponse({
      body: {
        message: TRIBE_EVENT_ROUTE_RESPONSE.postEventSavedMessage,
        postEvent: await composeTribeEventPostEventView(modules, slug, result.postEvent),
      },
      failureMessage: TRIBE_EVENT_ROUTE_RESPONSE.unexpectedPostEventSaveMessage,
      logger,
      metadata: logMetadata,
      schema: tribeEventPostEventSaveResponseSchema,
      status: TRIBE_EVENT_ROUTE_HTTP_STATUS.ok,
    });
  } catch (error) {
    logger.error({
      error,
      message: POST_EVENT_ROUTE_LOG.saveFailureMessage,
      metadata: logMetadata,
    });

    return createJsonResponse(
      { message: TRIBE_EVENT_ROUTE_RESPONSE.unexpectedPostEventSaveMessage },
      TRIBE_EVENT_ROUTE_HTTP_STATUS.serverError
    );
  }
}
