import { MESSAGE_MUTATION_STATUS } from "@/src/modules/messages/constants/message-round";
import { revalidateTribeRoundCache } from "@/src/modules/messages/infrastructure/cache/tribe-round-cache-revalidation";
import { isUuidRouteParam } from "@/src/modules/messages/infrastructure/http/message-route-params";
import { createRequestModules } from "@/src/modules/setup";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const UPDATE_MESSAGE_CREATED_AT_ROUTE_LOG = {
  feature: "messages",
  operation: "update-tribe-message-created-at",
  updateFailureMessage: "Tribe message created_at update failed",
} as const;

const UPDATE_MESSAGE_CREATED_AT_ROUTE_RESPONSE = {
  forbiddenMessage: "Solo el líder puede modificar la fecha del mensaje.",
  invalidContentMessage: "La fecha ingresada no es válida.",
  invalidPayloadMessage: "La fecha ingresada no es válida.",
  notFoundMessage: "No pudimos encontrar el mensaje.",
  successMessage: "Fecha del mensaje actualizada.",
  unauthorizedMessage: "Inicia sesion para modificar mensajes.",
  unexpectedMessage:
    "No pudimos actualizar la fecha del mensaje. Intentalo de nuevo.",
} as const;

const HTTP_STATUS = {
  badRequest: 400,
  forbidden: 403,
  notFound: 404,
  ok: 200,
  serverError: 500,
  unauthorized: 401,
} as const;

type UpdateCreatedAtRequestBody = {
  createdAt?: unknown;
};

function createJsonResponse(body: Record<string, unknown>, status: number): Response {
  return Response.json(body, { status });
}

function extractCreatedAt(body: UpdateCreatedAtRequestBody | null): string | null {
  if (!body || typeof body.createdAt !== "string") {
    return null;
  }

  const trimmed = body.createdAt.trim();

  return trimmed.length > 0 ? trimmed : null;
}

export async function PATCH(
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
    feature: UPDATE_MESSAGE_CREATED_AT_ROUTE_LOG.feature,
    operation: UPDATE_MESSAGE_CREATED_AT_ROUTE_LOG.operation,
    requestId,
  });
  const modules = await createRequestModules();
  const authenticatedMember = await modules.auth.useCases.getAuthenticatedMember();

  if (!authenticatedMember) {
    return createJsonResponse(
      { message: UPDATE_MESSAGE_CREATED_AT_ROUTE_RESPONSE.unauthorizedMessage },
      HTTP_STATUS.unauthorized
    );
  }

  if (!isUuidRouteParam(messageId)) {
    return createJsonResponse(
      { message: UPDATE_MESSAGE_CREATED_AT_ROUTE_RESPONSE.notFoundMessage },
      HTTP_STATUS.notFound
    );
  }

  const body = (await request.json().catch(() => null)) as UpdateCreatedAtRequestBody | null;
  const createdAt = extractCreatedAt(body);

  if (!createdAt) {
    return createJsonResponse(
      { message: UPDATE_MESSAGE_CREATED_AT_ROUTE_RESPONSE.invalidPayloadMessage },
      HTTP_STATUS.badRequest
    );
  }

  try {
    const result = await modules.messages.useCases.updateTribeMessageCreatedAt({
      createdAt,
      messageId,
      tribeSlug: slug,
      userId: authenticatedMember.id,
    });

    switch (result.status) {
      case MESSAGE_MUTATION_STATUS.updated:
        revalidateTribeRoundCache(slug);

        return createJsonResponse(
          {
            createdAt: result.createdAt,
            message: UPDATE_MESSAGE_CREATED_AT_ROUTE_RESPONSE.successMessage,
          },
          HTTP_STATUS.ok
        );
      case MESSAGE_MUTATION_STATUS.invalidContent:
        return createJsonResponse(
          { message: UPDATE_MESSAGE_CREATED_AT_ROUTE_RESPONSE.invalidContentMessage },
          HTTP_STATUS.badRequest
        );
      case MESSAGE_MUTATION_STATUS.notFound:
        return createJsonResponse(
          { message: UPDATE_MESSAGE_CREATED_AT_ROUTE_RESPONSE.notFoundMessage },
          HTTP_STATUS.notFound
        );
      case MESSAGE_MUTATION_STATUS.forbidden:
      default:
        return createJsonResponse(
          { message: UPDATE_MESSAGE_CREATED_AT_ROUTE_RESPONSE.forbiddenMessage },
          HTTP_STATUS.forbidden
        );
    }
  } catch (error) {
    logger.error({
      message: UPDATE_MESSAGE_CREATED_AT_ROUTE_LOG.updateFailureMessage,
      error,
      metadata: {
        messageId,
        slug,
        viewerId: authenticatedMember.id,
      },
    });

    return createJsonResponse(
      { message: UPDATE_MESSAGE_CREATED_AT_ROUTE_RESPONSE.unexpectedMessage },
      HTTP_STATUS.serverError
    );
  }
}
