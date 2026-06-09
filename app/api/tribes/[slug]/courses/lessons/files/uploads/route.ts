import { COURSE_MUTATION_STATUS } from "@/src/modules/courses/constants/courses";
import { createRequestModules } from "@/src/modules/setup";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

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

const LESSON_FILE_UPLOAD_ROUTE_FIELD = {
  fileName: "fileName",
  fileSizeBytes: "fileSizeBytes",
  mimeType: "mimeType",
} as const;

const HTTP_STATUS = {
  badRequest: 400,
  created: 201,
  forbidden: 403,
  notFound: 404,
  serverError: 500,
  unauthorized: 401,
} as const;

type UploadDeclaration = {
  fileName: string;
  fileSizeBytes: number;
  mimeType: string;
};

function createJsonResponse(body: Record<string, unknown>, status: number): Response {
  return Response.json(body, { status });
}

function readUploadDeclaration(body: unknown): UploadDeclaration | null {
  if (!body || typeof body !== "object") {
    return null;
  }

  const record = body as Record<string, unknown>;
  const fileName = record[LESSON_FILE_UPLOAD_ROUTE_FIELD.fileName];
  const fileSizeBytes = record[LESSON_FILE_UPLOAD_ROUTE_FIELD.fileSizeBytes];
  const mimeType = record[LESSON_FILE_UPLOAD_ROUTE_FIELD.mimeType];

  if (
    typeof fileName !== "string" ||
    typeof mimeType !== "string" ||
    typeof fileSizeBytes !== "number"
  ) {
    return null;
  }

  return { fileName, fileSizeBytes, mimeType };
}

export async function POST(
  request: Request,
  context: {
    params: Promise<{
      slug: string;
    }>;
  }
) {
  const { slug } = await context.params;
  const { requestId } = resolveRequestContext(request.headers);
  const logger = createServerLogger({
    feature: LESSON_FILE_UPLOAD_ROUTE_LOG.feature,
    operation: LESSON_FILE_UPLOAD_ROUTE_LOG.operation,
    requestId,
  });
  const modules = await createRequestModules();
  const authenticatedMember = await modules.auth.useCases.getAuthenticatedMember();

  if (!authenticatedMember) {
    return createJsonResponse(
      { message: LESSON_FILE_UPLOAD_ROUTE_RESPONSE.unauthorizedMessage },
      HTTP_STATUS.unauthorized
    );
  }

  try {
    const body = await request.json().catch(() => null);
    const declaration = readUploadDeclaration(body);

    if (!declaration) {
      return createJsonResponse(
        { message: LESSON_FILE_UPLOAD_ROUTE_RESPONSE.invalidFileMessage },
        HTTP_STATUS.badRequest
      );
    }

    const result = await modules.courses.useCases.createLessonFileUpload({
      fileName: declaration.fileName,
      fileSizeBytes: declaration.fileSizeBytes,
      mimeType: declaration.mimeType,
      tribeSlug: slug,
      userId: authenticatedMember.id,
    });

    switch (result.status) {
      case COURSE_MUTATION_STATUS.created:
        return createJsonResponse(
          {
            assetId: result.assetId,
            uploadHeaders: result.uploadHeaders,
            uploadUrl: result.uploadUrl,
          },
          HTTP_STATUS.created
        );
      case COURSE_MUTATION_STATUS.notFound:
        return createJsonResponse(
          { message: LESSON_FILE_UPLOAD_ROUTE_RESPONSE.notFoundMessage },
          HTTP_STATUS.notFound
        );
      case COURSE_MUTATION_STATUS.invalidFile:
        return createJsonResponse(
          { message: LESSON_FILE_UPLOAD_ROUTE_RESPONSE.invalidFileMessage },
          HTTP_STATUS.badRequest
        );
      case COURSE_MUTATION_STATUS.forbidden:
      default:
        return createJsonResponse(
          { message: LESSON_FILE_UPLOAD_ROUTE_RESPONSE.forbiddenMessage },
          HTTP_STATUS.forbidden
        );
    }
  } catch (error) {
    logger.error({
      message: LESSON_FILE_UPLOAD_ROUTE_LOG.failureMessage,
      error,
      metadata: {
        slug,
        viewerId: authenticatedMember.id,
      },
    });

    return createJsonResponse(
      { message: LESSON_FILE_UPLOAD_ROUTE_RESPONSE.unexpectedMessage },
      HTTP_STATUS.serverError
    );
  }
}
