import { MESSAGE_MUTATION_STATUS } from "@/src/modules/messages/constants/message-round";
import { revalidateTribeRoundCache } from "@/src/modules/messages/infrastructure/cache/tribe-round-cache-revalidation";
import { isUuidRouteParam } from "@/src/modules/messages/infrastructure/http/message-route-params";
import { createAttachmentDeletionRoute } from "../../../attachment-file-routes";

const MESSAGE_FILE_DELETE_ROUTE_LOG = {
  failureMessage: "Message file deletion failed",
  feature: "messages",
  operation: "delete-message-file",
} as const;

const MESSAGE_FILE_DELETE_ROUTE_RESPONSE = {
  forbiddenMessage: "No tenes permisos para quitar este archivo.",
  invalidFileMessage: "No pudimos quitar el archivo. Intentalo de nuevo.",
  notFoundMessage: "No pudimos encontrar el archivo.",
  successMessage: "Archivo eliminado.",
  unauthorizedMessage: "Inicia sesion para quitar archivos.",
  unexpectedMessage: "No pudimos quitar el archivo. Intentalo de nuevo.",
} as const;

export const DELETE = createAttachmentDeletionRoute<{ assetId: string; slug: string }>({
  copy: MESSAGE_FILE_DELETE_ROUTE_RESPONSE,
  deleteAttachment: (modules, { assetId, slug }, { userId }) =>
    modules.messages.useCases.deleteMessageFile({ assetId, tribeSlug: slug, userId }),
  hasValidId: ({ assetId }) => isUuidRouteParam(assetId),
  invalid: {
    message: MESSAGE_FILE_DELETE_ROUTE_RESPONSE.invalidFileMessage,
    status: MESSAGE_MUTATION_STATUS.invalidFile,
  },
  log: MESSAGE_FILE_DELETE_ROUTE_LOG,
  onDeleted: ({ slug }) => revalidateTribeRoundCache(slug),
  readMetadata: ({ assetId, slug }) => ({ assetId, slug }),
});
