import { createAttachmentUploadRoute } from "../../../../attachment-file-routes";

const LESSON_FILE_UPLOAD_ROUTE_LOG = {
  failureMessage: "Lesson file upload creation failed",
  feature: "courses",
  operation: "create-lesson-file-upload",
} as const;

const LESSON_FILE_UPLOAD_ROUTE_RESPONSE = {
  forbiddenMessage: "No tenés permisos para adjuntar material en los cursos.",
  invalidFileMessage:
    "No pudimos preparar el archivo. Revisá el tipo y el tamaño.",
  notFoundMessage: "No pudimos encontrar la tribu.",
  unauthorizedMessage: "Iniciá sesión para adjuntar material.",
  unexpectedMessage: "No pudimos preparar la subida. Intentá de nuevo.",
} as const;

export const POST = createAttachmentUploadRoute({
  copy: LESSON_FILE_UPLOAD_ROUTE_RESPONSE,
  createUpload: (modules, command) => modules.courses.useCases.createLessonFileUpload(command),
  log: LESSON_FILE_UPLOAD_ROUTE_LOG,
});
