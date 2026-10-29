import { MESSAGE_MUTATION_STATUS } from "@/src/modules/messages/constants/message-round";
import {
  createRouteJsonResponse,
  handleMemberRoute,
  type TribeRouteContext,
} from "@/app/api/member-route-scope";
import { HTTP_STATUS } from "@/app/api/route-http-status";

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

const MEMBER_ROUTE_SCOPE = {
  feature: MESSAGE_IMAGE_UPLOAD_ROUTE_LOG.feature,
  operation: MESSAGE_IMAGE_UPLOAD_ROUTE_LOG.operation,
  unauthorizedMessage: MESSAGE_IMAGE_UPLOAD_ROUTE_RESPONSE.unauthorizedMessage,
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
      logMessage: MESSAGE_IMAGE_UPLOAD_ROUTE_LOG.failureMessage,
      metadata: { slug },
      responseMessage: MESSAGE_IMAGE_UPLOAD_ROUTE_RESPONSE.unexpectedMessage,
    },
    async ({ member, modules }) => {
      const result = await modules.messages.useCases.createMessageImageUpload({
        tribeSlug: slug,
        userId: member.id,
      });

      switch (result.status) {
        case MESSAGE_MUTATION_STATUS.created:
          return createRouteJsonResponse(
            {
              assetId: result.assetId,
              imageId: result.imageId,
              uploadUrl: result.uploadUrl,
            },
            HTTP_STATUS.created
          );
        case MESSAGE_MUTATION_STATUS.notFound:
          return createRouteJsonResponse(
            { message: MESSAGE_IMAGE_UPLOAD_ROUTE_RESPONSE.notFoundMessage },
            HTTP_STATUS.notFound
          );
        case MESSAGE_MUTATION_STATUS.invalidImage:
          return createRouteJsonResponse(
            { message: MESSAGE_IMAGE_UPLOAD_ROUTE_RESPONSE.invalidImageMessage },
            HTTP_STATUS.badRequest
          );
        case MESSAGE_MUTATION_STATUS.forbidden:
        default:
          return createRouteJsonResponse(
            { message: MESSAGE_IMAGE_UPLOAD_ROUTE_RESPONSE.forbiddenMessage },
            HTTP_STATUS.forbidden
          );
      }
    }
  );
}
