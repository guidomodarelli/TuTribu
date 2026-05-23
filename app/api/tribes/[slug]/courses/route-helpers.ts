export const COURSE_ROUTE_LOG = {
  createCourseModuleFailureMessage: "Course module creation failed",
  createLessonFailureMessage: "Course lesson creation failed",
  deleteCourseModuleFailureMessage: "Course module deletion failed",
  deleteLessonFailureMessage: "Course lesson deletion failed",
  feature: "courses",
  operation: "manage-tribe-courses",
  updateCourseModuleFailureMessage: "Course module update failed",
  updateLessonFailureMessage: "Course lesson update failed",
} as const;

export const COURSE_ROUTE_RESPONSE = {
  createSuccessMessage: "Contenido creado.",
  deleteSuccessMessage: "Contenido eliminado.",
  forbiddenMessage: "No tenés permisos para gestionar los cursos.",
  invalidInputMessage:
    "Completá el título y los campos requeridos del contenido.",
  invalidVideoUrlMessage:
    "Pegá una URL válida de Vimeo, Wistia, Loom o YouTube.",
  notFoundMessage: "No pudimos encontrar el contenido buscado.",
  unauthorizedMessage: "Iniciá sesión para gestionar los cursos.",
  unexpectedCreateMessage:
    "No pudimos guardar el contenido. Intentá de nuevo.",
  unexpectedDeleteMessage:
    "No pudimos eliminar el contenido. Intentá de nuevo.",
  unexpectedUpdateMessage:
    "No pudimos actualizar el contenido. Intentá de nuevo.",
  updateSuccessMessage: "Contenido actualizado.",
} as const;

export const COURSE_ROUTE_FIELD = {
  courseModuleId: "courseModuleId",
  description: "description",
  externalVideoUrl: "externalVideoUrl",
  isActive: "isActive",
  sortOrder: "sortOrder",
  title: "title",
} as const;

export const HTTP_STATUS = {
  badRequest: 400,
  created: 201,
  forbidden: 403,
  notFound: 404,
  ok: 200,
  serverError: 500,
  unauthorized: 401,
} as const;

const COURSE_MUTATION_STATUS = {
  forbidden: "forbidden",
  invalidInput: "invalid_input",
  invalidVideoUrl: "invalid_video_url",
  notFound: "not_found",
} as const;

const TRUE_STRING_VALUE = "true";
const FALSE_STRING_VALUE = "false";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createJsonResponse(
  body: Record<string, unknown>,
  status: number
): Response {
  return Response.json(body, { status });
}

export function readStringField(body: unknown, field: string): string {
  if (!body || typeof body !== "object" || !(field in body)) {
    return "";
  }

  const value = (body as Record<string, unknown>)[field];
  return typeof value === "string" ? value : "";
}

export function readNumberField(body: unknown, field: string): number {
  if (!body || typeof body !== "object" || !(field in body)) {
    return 0;
  }

  const value = (body as Record<string, unknown>)[field];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

export function readBooleanField(body: unknown, field: string): boolean | null {
  if (!body || typeof body !== "object" || !(field in body)) {
    return null;
  }

  const value = (body as Record<string, unknown>)[field];
  if (typeof value === "boolean") {
    return value;
  }

  if (value === TRUE_STRING_VALUE) {
    return true;
  }

  if (value === FALSE_STRING_VALUE) {
    return false;
  }

  return null;
}

/**
 * Reads UUID-shaped identifiers at the HTTP boundary before database UUID casts.
 *
 * @param value - Raw route or payload identifier.
 * @returns The trimmed UUID value when valid, otherwise null.
 */
export function readUuidValue(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();

  return UUID_PATTERN.test(trimmedValue) ? trimmedValue : null;
}

export function readUuidField(body: unknown, field: string): string | null {
  return readUuidValue(readStringField(body, field));
}

export function mapMutationStatusResponse(status: string): Response {
  switch (status) {
    case COURSE_MUTATION_STATUS.invalidInput:
      return createJsonResponse(
        { message: COURSE_ROUTE_RESPONSE.invalidInputMessage },
        HTTP_STATUS.badRequest
      );
    case COURSE_MUTATION_STATUS.invalidVideoUrl:
      return createJsonResponse(
        { message: COURSE_ROUTE_RESPONSE.invalidVideoUrlMessage },
        HTTP_STATUS.badRequest
      );
    case COURSE_MUTATION_STATUS.notFound:
      return createJsonResponse(
        { message: COURSE_ROUTE_RESPONSE.notFoundMessage },
        HTTP_STATUS.notFound
      );
    case COURSE_MUTATION_STATUS.forbidden:
    default:
      return createJsonResponse(
        { message: COURSE_ROUTE_RESPONSE.forbiddenMessage },
        HTTP_STATUS.forbidden
      );
  }
}
