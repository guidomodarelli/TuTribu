import { MESSAGE_MUTATION_STATUS } from "@/src/modules/messages/constants/message-round";
import { isUuidRouteParam } from "@/src/modules/messages/infrastructure/http/message-route-params";
import { createRequestModules } from "@/src/modules/setup";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

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

const HTTP_STATUS = {
  forbidden: 403,
  notFound: 404,
  ok: 200,
  serverError: 500,
  unauthorized: 401,
} as const;

function createJsonResponse(body: Record<string, unknown>, status: number): Response {
  return Response.json(body, { status });
}

export async function GET(
  request: Request,
  context: {
    params: Promise<{
      messageId: string;
      slug: string;
    }>;
  }
) {
  const { messageId, slug } = await context.params;
  const { requestId } = resolveRequestContext(request.headers);
  const logger = createServerLogger({
    feature: LIST_MESSAGE_LIKERS_ROUTE_LOG.feature,
    operation: LIST_MESSAGE_LIKERS_ROUTE_LOG.operation,
    requestId,
  });
  const modules = await createRequestModules();
  const authenticatedMember = await modules.auth.useCases.getAuthenticatedMember();

  if (!authenticatedMember) {
    return createJsonResponse(
      { message: LIST_MESSAGE_LIKERS_ROUTE_RESPONSE.unauthorizedMessage },
      HTTP_STATUS.unauthorized
    );
  }

  if (!isUuidRouteParam(messageId)) {
    return createJsonResponse(
      { message: LIST_MESSAGE_LIKERS_ROUTE_RESPONSE.notFoundMessage },
      HTTP_STATUS.notFound
    );
  }

  try {
    const result = await modules.messages.useCases.listMessageLikers({
      messageId,
      tribeSlug: slug,
      viewerId: authenticatedMember.id,
    });

    switch (result.status) {
      case LIST_MESSAGE_LIKERS_STATUS.found:
        return createJsonResponse(
          { likers: result.likers, totalCount: result.totalCount },
          HTTP_STATUS.ok
        );
      case MESSAGE_MUTATION_STATUS.notFound:
        return createJsonResponse(
          { message: LIST_MESSAGE_LIKERS_ROUTE_RESPONSE.notFoundMessage },
          HTTP_STATUS.notFound
        );
      case MESSAGE_MUTATION_STATUS.forbidden:
      default:
        return createJsonResponse(
          { message: LIST_MESSAGE_LIKERS_ROUTE_RESPONSE.forbiddenMessage },
          HTTP_STATUS.forbidden
        );
    }
  } catch (error) {
    logger.error({
      message: LIST_MESSAGE_LIKERS_ROUTE_LOG.listFailureMessage,
      error,
      metadata: {
        messageId,
        slug,
        viewerId: authenticatedMember.id,
      },
    });

    return createJsonResponse(
      { message: LIST_MESSAGE_LIKERS_ROUTE_RESPONSE.loadUnexpectedMessage },
      HTTP_STATUS.serverError
    );
  }
}
