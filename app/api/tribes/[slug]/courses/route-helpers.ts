export const COURSE_ROUTE_LOG = {
  createCourseFailureMessage: "Course creation failed",
  createCourseModuleFailureMessage: "Course module creation failed",
  createLessonCommentFailureMessage: "Lesson comment creation failed",
  createLessonFailureMessage: "Course lesson creation failed",
  deleteCourseFailureMessage: "Course deletion failed",
  deleteCourseModuleFailureMessage: "Course module deletion failed",
  deleteLessonCommentFailureMessage: "Lesson comment deletion failed",
  deleteLessonFailureMessage: "Course lesson deletion failed",
  feature: "courses",
  listLessonCommentsFailureMessage: "Lesson comment listing failed",
  operation: "manage-tribe-courses",
  recordLastViewedLessonFailureMessage: "Last viewed lesson recording failed",
  setLessonCompletionFailureMessage: "Lesson completion toggle failed",
  updateCourseFailureMessage: "Course update failed",
  updateCourseModuleFailureMessage: "Course module update failed",
  updateLessonFailureMessage: "Course lesson update failed",
} as const;

export const COURSE_ROUTE_RESPONSE = {
  createSuccessMessage: "Contenido creado.",
  deleteSuccessMessage: "Contenido eliminado.",
  forbiddenMessage: "No tenés permisos para gestionar los cursos.",
  invalidFileMessage:
    "No pudimos adjuntar esos archivos a la lección. Revisá el tipo y el tamaño, y volvé a subirlos.",
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
  commentCreatedMessage: "Comentario publicado.",
  commentDeletedMessage: "Comentario eliminado.",
  commentForbiddenMessage: "No podés comentar en esta lección.",
  completionSavedMessage: "Progreso guardado.",
  completionForbiddenMessage: "No podés actualizar el progreso de esta lección.",
  invalidCommentMessage:
    "Escribí un comentario de hasta 2000 caracteres.",
  unexpectedCommentMessage:
    "No pudimos publicar el comentario. Intentá de nuevo.",
  unexpectedCompletionMessage:
    "No pudimos guardar tu progreso. Intentá de nuevo.",
} as const;

export const COURSE_ROUTE_FIELD = {
  accessRequirement: "accessRequirement",
  assetId: "assetId",
  completed: "completed",
  content: "content",
  courseId: "courseId",
  courseModuleId: "courseModuleId",
  coverImageUrl: "coverImageUrl",
  description: "description",
  externalVideoUrl: "externalVideoUrl",
  files: "files",
  isActive: "isActive",
  lessonId: "lessonId",
  sortOrder: "sortOrder",
  title: "title",
  unlockAfterDays: "unlockAfterDays",
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
  invalidFile: "invalid_file",
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

/**
 * Reads a field that may be omitted. The use case validates its value, and
 * `undefined` means "not sent" (keep the stored value on update).
 *
 * @param body - Parsed request body.
 * @param field - Field name.
 * @returns The raw value, or undefined when absent.
 */
export function readOptionalField(body: unknown, field: string): unknown {
  if (!body || typeof body !== "object" || !(field in body)) {
    return undefined;
  }

  return (body as Record<string, unknown>)[field];
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

/**
 * Reads an optional non-negative integer field: `null` when absent or blank,
 * `undefined` when present but malformed.
 *
 * @param body - Parsed request body.
 * @param field - Field name to read.
 * @returns The integer, `null` for "unset", or `undefined` on invalid input.
 */
export function readNullableNumberField(
  body: unknown,
  field: string
): number | null | undefined {
  if (!body || typeof body !== "object" || !(field in body)) {
    return null;
  }

  const value = (body as Record<string, unknown>)[field];

  if (value === null || value === "") {
    return null;
  }

  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
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

/**
 * Reads the optional lesson `files` field from a payload: an array of
 * `{ assetId }` entries whose index expresses the leader-chosen slot.
 *
 * @param body - Parsed request body that may contain a `files` array.
 * @returns `undefined` when absent, `null` when malformed, or the drafts.
 */
export function readLessonFilesField(
  body: unknown
): { assetId: string }[] | null | undefined {
  if (!body || typeof body !== "object" || !(COURSE_ROUTE_FIELD.files in body)) {
    return undefined;
  }

  const files = (body as Record<string, unknown>)[COURSE_ROUTE_FIELD.files];

  if (!Array.isArray(files)) {
    return null;
  }

  const drafts: { assetId: string }[] = [];

  for (const item of files) {
    if (!item || typeof item !== "object") {
      return null;
    }

    const assetId = (item as Record<string, unknown>)[
      COURSE_ROUTE_FIELD.assetId
    ];

    if (typeof assetId !== "string") {
      return null;
    }

    drafts.push({ assetId });
  }

  return drafts;
}

export function mapMutationStatusResponse(status: string): Response {
  switch (status) {
    case COURSE_MUTATION_STATUS.invalidInput:
      return createJsonResponse(
        { message: COURSE_ROUTE_RESPONSE.invalidInputMessage },
        HTTP_STATUS.badRequest
      );
    case COURSE_MUTATION_STATUS.invalidFile:
      return createJsonResponse(
        { message: COURSE_ROUTE_RESPONSE.invalidFileMessage },
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
