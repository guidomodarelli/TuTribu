import { MESSAGE_MUTATION_STATUS } from "@/src/modules/messages/constants/message-round";
import { revalidateTribeRoundCache } from "@/src/modules/messages/infrastructure/cache/tribe-round-cache-revalidation";
import { isUuidRouteParam } from "@/src/modules/messages/infrastructure/http/message-route-params";
import { createRequestModules } from "@/src/modules/setup";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const DELETE_MESSAGE_ROUTE_LOG = {
  deleteFailureMessage: "Tribe message deletion failed",
  feature: "messages",
  operation: "delete-tribe-message",
} as const;

const DELETE_MESSAGE_ROUTE_RESPONSE = {
  forbiddenMessage: "No tenes permisos para eliminar este mensaje.",
  notFoundMessage: "No pudimos encontrar el mensaje.",
  successMessage: "Mensaje eliminado.",
  unexpectedMessage: "No pudimos eliminar el mensaje. Intentalo de nuevo.",
  unauthorizedMessage: "Inicia sesion para eliminar mensajes.",
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

export async function DELETE(
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
    feature: DELETE_MESSAGE_ROUTE_LOG.feature,
    operation: DELETE_MESSAGE_ROUTE_LOG.operation,
    requestId,
  });
  const modules = await createRequestModules();
  const authenticatedMember = await modules.auth.useCases.getAuthenticatedMember();

  if (!authenticatedMember) {
    return createJsonResponse(
      { message: DELETE_MESSAGE_ROUTE_RESPONSE.unauthorizedMessage },
      HTTP_STATUS.unauthorized
    );
  }

  if (!isUuidRouteParam(messageId)) {
    return createJsonResponse(
      { message: DELETE_MESSAGE_ROUTE_RESPONSE.notFoundMessage },
      HTTP_STATUS.notFound
    );
  }

  try {
    const result = await modules.messages.useCases.deleteTribeMessage({
      messageId,
      tribeSlug: slug,
      userId: authenticatedMember.id,
    });

    switch (result.status) {
      case MESSAGE_MUTATION_STATUS.deleted:
        revalidateTribeRoundCache(slug);

        return createJsonResponse(
          { message: DELETE_MESSAGE_ROUTE_RESPONSE.successMessage },
          HTTP_STATUS.ok
        );
      case MESSAGE_MUTATION_STATUS.notFound:
        return createJsonResponse(
          { message: DELETE_MESSAGE_ROUTE_RESPONSE.notFoundMessage },
          HTTP_STATUS.notFound
        );
      case MESSAGE_MUTATION_STATUS.forbidden:
      default:
        return createJsonResponse(
          { message: DELETE_MESSAGE_ROUTE_RESPONSE.forbiddenMessage },
          HTTP_STATUS.forbidden
        );
    }
  } catch (error) {
    logger.error({
      message: DELETE_MESSAGE_ROUTE_LOG.deleteFailureMessage,
      error,
      metadata: {
        messageId,
        slug,
        viewerId: authenticatedMember.id,
      },
    });

    return createJsonResponse(
      { message: DELETE_MESSAGE_ROUTE_RESPONSE.unexpectedMessage },
      HTTP_STATUS.serverError
    );
  }
}
