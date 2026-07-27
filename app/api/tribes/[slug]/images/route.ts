import { createRequestModules } from "@/src/modules/setup";
import { TRIBE_IMAGE_UPLOAD_STATUS } from "@/src/modules/tribes/constants/tribe-images";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const TRIBE_IMAGES_ROUTE_LOG = {
  createFailureMessage: "Tribe image upload creation failed",
  feature: "tribes",
  operation: "manage-tribe-images",
} as const;

const TRIBE_IMAGES_ROUTE_RESPONSE = {
  forbiddenMessage: "Solo el líder puede subir imágenes de la tribu.",
  invalidImageMessage: "No pudimos preparar la subida de la imagen.",
  unauthorizedMessage: "Iniciá sesión para subir imágenes.",
  unexpectedMessage: "No pudimos subir la imagen. Intentá de nuevo.",
} as const;

const HTTP_STATUS = {
  badRequest: 400,
  created: 201,
  forbidden: 403,
  serverError: 500,
  unauthorized: 401,
} as const;

function createJsonResponse(
  body: Record<string, unknown>,
  status: number
): Response {
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
    feature: TRIBE_IMAGES_ROUTE_LOG.feature,
    operation: TRIBE_IMAGES_ROUTE_LOG.operation,
    requestId,
  });
  const modules = await createRequestModules();
  const authenticatedMember =
    await modules.auth.useCases.getAuthenticatedMember();

  if (!authenticatedMember) {
    return createJsonResponse(
      { message: TRIBE_IMAGES_ROUTE_RESPONSE.unauthorizedMessage },
      HTTP_STATUS.unauthorized
    );
  }

  try {
    const result = await modules.tribes.useCases.createTribeImageUpload({
      tribeSlug: slug,
    });

    switch (result.status) {
      case TRIBE_IMAGE_UPLOAD_STATUS.created:
        return createJsonResponse(
          {
            deliveryUrl: result.deliveryUrl,
            imageId: result.imageId,
            uploadUrl: result.uploadUrl,
          },
          HTTP_STATUS.created
        );
      case TRIBE_IMAGE_UPLOAD_STATUS.forbidden:
        return createJsonResponse(
          { message: TRIBE_IMAGES_ROUTE_RESPONSE.forbiddenMessage },
          HTTP_STATUS.forbidden
        );
      case TRIBE_IMAGE_UPLOAD_STATUS.invalidImage:
      default:
        return createJsonResponse(
          { message: TRIBE_IMAGES_ROUTE_RESPONSE.invalidImageMessage },
          HTTP_STATUS.badRequest
        );
    }
  } catch (error) {
    logger.error({
      error,
      message: TRIBE_IMAGES_ROUTE_LOG.createFailureMessage,
      metadata: {
        slug,
        viewerId: authenticatedMember.id,
      },
    });

    return createJsonResponse(
      { message: TRIBE_IMAGES_ROUTE_RESPONSE.unexpectedMessage },
      HTTP_STATUS.serverError
    );
  }
}
