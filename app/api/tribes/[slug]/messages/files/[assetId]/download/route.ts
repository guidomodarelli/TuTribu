import { createAttachmentDownloadRoute } from "../../../../attachment-file-routes";

const MESSAGE_FILE_DOWNLOAD_ROUTE_LOG = {
  failureMessage: "Message file download URL creation failed",
  feature: "messages",
  operation: "create-message-file-download-url",
} as const;

const MESSAGE_FILE_DOWNLOAD_ROUTE_RESPONSE = {
  invalidFileMessage: "No pudimos preparar la descarga. Intentalo de nuevo.",
  notFoundMessage: "No pudimos encontrar el archivo.",
  unauthorizedMessage: "Inicia sesion para descargar archivos.",
  unexpectedMessage: "No pudimos preparar la descarga. Intentalo de nuevo.",
} as const;

/**
 * Authorized download entrypoint for a message attachment. The viewer is
 * resolved through the session and the row through RLS-scoped queries; when
 * visible, the response redirects to a short-lived signed R2 URL that forces
 * `Content-Disposition: attachment` with the stored file name.
 */
export const GET = createAttachmentDownloadRoute<{ assetId: string; slug: string }>({
  copy: MESSAGE_FILE_DOWNLOAD_ROUTE_RESPONSE,
  createDownloadUrl: (modules, { assetId, slug }, { userId }) =>
    modules.messages.useCases.createMessageFileDownloadUrl({ assetId, tribeSlug: slug, userId }),
  log: MESSAGE_FILE_DOWNLOAD_ROUTE_LOG,
  readMetadata: ({ assetId, slug }) => ({ assetId, slug }),
});
