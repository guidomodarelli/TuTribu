import { TRIBE_EVENT_MUTATION_STATUS } from "@/src/modules/events/constants/tribe-events";
import { tribeEventCommentRouteParamsSchema } from "@/src/modules/events/infrastructure/api/schemas/tribe-event-post-event-request-schemas";
import { tribeEventEmptyQuerySchema } from "@/src/modules/events/infrastructure/api/schemas/tribe-event-request-schemas";
import {
  TRIBE_EVENT_ROUTE_HTTP_STATUS,
  TRIBE_EVENT_ROUTE_RESPONSE,
  createJsonResponse,
} from "@/src/modules/events/infrastructure/api/tribe-event-route-responses";
import { createStatusMessageResponse } from "@/app/api/member-route-scope";
import { handleTribeEventRoute, openTribeEventPostEventScope } from "../../tribe-event-route";

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
  return handleTribeEventRoute(
    request,
    context,
    {
      failure: {
        logMessage: COMMENT_ROUTE_LOG.deleteFailureMessage,
        responseMessage: TRIBE_EVENT_ROUTE_RESPONSE.unexpectedCommentMessage,
      },
      openScope: openTribeEventPostEventScope(
        COMMENT_ROUTE_LOG.operation,
        TRIBE_EVENT_ROUTE_RESPONSE.unexpectedCommentMessage
      ),
      readLogMetadata: ({ params }) => ({ commentId: params.commentId, slug: params.slug }),
      schemas: { params: tribeEventCommentRouteParamsSchema, query: tribeEventEmptyQuerySchema },
    },
    async ({ modules, params }) => {
      const result = await modules.events.useCases.deleteTribeEventOccurrenceComment({
        commentId: params.commentId,
        tribeSlug: params.slug,
      });

      if (result.status === TRIBE_EVENT_MUTATION_STATUS.commentDeleted) {
        return createJsonResponse(
          { message: TRIBE_EVENT_ROUTE_RESPONSE.commentDeletedMessage },
          TRIBE_EVENT_ROUTE_HTTP_STATUS.ok
        );
      }

      return createStatusMessageResponse(
        result.status,
        {
          [TRIBE_EVENT_MUTATION_STATUS.notFound]: {
            message: TRIBE_EVENT_ROUTE_RESPONSE.commentNotFoundMessage,
            status: TRIBE_EVENT_ROUTE_HTTP_STATUS.notFound,
          },
        },
        {
          message: TRIBE_EVENT_ROUTE_RESPONSE.commentForbiddenMessage,
          status: TRIBE_EVENT_ROUTE_HTTP_STATUS.forbidden,
        }
      );
    }
  );
}
