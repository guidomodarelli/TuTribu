import { MESSAGE_MUTATION_STATUS } from "@/src/modules/messages/constants/message-round";
import { isUuidRouteParam } from "@/src/modules/messages/infrastructure/http/message-route-params";
import {
  createRouteJsonResponse,
  handleMemberRoute,
  type TribeRouteContext,
} from "@/app/api/member-route-scope";
import { HTTP_STATUS } from "@/app/api/route-http-status";

const LIST_MESSAGE_LIKERS_ROUTE_LOG = {
  feature: "messages",
  listFailureMessage: "Message likers listing failed",
  operation: "list-message-likers",
} as const;

const LIST_MESSAGE_LIKERS_ROUTE_RESPONSE = {
  forbiddenMessage: "No tenes permisos para ver las reacciones de este mensaje.",
  loadUnexpectedMessage: "No pudimos cargar las reacciones. Intentalo de nuevo.",
  notFoundMessage: "No pudimos encontrar el mensaje.",
  unauthorizedMessage: "Inicia sesion para ver las reacciones.",
} as const;

const LIST_MESSAGE_LIKERS_STATUS = {
  found: "found",
} as const;

const MEMBER_ROUTE_SCOPE = {
  feature: LIST_MESSAGE_LIKERS_ROUTE_LOG.feature,
  operation: LIST_MESSAGE_LIKERS_ROUTE_LOG.operation,
  unauthorizedMessage: LIST_MESSAGE_LIKERS_ROUTE_RESPONSE.unauthorizedMessage,
} as const;

export async function GET(
  request: Request,
  context: TribeRouteContext<{ messageId: string }>
) {
  const { messageId, slug } = await context.params;

  return handleMemberRoute(
    request,
    MEMBER_ROUTE_SCOPE,
    {
      logMessage: LIST_MESSAGE_LIKERS_ROUTE_LOG.listFailureMessage,
      metadata: { messageId, slug },
      responseMessage: LIST_MESSAGE_LIKERS_ROUTE_RESPONSE.loadUnexpectedMessage,
    },
    async ({ member, modules }) => {
      if (!isUuidRouteParam(messageId)) {
        return createRouteJsonResponse(
          { message: LIST_MESSAGE_LIKERS_ROUTE_RESPONSE.notFoundMessage },
          HTTP_STATUS.notFound
        );
      }

      const result = await modules.messages.useCases.listMessageLikers({
        messageId,
        tribeSlug: slug,
        viewerId: member.id,
      });

      switch (result.status) {
        case LIST_MESSAGE_LIKERS_STATUS.found:
          return createRouteJsonResponse(
            { likers: result.likers, totalCount: result.totalCount },
            HTTP_STATUS.ok
          );
        case MESSAGE_MUTATION_STATUS.notFound:
          return createRouteJsonResponse(
            { message: LIST_MESSAGE_LIKERS_ROUTE_RESPONSE.notFoundMessage },
            HTTP_STATUS.notFound
          );
        case MESSAGE_MUTATION_STATUS.forbidden:
        default:
          return createRouteJsonResponse(
            { message: LIST_MESSAGE_LIKERS_ROUTE_RESPONSE.forbiddenMessage },
            HTTP_STATUS.forbidden
          );
      }
    }
  );
}
