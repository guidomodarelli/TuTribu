import { MESSAGE_MUTATION_STATUS } from "@/src/modules/messages/constants/message-round";
import { createRequestModules } from "@/src/modules/setup";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const MESSAGE_IMAGE_UPLOAD_ROUTE_LOG = {
  failureMessage: "Message image upload creation failed",
  feature: "messages",
  operation: "create-message-image-upload",
} as const;

const MESSAGE_IMAGE_UPLOAD_ROUTE_RESPONSE = {
  forbiddenMessage: "No tenes permisos para subir imagenes en esta tribu.",
  invalidImageMessage: "No pudimos preparar la subida de la imagen.",
  notFoundMessage: "No pudimos encontrar la tribu.",
  unauthorizedMessage: "Inicia sesion para subir imagenes.",
  unexpectedMessage: "No pudimos preparar la subida. Intentalo de nuevo.",
} as const;

const HTTP_STATUS = {
  badRequest: 400,
  created: 201,
  forbidden: 403,
  notFound: 404,
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
      slug: string;
    }>;
  }
) {
  const { slug } = await context.params;
  const { requestId } = resolveRequestContext(request.headers);
  const logger = createServerLogger({
    feature: MESSAGE_IMAGE_UPLOAD_ROUTE_LOG.feature,
    operation: MESSAGE_IMAGE_UPLOAD_ROUTE_LOG.operation,
    requestId,
  });
  const modules = await createRequestModules();
  const authenticatedMember = await modules.auth.useCases.getAuthenticatedMember();

  if (!authenticatedMember) {
    return createJsonResponse(
      { message: MESSAGE_IMAGE_UPLOAD_ROUTE_RESPONSE.unauthorizedMessage },
      HTTP_STATUS.unauthorized
    );
  }

  try {
    const result = await modules.messages.useCases.createMessageImageUpload({
      tribeSlug: slug,
      userId: authenticatedMember.id,
    });

    switch (result.status) {
      case MESSAGE_MUTATION_STATUS.created:
        return createJsonResponse(
          {
            assetId: result.assetId,
            imageId: result.imageId,
            uploadUrl: result.uploadUrl,
          },
          HTTP_STATUS.created
        );
      case MESSAGE_MUTATION_STATUS.notFound:
        return createJsonResponse(
          { message: MESSAGE_IMAGE_UPLOAD_ROUTE_RESPONSE.notFoundMessage },
          HTTP_STATUS.notFound
        );
      case MESSAGE_MUTATION_STATUS.invalidImage:
        return createJsonResponse(
          { message: MESSAGE_IMAGE_UPLOAD_ROUTE_RESPONSE.invalidImageMessage },
          HTTP_STATUS.badRequest
        );
      case MESSAGE_MUTATION_STATUS.forbidden:
      default:
        return createJsonResponse(
          { message: MESSAGE_IMAGE_UPLOAD_ROUTE_RESPONSE.forbiddenMessage },
          HTTP_STATUS.forbidden
        );
    }
  } catch (error) {
    logger.error({
      message: MESSAGE_IMAGE_UPLOAD_ROUTE_LOG.failureMessage,
      error,
      metadata: {
        slug,
        viewerId: authenticatedMember.id,
      },
    });

    return createJsonResponse(
      { message: MESSAGE_IMAGE_UPLOAD_ROUTE_RESPONSE.unexpectedMessage },
      HTTP_STATUS.serverError
    );
  }
}
