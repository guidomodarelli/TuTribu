import { createAttachmentUploadRoute } from "../../../attachment-file-routes";

const MESSAGE_FILE_UPLOAD_ROUTE_LOG = {
  failureMessage: "Message file upload creation failed",
  feature: "messages",
  operation: "create-message-file-upload",
} as const;

const MESSAGE_FILE_UPLOAD_ROUTE_RESPONSE = {
  forbiddenMessage: "No tenes permisos para adjuntar archivos en esta tribu.",
  invalidFileMessage:
    "No pudimos preparar el archivo. Revisá el tipo y el tamaño.",
  notFoundMessage: "No pudimos encontrar la tribu.",
  unauthorizedMessage: "Inicia sesion para adjuntar archivos.",
  unexpectedMessage: "No pudimos preparar la subida. Intentalo de nuevo.",
} as const;

export const POST = createAttachmentUploadRoute({
  copy: MESSAGE_FILE_UPLOAD_ROUTE_RESPONSE,
  createUpload: (modules, command) => modules.messages.useCases.createMessageFileUpload(command),
  log: MESSAGE_FILE_UPLOAD_ROUTE_LOG,
});
