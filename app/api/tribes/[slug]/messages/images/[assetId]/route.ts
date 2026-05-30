import { MESSAGE_MUTATION_STATUS } from "@/src/modules/messages/constants/message-round";
import { revalidateTribeRoundCache } from "@/src/modules/messages/infrastructure/cache/tribe-round-cache-revalidation";
import { isUuidRouteParam } from "@/src/modules/messages/infrastructure/http/message-route-params";
import { createRequestModules } from "@/src/modules/setup";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const MESSAGE_IMAGE_DELETE_ROUTE_LOG = {
  failureMessage: "Message image deletion failed",
  feature: "messages",
  operation: "delete-message-image",
} as const;

const MESSAGE_IMAGE_DELETE_ROUTE_RESPONSE = {
  forbiddenMessage: "No tenes permisos para quitar esta imagen.",
  invalidImageMessage: "No pudimos quitar la imagen. Intentalo de nuevo.",
  notFoundMessage: "No pudimos encontrar la imagen.",
  successMessage: "Imagen eliminada.",
  unauthorizedMessage: "Inicia sesion para quitar imagenes.",
  unexpectedMessage: "No pudimos quitar la imagen. Intentalo de nuevo.",
} as const;

const HTTP_STATUS = {
  badRequest: 400,
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
      assetId: string;
      slug: string;
    }>;
  }
) {
  const { assetId, slug } = await context.params;
  const { requestId } = resolveRequestContext(request.headers);
  const logger = createServerLogger({
    feature: MESSAGE_IMAGE_DELETE_ROUTE_LOG.feature,
    operation: MESSAGE_IMAGE_DELETE_ROUTE_LOG.operation,
    requestId,
  });
  const modules = await createRequestModules();
  const authenticatedMember = await modules.auth.useCases.getAuthenticatedMember();

  if (!authenticatedMember) {
    return createJsonResponse(
      { message: MESSAGE_IMAGE_DELETE_ROUTE_RESPONSE.unauthorizedMessage },
      HTTP_STATUS.unauthorized
    );
  }

  if (!isUuidRouteParam(assetId)) {
    return createJsonResponse(
      { message: MESSAGE_IMAGE_DELETE_ROUTE_RESPONSE.notFoundMessage },
      HTTP_STATUS.notFound
    );
  }

  try {
    const result = await modules.messages.useCases.deleteMessageImage({
      assetId,
      tribeSlug: slug,
      userId: authenticatedMember.id,
    });

    switch (result.status) {
      case MESSAGE_MUTATION_STATUS.deleted:
        revalidateTribeRoundCache(slug);

        return createJsonResponse(
          { message: MESSAGE_IMAGE_DELETE_ROUTE_RESPONSE.successMessage },
          HTTP_STATUS.ok
        );
      case MESSAGE_MUTATION_STATUS.notFound:
        return createJsonResponse(
          { message: MESSAGE_IMAGE_DELETE_ROUTE_RESPONSE.notFoundMessage },
          HTTP_STATUS.notFound
        );
      case MESSAGE_MUTATION_STATUS.invalidImage:
        return createJsonResponse(
          { message: MESSAGE_IMAGE_DELETE_ROUTE_RESPONSE.invalidImageMessage },
          HTTP_STATUS.badRequest
        );
      case MESSAGE_MUTATION_STATUS.forbidden:
      default:
        return createJsonResponse(
          { message: MESSAGE_IMAGE_DELETE_ROUTE_RESPONSE.forbiddenMessage },
          HTTP_STATUS.forbidden
        );
    }
  } catch (error) {
    logger.error({
      message: MESSAGE_IMAGE_DELETE_ROUTE_LOG.failureMessage,
      error,
      metadata: {
        assetId,
        slug,
        viewerId: authenticatedMember.id,
      },
    });

    return createJsonResponse(
      { message: MESSAGE_IMAGE_DELETE_ROUTE_RESPONSE.unexpectedMessage },
      HTTP_STATUS.serverError
    );
  }
}
