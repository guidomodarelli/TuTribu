import type { z } from "zod";

import { NOTIFICATION_INPUT_ISSUE } from "@/src/modules/notifications/infrastructure/api/notification-request-schemas";
import type { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";
import {
  createPrivateNoStoreJsonResponse,
  parsePublicDto,
  parseRouteRequestParts,
  type RouteInputRejection,
} from "@/src/modules/shared/infrastructure/http/route-input";
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

const INPUT_ISSUE_MESSAGE: Record<string, string> = {
  [NOTIFICATION_INPUT_ISSUE.invalidInput]: NOTIFICATION_ROUTE_RESPONSE.invalidInputMessage,
  [NOTIFICATION_INPUT_ISSUE.invalidNotificationReference]:
    NOTIFICATION_ROUTE_RESPONSE.notificationNotFoundMessage,
};

/**
 * JSON response that no shared cache may store (the inbox is personal).
 */
export function createNotificationJsonResponse(body: unknown, status: number): Response {
  return createPrivateNoStoreJsonResponse(body, status);
}

function rejectInput(
  logger: ServerLogger,
  part: string,
  error: z.ZodError
): RouteInputRejection {
  logger.warn({
    message: NOTIFICATION_ROUTE_LOG.inputRejectedMessage,
    metadata: { issues: summarizeValidationIssues(error.issues), part },
  });

  const firstIssueMessage = error.issues[0]?.message ?? "";

  return {
    isValid: false,
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
  const parsed = await parseRouteRequestParts({
    params: input.params,
    reject: (part, error) => rejectInput(input.logger, part, error),
    request: input.request,
    schemas: input.schemas,
  });

  return parsed.isValid
    ? { body: parsed.body, isValid: true, params: parsed.params }
    : parsed;
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
  const parsed = parsePublicDto({
    body: input.body,
    logMessage: NOTIFICATION_ROUTE_LOG.publicDtoRejectedMessage,
    logger: input.logger,
    metadata: input.metadata,
    reason: NOTIFICATION_ROUTE_LOG.publicDtoRejectedReason,
    schema: input.schema,
  });

  if (!parsed.success) {
    return createNotificationJsonResponse(
      { message: input.failureMessage },
      NOTIFICATION_ROUTE_HTTP_STATUS.serverError
    );
  }

  return createNotificationJsonResponse(parsed.data, NOTIFICATION_ROUTE_HTTP_STATUS.ok);
}
