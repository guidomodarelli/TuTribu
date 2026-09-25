import type { z } from "zod";

import { LESSON_EVENT_SOURCE_INPUT_ISSUE } from "@/src/modules/courses/infrastructure/api/lesson-event-source-request-schemas";
import type { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";
import {
  summarizeValidationIssues,
  type ValidationIssueSummary,
} from "@/src/modules/shared/infrastructure/validation/validation-issue-summary";

/**
 * HTTP wiring of the "Convertir en lección" routes: safe Spanish copy, the
 * single input boundary (params, then body), and the public DTO guard.
 */

type ServerLogger = ReturnType<typeof createServerLogger>;

export const LESSON_EVENT_SOURCE_HTTP_STATUS = {
  badRequest: 400,
  conflict: 409,
  created: 201,
  forbidden: 403,
  notFound: 404,
  ok: 200,
  serverError: 500,
  unauthorized: 401,
} as const;

export const LESSON_EVENT_SOURCE_RESPONSE = {
  createdMessage: "Lección creada en el curso.",
  existingMessage: "Esta grabación ya es una lección de ese curso.",
  forbiddenMessage: "Solo quienes gestionan los cursos pueden convertir la grabación en lección.",
  invalidLessonMessage: "Completá el título de la lección (hasta 160 caracteres).",
  notFoundMessage: "No encontramos el curso, el módulo o la grabación.",
  recordingChangedMessage:
    "La grabación cambió mientras creábamos la lección. Revisala y volvé a intentarlo.",
  unauthorizedMessage: "Iniciá sesión para gestionar los cursos.",
  unexpectedConversionMessage: "No pudimos crear la lección. Intentá de nuevo.",
  unexpectedTargetsMessage: "No pudimos cargar los cursos. Intentá de nuevo.",
} as const;

const LESSON_EVENT_SOURCE_LOG = {
  dtoRejectedMessage: "Lesson conversion public DTO rejected",
  dtoRejectedReason: "public_dto_rejected",
  inputRejectedMessage: "Lesson conversion route input rejected",
} as const;

const LESSON_EVENT_SOURCE_INPUT_PART = {
  body: "body",
  params: "params",
} as const;

export function createLessonEventSourceJsonResponse(
  body: { message: string },
  status: number
): Response {
  return Response.json(body, { status });
}

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    // Unparseable JSON is expected client input, rejected by the schema.
    return undefined;
  }
}

function rejectInput(
  logger: ServerLogger,
  part: string,
  issues: ValidationIssueSummary[],
  firstMessage: string | undefined
): Response {
  logger.warn({
    message: LESSON_EVENT_SOURCE_LOG.inputRejectedMessage,
    metadata: { issues, part },
  });

  return createLessonEventSourceJsonResponse(
    {
      message:
        firstMessage === LESSON_EVENT_SOURCE_INPUT_ISSUE.invalidLesson
          ? LESSON_EVENT_SOURCE_RESPONSE.invalidLessonMessage
          : LESSON_EVENT_SOURCE_RESPONSE.notFoundMessage,
    },
    LESSON_EVENT_SOURCE_HTTP_STATUS.badRequest
  );
}

/**
 * Validates params and (optionally) the JSON body once per request.
 *
 * @returns The typed input, or the 400 response to return as is.
 */
export async function parseLessonEventSourceInput<TParams, TBody = undefined>(input: {
  bodySchema?: z.ZodType<TBody>;
  logger: ServerLogger;
  params: Promise<unknown>;
  paramsSchema: z.ZodType<TParams>;
  request: Request;
}): Promise<
  { body: TBody; isValid: true; params: TParams } | { isValid: false; response: Response }
> {
  const params = input.paramsSchema.safeParse(await input.params);

  if (!params.success) {
    return {
      isValid: false,
      response: rejectInput(
        input.logger,
        LESSON_EVENT_SOURCE_INPUT_PART.params,
        summarizeValidationIssues(params.error.issues),
        params.error.issues[0]?.message
      ),
    };
  }

  if (!input.bodySchema) {
    return { body: undefined as TBody, isValid: true, params: params.data };
  }

  const body = input.bodySchema.safeParse(await readJsonBody(input.request));

  if (!body.success) {
    return {
      isValid: false,
      response: rejectInput(
        input.logger,
        LESSON_EVENT_SOURCE_INPUT_PART.body,
        summarizeValidationIssues(body.error.issues),
        body.error.issues[0]?.message
      ),
    };
  }

  return { body: body.data, isValid: true, params: params.data };
}

/**
 * Sends a success body only after validating it against its public schema;
 * an unusable DTO becomes a safe 500.
 */
export function createLessonEventSourcePublicResponse<TDto>(input: {
  body: unknown;
  failureMessage: string;
  logger: ServerLogger;
  metadata: Record<string, unknown>;
  schema: z.ZodType<TDto>;
  status: number;
}): Response {
  const parsed = input.schema.safeParse(input.body);

  if (!parsed.success) {
    input.logger.error({
      message: LESSON_EVENT_SOURCE_LOG.dtoRejectedMessage,
      metadata: {
        ...input.metadata,
        issues: summarizeValidationIssues(parsed.error.issues),
        reason: LESSON_EVENT_SOURCE_LOG.dtoRejectedReason,
      },
    });

    return createLessonEventSourceJsonResponse(
      { message: input.failureMessage },
      LESSON_EVENT_SOURCE_HTTP_STATUS.serverError
    );
  }

  return Response.json(parsed.data, { status: input.status });
}
