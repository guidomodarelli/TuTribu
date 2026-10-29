import {
  createRouteJsonResponse,
  handleMemberRoute,
  type TribeRouteContext,
} from "@/app/api/member-route-scope";
import { HTTP_STATUS } from "@/app/api/route-http-status";

const TRIBE_IMAGE_ITEM_ROUTE_LOG = {
  deleteFailureMessage: "Tribe image upload deletion failed",
  feature: "tribes",
  operation: "manage-tribe-images",
} as const;

const TRIBE_IMAGE_ITEM_ROUTE_RESPONSE = {
  notFoundMessage: "No pudimos encontrar la imagen.",
  unauthorizedMessage: "Iniciá sesión para gestionar imágenes.",
  unexpectedMessage: "No pudimos eliminar la imagen. Intentá de nuevo.",
} as const;

const MEMBER_ROUTE_SCOPE = {
  feature: TRIBE_IMAGE_ITEM_ROUTE_LOG.feature,
  operation: TRIBE_IMAGE_ITEM_ROUTE_LOG.operation,
  unauthorizedMessage: TRIBE_IMAGE_ITEM_ROUTE_RESPONSE.unauthorizedMessage,
} as const;

export async function DELETE(
  request: Request,
  context: TribeRouteContext<{ imageId: string }>
) {
  const { imageId, slug } = await context.params;

  return handleMemberRoute(
    request,
    MEMBER_ROUTE_SCOPE,
    {
      logMessage: TRIBE_IMAGE_ITEM_ROUTE_LOG.deleteFailureMessage,
      metadata: { imageId, slug },
      responseMessage: TRIBE_IMAGE_ITEM_ROUTE_RESPONSE.unexpectedMessage,
    },
    async ({ modules }) => {
      const deleted = await modules.tribes.useCases.deleteTribeImageUpload({
        imageId,
        tribeSlug: slug,
      });

      if (!deleted) {
        return createRouteJsonResponse(
          { message: TRIBE_IMAGE_ITEM_ROUTE_RESPONSE.notFoundMessage },
          HTTP_STATUS.notFound
        );
      }

      return createRouteJsonResponse({ deleted }, HTTP_STATUS.ok);
    }
  );
}
