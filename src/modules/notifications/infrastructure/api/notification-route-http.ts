import type { z } from "zod";

import { NOTIFICATION_INPUT_ISSUE } from "@/src/modules/notifications/infrastructure/api/notification-request-schemas";
import type { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";
import { summarizeValidationIssues } from "@/src/modules/shared/infrastructure/validation/validation-issue-summary";

/**
 * Shared HTTP wiring of the notification routes: safe Spanish copy, input
 * parsing (params, query, body; once per request) and public DTO output
 * validation. Responses are per user, so they are never cached.
 */

type ServerLogger = ReturnType<typeof createServerLogger>;

export const NOTIFICATION_ROUTE_HTTP_STATUS = {
  badRequest: 400,
  notFound: 404,
  ok: 200,
  serverError: 500,
  unauthorized: 401,
} as const;

export const NOTIFICATION_ROUTE_RESPONSE = {
  invalidInputMessage: "No pudimos procesar el pedido de notificaciones.",
  notificationNotFoundMessage: "No encontramos esa notificación.",
  unauthorizedMessage: "Iniciá sesión para ver tus notificaciones.",
  unexpectedInboxMessage: "No pudimos cargar tus notificaciones. Intentá de nuevo.",
  unexpectedMarkMessage: "No pudimos marcar la notificación como leída. Intentá de nuevo.",
} as const;

const NOTIFICATION_ROUTE_LOG = {
  inputRejectedMessage: "Notification route input rejected",
  publicDtoRejectedMessage: "Notification public DTO rejected",
  publicDtoRejectedReason: "public_dto_rejected",
} as const;

const CACHE_CONTROL_HEADER = "Cache-Control";
const NO_STORE_CACHE_CONTROL = "private, no-store";

const INPUT_ISSUE_MESSAGE: Record<string, string> = {
  [NOTIFICATION_INPUT_ISSUE.invalidInput]: NOTIFICATION_ROUTE_RESPONSE.invalidInputMessage,
  [NOTIFICATION_INPUT_ISSUE.invalidNotificationReference]:
    NOTIFICATION_ROUTE_RESPONSE.notificationNotFoundMessage,
};

/**
 * JSON response that no shared cache may store (the inbox is personal).
 */
export function createNotificationJsonResponse(body: unknown, status: number): Response {
  const response = Response.json(body, { status });

  response.headers.set(CACHE_CONTROL_HEADER, NO_STORE_CACHE_CONTROL);

  return response;
}

function readQueryObject(request: Request): Record<string, string | string[]> {
  const { searchParams } = new URL(request.url);
  const query: Record<string, string | string[]> = {};

  for (const key of new Set(searchParams.keys())) {
    const values = searchParams.getAll(key);

    query[key] = values.length === 1 ? values[0] : values;
  }

  return query;
}

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    // Unparseable JSON is expected client input: the body schema rejects it.
    return undefined;
  }
}

function rejectInput(logger: ServerLogger, part: string, error: z.ZodError) {
  logger.warn({
    message: NOTIFICATION_ROUTE_LOG.inputRejectedMessage,
    metadata: { issues: summarizeValidationIssues(error.issues), part },
  });

  const firstIssueMessage = error.issues[0]?.message ?? "";

  return {
    isValid: false as const,
    response: createNotificationJsonResponse(
      {
        message:
          INPUT_ISSUE_MESSAGE[firstIssueMessage] ?? NOTIFICATION_ROUTE_RESPONSE.invalidInputMessage,
      },
      NOTIFICATION_ROUTE_HTTP_STATUS.badRequest
    ),
  };
}

export type NotificationRouteInput<TParams, TBody> =
  | { body: TBody; isValid: true; params: TParams }
  | { isValid: false; response: Response };

/**
 * Validates params, query, and (when the route takes one) body of a request.
 * Invalid input becomes a 400 with safe copy and a `warn` log carrying only
 * issue paths and codes.
 */
export async function parseNotificationRouteInput<TParams, TQuery, TBody = undefined>(input: {
  logger: ServerLogger;
  params: Promise<unknown>;
  request: Request;
  schemas: { body?: z.ZodType<TBody>; params: z.ZodType<TParams>; query: z.ZodType<TQuery> };
}): Promise<NotificationRouteInput<TParams, TBody>> {
  const { logger, request, schemas } = input;
  const params = schemas.params.safeParse(await input.params);

  if (!params.success) {
    return rejectInput(logger, "params", params.error);
  }

  const query = schemas.query.safeParse(readQueryObject(request));

  if (!query.success) {
    return rejectInput(logger, "query", query.error);
  }

  if (!schemas.body) {
    return { body: undefined as TBody, isValid: true, params: params.data };
  }

  const body = schemas.body.safeParse(await readJsonBody(request));

  if (!body.success) {
    return rejectInput(logger, "body", body.error);
  }

  return { body: body.data, isValid: true, params: params.data };
}

/**
 * Validates a public DTO against its allowlist schema and sends only the
 * parsed value. An unusable DTO is logged (paths and codes) and becomes a
 * safe 500.
 */
export function createNotificationPublicResponse<TDto>(input: {
  body: unknown;
  failureMessage: string;
  logger: ServerLogger;
  metadata: Record<string, unknown>;
  schema: z.ZodType<TDto>;
}): Response {
  const parsed = input.schema.safeParse(input.body);

  if (!parsed.success) {
    input.logger.error({
      message: NOTIFICATION_ROUTE_LOG.publicDtoRejectedMessage,
      metadata: {
        ...input.metadata,
        issues: summarizeValidationIssues(parsed.error.issues),
        reason: NOTIFICATION_ROUTE_LOG.publicDtoRejectedReason,
      },
    });

    return createNotificationJsonResponse(
      { message: input.failureMessage },
      NOTIFICATION_ROUTE_HTTP_STATUS.serverError
    );
  }

  return createNotificationJsonResponse(parsed.data, NOTIFICATION_ROUTE_HTTP_STATUS.ok);
}
