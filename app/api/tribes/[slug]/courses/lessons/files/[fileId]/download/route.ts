import { COURSE_MUTATION_STATUS } from "@/src/modules/courses/constants/courses";
import { createRequestModules } from "@/src/modules/setup";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

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
 * Authorized download entrypoint for a lesson attachment. The viewer is
 * resolved through the session and the row through RLS-scoped queries (active
 * lesson in an active module for members; everything for leaders); when
 * visible, the response redirects to a short-lived signed R2 URL that forces
 * `Content-Disposition: attachment` with the stored file name.
 */
export async function GET(
  request: Request,
  context: {
    params: Promise<{
      fileId: string;
      slug: string;
    }>;
  }
) {
  const { fileId, slug } = await context.params;
  const { requestId } = resolveRequestContext(request.headers);
  const logger = createServerLogger({
    feature: LESSON_FILE_DOWNLOAD_ROUTE_LOG.feature,
    operation: LESSON_FILE_DOWNLOAD_ROUTE_LOG.operation,
    requestId,
  });
  const modules = await createRequestModules();
  const authenticatedMember = await modules.auth.useCases.getAuthenticatedMember();

  if (!authenticatedMember) {
    return createJsonResponse(
      { message: LESSON_FILE_DOWNLOAD_ROUTE_RESPONSE.unauthorizedMessage },
      HTTP_STATUS.unauthorized
    );
  }

  try {
    const result = await modules.courses.useCases.createLessonFileDownloadUrl({
      fileId,
      tribeSlug: slug,
      userId: authenticatedMember.id,
    });

    switch (result.status) {
      case COURSE_MUTATION_STATUS.created:
        return Response.redirect(result.downloadUrl, HTTP_STATUS.found);
      case COURSE_MUTATION_STATUS.invalidFile:
        return createJsonResponse(
          { message: LESSON_FILE_DOWNLOAD_ROUTE_RESPONSE.invalidFileMessage },
          HTTP_STATUS.badRequest
        );
      case COURSE_MUTATION_STATUS.notFound:
      default:
        return createJsonResponse(
          { message: LESSON_FILE_DOWNLOAD_ROUTE_RESPONSE.notFoundMessage },
          HTTP_STATUS.notFound
        );
    }
  } catch (error) {
    logger.error({
      message: LESSON_FILE_DOWNLOAD_ROUTE_LOG.failureMessage,
      error,
      metadata: {
        fileId,
        slug,
        viewerId: authenticatedMember.id,
      },
    });

    return createJsonResponse(
      { message: LESSON_FILE_DOWNLOAD_ROUTE_RESPONSE.unexpectedMessage },
      HTTP_STATUS.serverError
    );
  }
}
