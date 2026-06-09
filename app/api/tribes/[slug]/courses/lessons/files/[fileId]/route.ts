import { COURSE_MUTATION_STATUS } from "@/src/modules/courses/constants/courses";
import { createRequestModules } from "@/src/modules/setup";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";
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

const HTTP_STATUS = {
  badRequest: 400,
  forbidden: 403,
  notFound: 404,
  ok: 200,
  serverError: 500,
  unauthorized: 401,
} as const;

function createJsonResponse(body: Record<string, unknown>, status: number): Response {
  return Response.json(body, { status });
}

export async function DELETE(
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
    feature: LESSON_FILE_DELETE_ROUTE_LOG.feature,
    operation: LESSON_FILE_DELETE_ROUTE_LOG.operation,
    requestId,
  });
  const modules = await createRequestModules();
  const authenticatedMember = await modules.auth.useCases.getAuthenticatedMember();

  if (!authenticatedMember) {
    return createJsonResponse(
      { message: LESSON_FILE_DELETE_ROUTE_RESPONSE.unauthorizedMessage },
      HTTP_STATUS.unauthorized
    );
  }

  if (!readUuidValue(fileId)) {
    return createJsonResponse(
      { message: LESSON_FILE_DELETE_ROUTE_RESPONSE.notFoundMessage },
      HTTP_STATUS.notFound
    );
  }

  try {
    const result = await modules.courses.useCases.deleteLessonFile({
      fileId,
      tribeSlug: slug,
      userId: authenticatedMember.id,
    });

    switch (result.status) {
      case COURSE_MUTATION_STATUS.deleted:
        return createJsonResponse(
          { message: LESSON_FILE_DELETE_ROUTE_RESPONSE.successMessage },
          HTTP_STATUS.ok
        );
      case COURSE_MUTATION_STATUS.notFound:
        return createJsonResponse(
          { message: LESSON_FILE_DELETE_ROUTE_RESPONSE.notFoundMessage },
          HTTP_STATUS.notFound
        );
      case COURSE_MUTATION_STATUS.invalidFile:
        return createJsonResponse(
          { message: LESSON_FILE_DELETE_ROUTE_RESPONSE.invalidFileMessage },
          HTTP_STATUS.badRequest
        );
      case COURSE_MUTATION_STATUS.forbidden:
      default:
        return createJsonResponse(
          { message: LESSON_FILE_DELETE_ROUTE_RESPONSE.forbiddenMessage },
          HTTP_STATUS.forbidden
        );
    }
  } catch (error) {
    logger.error({
      message: LESSON_FILE_DELETE_ROUTE_LOG.failureMessage,
      error,
      metadata: {
        fileId,
        slug,
        viewerId: authenticatedMember.id,
      },
    });

    return createJsonResponse(
      { message: LESSON_FILE_DELETE_ROUTE_RESPONSE.unexpectedMessage },
      HTTP_STATUS.serverError
    );
  }
}
