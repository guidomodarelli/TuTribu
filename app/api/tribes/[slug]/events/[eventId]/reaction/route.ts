import {
  openTribeEventPostEventRouteScope,
  type TribeEventPostEventRouteScope,
} from "@/app/api/tribes/[slug]/events/post-event-route-scope";
import { tribeEventReactionResponseSchema } from "@/src/modules/events/application/results/tribe-event-post-event-public-dto-schemas";
import type { TribeEventOccurrenceReaction } from "@/src/modules/events/domain/entities/tribe-event-post-event";
import { TRIBE_EVENT_MUTATION_STATUS } from "@/src/modules/events/constants/tribe-events";
import {
  tribeEventPostEventQuerySchema,
  tribeEventReactionBodySchema,
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

const REACTION_ROUTE_LOG = {
  failureMessage: "Tribe event occurrence reaction failed",
  operation: "tribe-event-occurrence-reaction",
} as const;

type TribeEventRouteContext = {
  params: Promise<{
    eventId: string;
    slug: string;
  }>;
};

type AuthenticatedScope = Extract<TribeEventPostEventRouteScope, { isAuthenticated: true }>;

/**
 * Saves (or clears, with `reaction: null`) the viewer's reaction and answers
 * with the fresh counts, which the optimistic UI adopts.
 */
async function respondWithReaction(input: {
  eventId: string;
  originalStartsAt: string;
  reaction: TribeEventOccurrenceReaction | null;
  scope: AuthenticatedScope;
  slug: string;
}): Promise<Response> {
  const { eventId, originalStartsAt, reaction, scope, slug } = input;
  const { logger } = scope;
  const logMetadata = { eventId, originalStartsAt, reaction, slug, viewerId: scope.member.id };

  try {
    const result = await scope.modules.events.useCases.setTribeEventOccurrenceReaction({
      eventId,
      originalStartsAt,
      reaction,
      tribeSlug: slug,
    });

    if (
      result.status !== TRIBE_EVENT_MUTATION_STATUS.reactionSaved &&
      result.status !== TRIBE_EVENT_MUTATION_STATUS.reactionCleared
    ) {
      return mapTribeEventPostEventStatusResponse(
        result.status,
        TRIBE_EVENT_ROUTE_RESPONSE.reactionForbiddenMessage
      );
    }

    return createTribeEventPublicResponse({
      body: { reactions: result.reactions },
      failureMessage: TRIBE_EVENT_ROUTE_RESPONSE.unexpectedReactionMessage,
      logger,
      metadata: logMetadata,
      schema: tribeEventReactionResponseSchema,
      status: TRIBE_EVENT_ROUTE_HTTP_STATUS.ok,
    });
  } catch (error) {
    logger.error({ error, message: REACTION_ROUTE_LOG.failureMessage, metadata: logMetadata });

    return createJsonResponse(
      { message: TRIBE_EVENT_ROUTE_RESPONSE.unexpectedReactionMessage },
      TRIBE_EVENT_ROUTE_HTTP_STATUS.serverError
    );
  }
}

/**
 * "¿Cómo estuvo?": body `{ occurrenceStartsAt, reaction }`. Repeating the
 * same reaction is a no-op; it never notifies.
 */
export async function PUT(request: Request, context: TribeEventRouteContext) {
  const scope = await openTribeEventPostEventRouteScope(request, REACTION_ROUTE_LOG.operation);

  if (!scope.isAuthenticated) {
    return scope.response;
  }

  const input = await parseTribeEventRouteInput({
    logger: scope.logger,
    params: context.params,
    request,
    schemas: {
      body: tribeEventReactionBodySchema,
      params: tribeEventRouteParamsSchema,
      query: tribeEventEmptyQuerySchema,
    },
  });

  if (!input.isValid) {
    return input.response;
  }

  return respondWithReaction({
    eventId: input.params.eventId,
    originalStartsAt: input.body.occurrenceStartsAt,
    reaction: input.body.reaction,
    scope,
    slug: input.params.slug,
  });
}

/**
 * Removes the viewer's reaction of `?occurrence=` (idempotent).
 */
export async function DELETE(request: Request, context: TribeEventRouteContext) {
  const scope = await openTribeEventPostEventRouteScope(request, REACTION_ROUTE_LOG.operation);

  if (!scope.isAuthenticated) {
    return scope.response;
  }

  const input = await parseTribeEventRouteInput({
    logger: scope.logger,
    params: context.params,
    request,
    schemas: { params: tribeEventRouteParamsSchema, query: tribeEventPostEventQuerySchema },
  });

  if (!input.isValid) {
    return input.response;
  }

  return respondWithReaction({
    eventId: input.params.eventId,
    originalStartsAt: input.query.occurrence,
    reaction: null,
    scope,
    slug: input.params.slug,
  });
}
