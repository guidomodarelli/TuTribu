import { MESSAGE_MUTATION_STATUS } from "@/src/modules/messages/constants/message-round";
import { revalidateTribeRoundCache } from "@/src/modules/messages/infrastructure/cache/tribe-round-cache-revalidation";
import { isUuidRouteParam } from "@/src/modules/messages/infrastructure/http/message-route-params";
import { createAttachmentDeletionRoute } from "../../../attachment-file-routes";

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

export const DELETE = createAttachmentDeletionRoute<{ assetId: string; slug: string }>({
  copy: MESSAGE_IMAGE_DELETE_ROUTE_RESPONSE,
  deleteAttachment: (modules, { assetId, slug }, { userId }) =>
    modules.messages.useCases.deleteMessageImage({ assetId, tribeSlug: slug, userId }),
  hasValidId: ({ assetId }) => isUuidRouteParam(assetId),
  invalid: {
    message: MESSAGE_IMAGE_DELETE_ROUTE_RESPONSE.invalidImageMessage,
    status: MESSAGE_MUTATION_STATUS.invalidImage,
  },
  log: MESSAGE_IMAGE_DELETE_ROUTE_LOG,
  onDeleted: ({ slug }) => revalidateTribeRoundCache(slug),
  readMetadata: ({ assetId, slug }) => ({ assetId, slug }),
});
