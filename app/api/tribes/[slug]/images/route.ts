import { TRIBE_IMAGE_UPLOAD_STATUS } from "@/src/modules/tribes/constants/tribe-images";
import {
  createRouteJsonResponse,
  handleMemberRoute,
  type TribeRouteContext,
} from "@/app/api/member-route-scope";
import { HTTP_STATUS } from "@/app/api/route-http-status";

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

const MEMBER_ROUTE_SCOPE = {
  feature: TRIBE_IMAGES_ROUTE_LOG.feature,
  operation: TRIBE_IMAGES_ROUTE_LOG.operation,
  unauthorizedMessage: TRIBE_IMAGES_ROUTE_RESPONSE.unauthorizedMessage,
} as const;

export async function POST(
  request: Request,
  context: TribeRouteContext
) {
  const { slug } = await context.params;

  return handleMemberRoute(
    request,
    MEMBER_ROUTE_SCOPE,
    {
      logMessage: TRIBE_IMAGES_ROUTE_LOG.createFailureMessage,
      metadata: { slug },
      responseMessage: TRIBE_IMAGES_ROUTE_RESPONSE.unexpectedMessage,
    },
    async ({ modules }) => {
      const result = await modules.tribes.useCases.createTribeImageUpload({
        tribeSlug: slug,
      });

      switch (result.status) {
        case TRIBE_IMAGE_UPLOAD_STATUS.created:
          return createRouteJsonResponse(
            {
              deliveryUrl: result.deliveryUrl,
              imageId: result.imageId,
              uploadUrl: result.uploadUrl,
            },
            HTTP_STATUS.created
          );
        case TRIBE_IMAGE_UPLOAD_STATUS.forbidden:
          return createRouteJsonResponse(
            { message: TRIBE_IMAGES_ROUTE_RESPONSE.forbiddenMessage },
            HTTP_STATUS.forbidden
          );
        case TRIBE_IMAGE_UPLOAD_STATUS.invalidImage:
        default:
          return createRouteJsonResponse(
            { message: TRIBE_IMAGES_ROUTE_RESPONSE.invalidImageMessage },
            HTTP_STATUS.badRequest
          );
      }
    }
  );
}
