import { createRequestModules } from "@/src/modules/setup";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const STORY_IMAGE_ITEM_ROUTE_LOG = {
  deleteFailureMessage: "Tribe story image upload deletion failed",
  feature: "tribes",
  operation: "manage-tribe-story-images",
} as const;

const STORY_IMAGE_ITEM_ROUTE_RESPONSE = {
  notFoundMessage: "No pudimos encontrar la imagen.",
  unauthorizedMessage: "Iniciá sesión para gestionar imágenes.",
  unexpectedMessage: "No pudimos eliminar la imagen. Intentá de nuevo.",
} as const;

const HTTP_STATUS = {
  notFound: 404,
  ok: 200,
  serverError: 500,
  unauthorized: 401,
} as const;

function createJsonResponse(
  body: Record<string, unknown>,
  status: number
): Response {
  return Response.json(body, { status });
}

export async function DELETE(
  request: Request,
  context: {
    params: Promise<{
      imageId: string;
      slug: string;
    }>;
  }
) {
  const { imageId, slug } = await context.params;
  const { requestId } = resolveRequestContext(request.headers);
  const logger = createServerLogger({
    feature: STORY_IMAGE_ITEM_ROUTE_LOG.feature,
    operation: STORY_IMAGE_ITEM_ROUTE_LOG.operation,
    requestId,
  });
  const modules = await createRequestModules();
  const authenticatedMember =
    await modules.auth.useCases.getAuthenticatedMember();

  if (!authenticatedMember) {
    return createJsonResponse(
      { message: STORY_IMAGE_ITEM_ROUTE_RESPONSE.unauthorizedMessage },
      HTTP_STATUS.unauthorized
    );
  }

  try {
    const deleted = await modules.tribes.useCases.deleteTribeStoryImageUpload({
      imageId,
      tribeSlug: slug,
    });

    if (!deleted) {
      return createJsonResponse(
        { message: STORY_IMAGE_ITEM_ROUTE_RESPONSE.notFoundMessage },
        HTTP_STATUS.notFound
      );
    }

    return createJsonResponse({ deleted }, HTTP_STATUS.ok);
  } catch (error) {
    logger.error({
      error,
      message: STORY_IMAGE_ITEM_ROUTE_LOG.deleteFailureMessage,
      metadata: {
        imageId,
        slug,
        viewerId: authenticatedMember.id,
      },
    });

    return createJsonResponse(
      { message: STORY_IMAGE_ITEM_ROUTE_RESPONSE.unexpectedMessage },
      HTTP_STATUS.serverError
    );
  }
}
