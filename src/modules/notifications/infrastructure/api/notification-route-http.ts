import { NOTIFICATION_INPUT_ISSUE } from "@/src/modules/notifications/infrastructure/api/notification-request-schemas";
import {
  createPrivateJsonRouteBoundary,
  createPrivateNoStoreJsonResponse,
  type PrivateJsonRouteRequest,
  type PublicDtoResponseInput,
} from "@/src/modules/shared/infrastructure/http/route-input";

/**
 * Shared HTTP wiring of the notification routes: safe Spanish copy, input
 * parsing (params, query, body; once per request) and public DTO output
 * validation. Responses are per user, so they are never cached.
 */

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

const notificationRouteBoundary = createPrivateJsonRouteBoundary({
  inputRejectedLogMessage: NOTIFICATION_ROUTE_LOG.inputRejectedMessage,
  publicDtoRejectedLogMessage: NOTIFICATION_ROUTE_LOG.publicDtoRejectedMessage,
  readInputIssueMessage: (issueMessage = "") =>
    INPUT_ISSUE_MESSAGE[issueMessage] ?? NOTIFICATION_ROUTE_RESPONSE.invalidInputMessage,
});

export type NotificationRouteInput<TParams, TBody> =
  | { body: TBody; isValid: true; params: TParams }
  | { isValid: false; response: Response };

/**
 * Validates params, query, and (when the route takes one) body of a request.
 * Invalid input becomes a 400 with safe copy and a `warn` log carrying only
 * issue paths and codes.
 */
export async function parseNotificationRouteInput<TParams, TQuery, TBody = undefined>(
  input: PrivateJsonRouteRequest<TParams, TQuery, TBody>
): Promise<NotificationRouteInput<TParams, TBody>> {
  const parsed = await notificationRouteBoundary.parseInput(input);

  return parsed.isValid
    ? { body: parsed.body, isValid: true, params: parsed.params }
    : parsed;
}

/**
 * Validates a public DTO against its allowlist schema and sends only the
 * parsed value. An unusable DTO is logged (paths and codes) and becomes a
 * safe 500.
 */
export function createNotificationPublicResponse<TDto>(input: PublicDtoResponseInput<TDto>): Response {
  return notificationRouteBoundary.createPublicResponse(input);
}
