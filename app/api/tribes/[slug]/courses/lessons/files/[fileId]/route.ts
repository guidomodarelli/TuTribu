import { COURSE_MUTATION_STATUS } from "@/src/modules/courses/constants/courses";
import { createAttachmentDeletionRoute } from "../../../../attachment-file-routes";
import { readUuidValue } from "../../../route-helpers";

const LESSON_FILE_DELETE_ROUTE_LOG = {
  failureMessage: "Lesson file deletion failed",
  feature: "courses",
  operation: "delete-lesson-file",
} as const;

const LESSON_FILE_DELETE_ROUTE_RESPONSE = {
  forbiddenMessage: "No tenés permisos para quitar este archivo.",
  invalidFileMessage: "No pudimos quitar el archivo. Intentá de nuevo.",
  notFoundMessage: "No pudimos encontrar el archivo.",
  successMessage: "Archivo eliminado.",
  unauthorizedMessage: "Iniciá sesión para quitar archivos.",
  unexpectedMessage: "No pudimos quitar el archivo. Intentá de nuevo.",
} as const;

export const DELETE = createAttachmentDeletionRoute<{ fileId: string; slug: string }>({
  copy: LESSON_FILE_DELETE_ROUTE_RESPONSE,
  deleteAttachment: (modules, { fileId, slug }, { userId }) =>
    modules.courses.useCases.deleteLessonFile({ fileId, tribeSlug: slug, userId }),
  hasValidId: ({ fileId }) => readUuidValue(fileId) !== null,
  invalid: {
    message: LESSON_FILE_DELETE_ROUTE_RESPONSE.invalidFileMessage,
    status: COURSE_MUTATION_STATUS.invalidFile,
  },
  log: LESSON_FILE_DELETE_ROUTE_LOG,
  readMetadata: ({ fileId, slug }) => ({ fileId, slug }),
});
