import { MESSAGE_MUTATION_STATUS } from "@/src/modules/messages/constants/message-round";
import { createRequestModules } from "@/src/modules/setup";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

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

const HTTP_STATUS = {
  badRequest: 400,
  found: 302,
  notFound: 404,
  serverError: 500,
  unauthorized: 401,
} as const;

function createJsonResponse(body: Record<string, unknown>, status: number): Response {
  return Response.json(body, { status });
}

/**
 * Authorized download entrypoint for a message attachment. The viewer is
 * resolved through the session and the row through RLS-scoped queries; when
 * visible, the response redirects to a short-lived signed R2 URL that forces
 * `Content-Disposition: attachment` with the stored file name.
 */
export async function GET(
  request: Request,
  context: {
    params: Promise<{
      assetId: string;
      slug: string;
    }>;
  }
) {
  const { assetId, slug } = await context.params;
  const { requestId } = resolveRequestContext(request.headers);
  const logger = createServerLogger({
    feature: MESSAGE_FILE_DOWNLOAD_ROUTE_LOG.feature,
    operation: MESSAGE_FILE_DOWNLOAD_ROUTE_LOG.operation,
    requestId,
  });
  const modules = await createRequestModules();
  const authenticatedMember = await modules.auth.useCases.getAuthenticatedMember();

  if (!authenticatedMember) {
    return createJsonResponse(
      { message: MESSAGE_FILE_DOWNLOAD_ROUTE_RESPONSE.unauthorizedMessage },
      HTTP_STATUS.unauthorized
    );
  }

  try {
    const result = await modules.messages.useCases.createMessageFileDownloadUrl({
      assetId,
      tribeSlug: slug,
      userId: authenticatedMember.id,
    });

    switch (result.status) {
      case MESSAGE_MUTATION_STATUS.created:
        return Response.redirect(result.downloadUrl, HTTP_STATUS.found);
      case MESSAGE_MUTATION_STATUS.invalidFile:
        return createJsonResponse(
          { message: MESSAGE_FILE_DOWNLOAD_ROUTE_RESPONSE.invalidFileMessage },
          HTTP_STATUS.badRequest
        );
      case MESSAGE_MUTATION_STATUS.notFound:
      default:
        return createJsonResponse(
          { message: MESSAGE_FILE_DOWNLOAD_ROUTE_RESPONSE.notFoundMessage },
          HTTP_STATUS.notFound
        );
    }
  } catch (error) {
    logger.error({
      message: MESSAGE_FILE_DOWNLOAD_ROUTE_LOG.failureMessage,
      error,
      metadata: {
        assetId,
        slug,
        viewerId: authenticatedMember.id,
      },
    });

    return createJsonResponse(
      { message: MESSAGE_FILE_DOWNLOAD_ROUTE_RESPONSE.unexpectedMessage },
      HTTP_STATUS.serverError
    );
  }
}
