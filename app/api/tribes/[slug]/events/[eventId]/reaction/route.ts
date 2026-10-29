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
import {
  TRIBE_EVENT_ROUTE_HTTP_STATUS,
  TRIBE_EVENT_ROUTE_RESPONSE,
  mapTribeEventPostEventStatusResponse,
} from "@/src/modules/events/infrastructure/api/tribe-event-route-responses";
import {
  handleTribeEventRoute,
  openTribeEventPostEventScope,
  type TribeEventRouteBody,
  type TribeEventRouteContext,
} from "../../tribe-event-route";

const REACTION_ROUTE_LOG = {
  failureMessage: "Tribe event occurrence reaction failed",
  operation: "tribe-event-occurrence-reaction",
} as const;

const REACTION_ROUTE_FAILURE = {
  logMessage: REACTION_ROUTE_LOG.failureMessage,
  responseMessage: TRIBE_EVENT_ROUTE_RESPONSE.unexpectedReactionMessage,
} as const;

const openReactionRouteScope = openTribeEventPostEventScope(
  REACTION_ROUTE_LOG.operation,
  TRIBE_EVENT_ROUTE_RESPONSE.unexpectedReactionMessage
);

type ReactionTarget = {
  eventId: string;
  originalStartsAt: string;
  reaction: TribeEventOccurrenceReaction | null;
  slug: string;
};

function readReactionLogMetadata(target: ReactionTarget): Record<string, unknown> {
  return {
    eventId: target.eventId,
    originalStartsAt: target.originalStartsAt,
    reaction: target.reaction,
    slug: target.slug,
  };
}

/**
 * Saves (or clears, with `reaction: null`) the viewer's reaction and answers
 * with the fresh counts, which the optimistic UI adopts.
 */
async function respondWithReaction(
  route: Pick<TribeEventRouteBody<unknown, unknown, unknown>, "modules" | "respond">,
  target: ReactionTarget
): Promise<Response> {
  const result = await route.modules.events.useCases.setTribeEventOccurrenceReaction({
    eventId: target.eventId,
    originalStartsAt: target.originalStartsAt,
    reaction: target.reaction,
    tribeSlug: target.slug,
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

  return route.respond(
    { reactions: result.reactions },
    tribeEventReactionResponseSchema,
    TRIBE_EVENT_ROUTE_HTTP_STATUS.ok
  );
}

/**
 * "¿Cómo estuvo?": body `{ occurrenceStartsAt, reaction }`. Repeating the
 * same reaction is a no-op; it never notifies.
 */
export async function PUT(request: Request, context: TribeEventRouteContext) {
  return handleTribeEventRoute(
    request,
    context,
    {
      failure: REACTION_ROUTE_FAILURE,
      openScope: openReactionRouteScope,
      readLogMetadata: ({ body, params }) =>
        readReactionLogMetadata({
          eventId: params.eventId,
          originalStartsAt: body.occurrenceStartsAt,
          reaction: body.reaction,
          slug: params.slug,
        }),
      schemas: {
        body: tribeEventReactionBodySchema,
        params: tribeEventRouteParamsSchema,
        query: tribeEventEmptyQuerySchema,
      },
    },
    (route) =>
      respondWithReaction(route, {
        eventId: route.params.eventId,
        originalStartsAt: route.body.occurrenceStartsAt,
        reaction: route.body.reaction,
        slug: route.params.slug,
      })
  );
}

/**
 * Removes the viewer's reaction of `?occurrence=` (idempotent).
 */
export async function DELETE(request: Request, context: TribeEventRouteContext) {
  return handleTribeEventRoute(
    request,
    context,
    {
      failure: REACTION_ROUTE_FAILURE,
      openScope: openReactionRouteScope,
      readLogMetadata: ({ params, query }) =>
        readReactionLogMetadata({
          eventId: params.eventId,
          originalStartsAt: query.occurrence,
          reaction: null,
          slug: params.slug,
        }),
      schemas: { params: tribeEventRouteParamsSchema, query: tribeEventPostEventQuerySchema },
    },
    (route) =>
      respondWithReaction(route, {
        eventId: route.params.eventId,
        originalStartsAt: route.query.occurrence,
        reaction: null,
        slug: route.params.slug,
      })
  );
}
