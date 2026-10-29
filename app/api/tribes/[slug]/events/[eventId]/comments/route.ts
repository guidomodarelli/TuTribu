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

const CONVERSATION_ROUTE_LOG = {
  createFailureMessage: "Tribe event occurrence comment creation failed",
  listFailureMessage: "Tribe event occurrence conversation load failed",
  operation: "tribe-event-occurrence-conversation",
} as const;

/**
 * Conversation of `?occurrence=` (original start), oldest first, and whether
 * the viewer can write in it.
 */
export async function GET(request: Request, context: TribeEventRouteContext) {
  return handleTribeEventRoute(
    request,
    context,
    {
      failure: {
        logMessage: CONVERSATION_ROUTE_LOG.listFailureMessage,
        responseMessage: TRIBE_EVENT_ROUTE_RESPONSE.unexpectedConversationMessage,
      },
      openScope: openTribeEventPostEventScope(
        CONVERSATION_ROUTE_LOG.operation,
        TRIBE_EVENT_ROUTE_RESPONSE.unexpectedConversationMessage
      ),
      readLogMetadata: readEventOccurrenceLogMetadata("originalStartsAt"),
      schemas: { params: tribeEventRouteParamsSchema, query: tribeEventPostEventQuerySchema },
    },
    async ({ modules, params, query, respond }) => {
      const result = await modules.events.useCases.listTribeEventOccurrenceComments({
        eventId: params.eventId,
        originalStartsAt: query.occurrence,
        tribeSlug: params.slug,
      });

      if (result.status !== TRIBE_EVENT_MUTATION_STATUS.found) {
        return mapTribeEventPostEventStatusResponse(
          result.status,
          TRIBE_EVENT_ROUTE_RESPONSE.commentForbiddenMessage
        );
      }

      return respond(
        { canComment: result.canComment, comments: result.comments },
        tribeEventConversationResponseSchema,
        TRIBE_EVENT_ROUTE_HTTP_STATUS.ok
      );
    }
  );
}

/**
 * Adds a comment (active members). Answers with the created comment so the
 * thread appends it without reloading. Replies do not notify in this phase.
 */
export async function POST(request: Request, context: TribeEventRouteContext) {
  return handleTribeEventRoute(
    request,
    context,
    {
      failure: {
        logMessage: CONVERSATION_ROUTE_LOG.createFailureMessage,
        responseMessage: TRIBE_EVENT_ROUTE_RESPONSE.unexpectedCommentMessage,
      },
      openScope: openTribeEventPostEventScope(
        CONVERSATION_ROUTE_LOG.operation,
        TRIBE_EVENT_ROUTE_RESPONSE.unexpectedCommentMessage
      ),
      readLogMetadata: ({ body, params }) => ({
        eventId: params.eventId,
        originalStartsAt: body.occurrenceStartsAt,
        slug: params.slug,
      }),
      schemas: {
        body: tribeEventCommentBodySchema,
        params: tribeEventRouteParamsSchema,
        query: tribeEventEmptyQuerySchema,
      },
    },
    async ({ body, modules, params, respond }) => {
      const result = await modules.events.useCases.createTribeEventOccurrenceComment({
        clientRequestId: body.clientRequestId,
        content: body.content,
        eventId: params.eventId,
        originalStartsAt: body.occurrenceStartsAt,
        tribeSlug: params.slug,
      });

      if (result.status !== TRIBE_EVENT_MUTATION_STATUS.commentCreated) {
        return mapTribeEventPostEventStatusResponse(
          result.status,
          TRIBE_EVENT_ROUTE_RESPONSE.commentForbiddenMessage
        );
      }

      return respond(
        {
          comment: result.comment,
          message: TRIBE_EVENT_ROUTE_RESPONSE.commentCreatedMessage,
        },
        tribeEventCommentResponseSchema,
        TRIBE_EVENT_ROUTE_HTTP_STATUS.created
      );
    }
  );
}
