import { createAttachmentDownloadRoute } from "../../../../../attachment-file-routes";

const LESSON_FILE_DOWNLOAD_ROUTE_LOG = {
  failureMessage: "Lesson file download URL creation failed",
  feature: "courses",
  operation: "create-lesson-file-download-url",
} as const;

const LESSON_FILE_DOWNLOAD_ROUTE_RESPONSE = {
  invalidFileMessage: "No pudimos preparar la descarga. Intentá de nuevo.",
  notFoundMessage: "No pudimos encontrar el archivo.",
  unauthorizedMessage: "Iniciá sesión para descargar el material.",
  unexpectedMessage: "No pudimos preparar la descarga. Intentá de nuevo.",
} as const;

/**
 * Authorized download entrypoint for a lesson attachment. The viewer is
 * resolved through the session and the row through RLS-scoped queries (active
 * lesson in an active module for members; everything for leaders); when
 * visible, the response redirects to a short-lived signed R2 URL that forces
 * `Content-Disposition: attachment` with the stored file name.
 */
export const GET = createAttachmentDownloadRoute<{ fileId: string; slug: string }>({
  copy: LESSON_FILE_DOWNLOAD_ROUTE_RESPONSE,
  createDownloadUrl: (modules, { fileId, slug }, { userId }) =>
    modules.courses.useCases.createLessonFileDownloadUrl({ fileId, tribeSlug: slug, userId }),
  log: LESSON_FILE_DOWNLOAD_ROUTE_LOG,
  readMetadata: ({ fileId, slug }) => ({ fileId, slug }),
});
