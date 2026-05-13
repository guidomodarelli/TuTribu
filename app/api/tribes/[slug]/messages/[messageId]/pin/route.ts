import { MESSAGE_MUTATION_STATUS } from "@/src/modules/messages/constants/message-round";
import { revalidateTribeRoundCache } from "@/src/modules/messages/infrastructure/cache/tribe-round-cache-revalidation";
import { isUuidRouteParam } from "@/src/modules/messages/infrastructure/http/message-route-params";
import { createRequestModules } from "@/src/modules/setup";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const TOGGLE_MESSAGE_PIN_ROUTE_LOG = {
  feature: "messages",
  operation: "toggle-message-pin",
  toggleFailureMessage: "Message pin toggle failed",
} as const;

const TOGGLE_MESSAGE_PIN_ROUTE_RESPONSE = {
  forbiddenMessage: "No tenes permisos para pinear este mensaje.",
  limitReachedMessage: "Solo podes pinear hasta 3 mensajes en el fogón.",
  notFoundMessage: "No pudimos encontrar el mensaje.",
  pinnedMessage: "Mensaje pineado.",
  unexpectedMessage: "No pudimos actualizar el pin. Intentalo de nuevo.",
  unauthorizedMessage: "Inicia sesion para pinear mensajes.",
  unpinnedMessage: "Mensaje despineado.",
} as const;

const HTTP_STATUS = {
  conflict: 409,
  forbidden: 403,
  notFound: 404,
  ok: 200,
  serverError: 500,
  unauthorized: 401,
} as const;

function createJsonResponse(body: Record<string, unknown>, status: number): Response {
  return Response.json(body, { status });
}

export async function POST(
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
    feature: TOGGLE_MESSAGE_PIN_ROUTE_LOG.feature,
    operation: TOGGLE_MESSAGE_PIN_ROUTE_LOG.operation,
    requestId,
  });
  const modules = await createRequestModules();
  const authenticatedMember = await modules.auth.useCases.getAuthenticatedMember();

  if (!authenticatedMember) {
    return createJsonResponse(
      { message: TOGGLE_MESSAGE_PIN_ROUTE_RESPONSE.unauthorizedMessage },
      HTTP_STATUS.unauthorized
    );
  }

  if (!isUuidRouteParam(messageId)) {
    return createJsonResponse(
      { message: TOGGLE_MESSAGE_PIN_ROUTE_RESPONSE.notFoundMessage },
      HTTP_STATUS.notFound
    );
  }

  try {
    const result = await modules.messages.useCases.toggleMessagePin({
      messageId,
      tribeSlug: slug,
      userId: authenticatedMember.id,
    });

    switch (result.status) {
      case MESSAGE_MUTATION_STATUS.pinned:
        revalidateTribeRoundCache(slug);

        return createJsonResponse(
          {
            isPinned: true,
            message: TOGGLE_MESSAGE_PIN_ROUTE_RESPONSE.pinnedMessage,
            pinnedAt: result.pinnedAt,
          },
          HTTP_STATUS.ok
        );
      case MESSAGE_MUTATION_STATUS.unpinned:
        revalidateTribeRoundCache(slug);

        return createJsonResponse(
          {
            isPinned: false,
            message: TOGGLE_MESSAGE_PIN_ROUTE_RESPONSE.unpinnedMessage,
            pinnedAt: null,
          },
          HTTP_STATUS.ok
        );
      case MESSAGE_MUTATION_STATUS.pinLimitReached:
        return createJsonResponse(
          { message: TOGGLE_MESSAGE_PIN_ROUTE_RESPONSE.limitReachedMessage },
          HTTP_STATUS.conflict
        );
      case MESSAGE_MUTATION_STATUS.notFound:
        return createJsonResponse(
          { message: TOGGLE_MESSAGE_PIN_ROUTE_RESPONSE.notFoundMessage },
          HTTP_STATUS.notFound
        );
      case MESSAGE_MUTATION_STATUS.forbidden:
      default:
        return createJsonResponse(
          { message: TOGGLE_MESSAGE_PIN_ROUTE_RESPONSE.forbiddenMessage },
          HTTP_STATUS.forbidden
        );
    }
  } catch (error) {
    logger.error({
      message: TOGGLE_MESSAGE_PIN_ROUTE_LOG.toggleFailureMessage,
      error,
      metadata: {
        messageId,
        slug,
        viewerId: authenticatedMember.id,
      },
    });

    return createJsonResponse(
      { message: TOGGLE_MESSAGE_PIN_ROUTE_RESPONSE.unexpectedMessage },
      HTTP_STATUS.serverError
    );
  }
}
