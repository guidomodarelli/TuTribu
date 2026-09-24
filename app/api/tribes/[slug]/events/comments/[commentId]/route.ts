import { openTribeEventPostEventRouteScope } from "@/app/api/tribes/[slug]/events/post-event-route-scope";
import { TRIBE_EVENT_MUTATION_STATUS } from "@/src/modules/events/constants/tribe-events";
import { tribeEventCommentRouteParamsSchema } from "@/src/modules/events/infrastructure/api/schemas/tribe-event-post-event-request-schemas";
import { tribeEventEmptyQuerySchema } from "@/src/modules/events/infrastructure/api/schemas/tribe-event-request-schemas";
import { parseTribeEventRouteInput } from "@/src/modules/events/infrastructure/api/tribe-event-route-input";
import {
  TRIBE_EVENT_ROUTE_HTTP_STATUS,
  TRIBE_EVENT_ROUTE_RESPONSE,
  createJsonResponse,
} from "@/src/modules/events/infrastructure/api/tribe-event-route-responses";

const COMMENT_ROUTE_LOG = {
  deleteFailureMessage: "Tribe event occurrence comment deletion failed",
  operation: "tribe-event-occurrence-conversation",
} as const;

type TribeEventCommentRouteContext = {
  params: Promise<{
    commentId: string;
    slug: string;
  }>;
};

/**
 * Deletes a comment of the occurrence conversation: its author or an event
 * manager. A comment that does not exist (already deleted, another tribe)
 * answers 404, which the client treats as already gone.
 */
export async function DELETE(request: Request, context: TribeEventCommentRouteContext) {
  const scope = await openTribeEventPostEventRouteScope(request, COMMENT_ROUTE_LOG.operation);

  if (!scope.isAuthenticated) {
    return scope.response;
  }

  const { logger, member, modules } = scope;
  const input = await parseTribeEventRouteInput({
    logger,
    params: context.params,
    request,
    schemas: { params: tribeEventCommentRouteParamsSchema, query: tribeEventEmptyQuerySchema },
  });

  if (!input.isValid) {
    return input.response;
  }

  const { commentId, slug } = input.params;
  const logMetadata = { commentId, slug, viewerId: member.id };

  try {
    const result = await modules.events.useCases.deleteTribeEventOccurrenceComment({
      commentId,
      tribeSlug: slug,
    });

    switch (result.status) {
      case TRIBE_EVENT_MUTATION_STATUS.commentDeleted:
        return createJsonResponse(
          { message: TRIBE_EVENT_ROUTE_RESPONSE.commentDeletedMessage },
          TRIBE_EVENT_ROUTE_HTTP_STATUS.ok
        );
      case TRIBE_EVENT_MUTATION_STATUS.notFound:
        return createJsonResponse(
          { message: TRIBE_EVENT_ROUTE_RESPONSE.commentNotFoundMessage },
          TRIBE_EVENT_ROUTE_HTTP_STATUS.notFound
        );
      default:
        return createJsonResponse(
          { message: TRIBE_EVENT_ROUTE_RESPONSE.commentForbiddenMessage },
          TRIBE_EVENT_ROUTE_HTTP_STATUS.forbidden
        );
    }
  } catch (error) {
    logger.error({
      error,
      message: COMMENT_ROUTE_LOG.deleteFailureMessage,
      metadata: logMetadata,
    });

    return createJsonResponse(
      { message: TRIBE_EVENT_ROUTE_RESPONSE.unexpectedCommentMessage },
      TRIBE_EVENT_ROUTE_HTTP_STATUS.serverError
    );
  }
}
