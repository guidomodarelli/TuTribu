import { openTribeEventPostEventRouteScope } from "@/app/api/tribes/[slug]/events/post-event-route-scope";
import {
  tribeEventCommentResponseSchema,
  tribeEventConversationResponseSchema,
} from "@/src/modules/events/application/results/tribe-event-post-event-public-dto-schemas";
import { TRIBE_EVENT_MUTATION_STATUS } from "@/src/modules/events/constants/tribe-events";
import {
  tribeEventCommentBodySchema,
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

const CONVERSATION_ROUTE_LOG = {
  createFailureMessage: "Tribe event occurrence comment creation failed",
  listFailureMessage: "Tribe event occurrence conversation load failed",
  operation: "tribe-event-occurrence-conversation",
} as const;

type TribeEventRouteContext = {
  params: Promise<{
    eventId: string;
    slug: string;
  }>;
};

/**
 * Conversation of `?occurrence=` (original start), oldest first, and whether
 * the viewer can write in it.
 */
export async function GET(request: Request, context: TribeEventRouteContext) {
  const scope = await openTribeEventPostEventRouteScope(
    request,
    CONVERSATION_ROUTE_LOG.operation
  );

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
    const result = await modules.events.useCases.listTribeEventOccurrenceComments({
      eventId,
      originalStartsAt: input.query.occurrence,
      tribeSlug: slug,
    });

    if (result.status !== TRIBE_EVENT_MUTATION_STATUS.found) {
      return mapTribeEventPostEventStatusResponse(
        result.status,
        TRIBE_EVENT_ROUTE_RESPONSE.commentForbiddenMessage
      );
    }

    return createTribeEventPublicResponse({
      body: { canComment: result.canComment, comments: result.comments },
      failureMessage: TRIBE_EVENT_ROUTE_RESPONSE.unexpectedConversationMessage,
      logger,
      metadata: logMetadata,
      schema: tribeEventConversationResponseSchema,
      status: TRIBE_EVENT_ROUTE_HTTP_STATUS.ok,
    });
  } catch (error) {
    logger.error({
      error,
      message: CONVERSATION_ROUTE_LOG.listFailureMessage,
      metadata: logMetadata,
    });

    return createJsonResponse(
      { message: TRIBE_EVENT_ROUTE_RESPONSE.unexpectedConversationMessage },
      TRIBE_EVENT_ROUTE_HTTP_STATUS.serverError
    );
  }
}

/**
 * Adds a comment (active members). Answers with the created comment so the
 * thread appends it without reloading. Replies do not notify in this phase.
 */
export async function POST(request: Request, context: TribeEventRouteContext) {
  const scope = await openTribeEventPostEventRouteScope(
    request,
    CONVERSATION_ROUTE_LOG.operation
  );

  if (!scope.isAuthenticated) {
    return scope.response;
  }

  const { logger, member, modules } = scope;
  const input = await parseTribeEventRouteInput({
    logger,
    params: context.params,
    request,
    schemas: {
      body: tribeEventCommentBodySchema,
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
    originalStartsAt: input.body.occurrenceStartsAt,
    slug,
    viewerId: member.id,
  };

  try {
    const result = await modules.events.useCases.createTribeEventOccurrenceComment({
      clientRequestId: input.body.clientRequestId,
      content: input.body.content,
      eventId,
      originalStartsAt: input.body.occurrenceStartsAt,
      tribeSlug: slug,
    });

    if (result.status !== TRIBE_EVENT_MUTATION_STATUS.commentCreated) {
      return mapTribeEventPostEventStatusResponse(
        result.status,
        TRIBE_EVENT_ROUTE_RESPONSE.commentForbiddenMessage
      );
    }

    return createTribeEventPublicResponse({
      body: {
        comment: result.comment,
        message: TRIBE_EVENT_ROUTE_RESPONSE.commentCreatedMessage,
      },
      failureMessage: TRIBE_EVENT_ROUTE_RESPONSE.unexpectedCommentMessage,
      logger,
      metadata: logMetadata,
      schema: tribeEventCommentResponseSchema,
      status: TRIBE_EVENT_ROUTE_HTTP_STATUS.created,
    });
  } catch (error) {
    logger.error({
      error,
      message: CONVERSATION_ROUTE_LOG.createFailureMessage,
      metadata: logMetadata,
    });

    return createJsonResponse(
      { message: TRIBE_EVENT_ROUTE_RESPONSE.unexpectedCommentMessage },
      TRIBE_EVENT_ROUTE_HTTP_STATUS.serverError
    );
  }
}
