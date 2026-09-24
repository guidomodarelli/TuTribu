import type { z } from "zod";

import { ROUTES } from "@/src/constants/routes";
import {
  notificationInboxSchema,
  notificationMarkReadResponseSchema,
  notificationMessageResponseSchema,
  notificationUnreadCountSchema,
  type NotificationInboxResponse,
} from "@/src/modules/notifications/application/results/notification-public-dto-schemas";

/**
 * Browser adapter of `/api/notifications/**`. It only knows URLs, verbs, and
 * bodies: each success body is checked with `safeParse` against its public
 * DTO schema (a body that does not match is a failure without message, so the
 * caller shows its own fallback copy). UI state and feedback belong to the
 * caller.
 */

export type NotificationRequestResult<TData> =
  | ({ isSuccess: true } & TData)
  | { isSuccess: false; message: string | null };

const NOTIFICATION_ENDPOINT = {
  markAllReadPath: "/read-all",
  separator: "/",
  unreadCountPath: "/unread-count",
} as const;

const HTTP_REQUEST = {
  contentTypeHeader: "Content-Type",
  jsonContentType: "application/json",
  methodPatch: "PATCH",
  methodPost: "POST",
} as const;

const NO_STORE_CACHE: RequestCache = "no-store";

async function readNotificationResponse<TDto>(
  response: Response,
  schema: z.ZodType<TDto>
): Promise<NotificationRequestResult<{ dto: TDto }>> {
  const body: unknown = await response.json().catch(() => null);

  if (response.ok) {
    const dto = schema.safeParse(body);

    if (dto.success) {
      return { dto: dto.data, isSuccess: true };
    }

    return { isSuccess: false, message: null };
  }

  const failure = notificationMessageResponseSchema.safeParse(body);

  return { isSuccess: false, message: failure.success ? failure.data.message : null };
}

/**
 * Loads the inbox (newest notifications and unread count).
 *
 * @param input - Abort signal so a stale load never updates the UI.
 */
export async function fetchNotificationInboxRequest(input: {
  signal?: AbortSignal;
}): Promise<NotificationRequestResult<{ inbox: NotificationInboxResponse }>> {
  const response = await fetch(ROUTES.api.notifications, {
    cache: NO_STORE_CACHE,
    signal: input.signal,
  });
  const result = await readNotificationResponse(response, notificationInboxSchema);

  return result.isSuccess ? { inbox: result.dto, isSuccess: true } : result;
}

/**
 * Loads only the unread badge count (polling path).
 */
export async function fetchUnreadNotificationCountRequest(input: {
  signal?: AbortSignal;
}): Promise<NotificationRequestResult<{ unreadCount: number }>> {
  const response = await fetch(ROUTES.api.notifications + NOTIFICATION_ENDPOINT.unreadCountPath, {
    cache: NO_STORE_CACHE,
    signal: input.signal,
  });
  const result = await readNotificationResponse(response, notificationUnreadCountSchema);

  return result.isSuccess ? { isSuccess: true, unreadCount: result.dto.unreadCount } : result;
}

/**
 * Marks one notification as read. `keepalive` lets the request finish when
 * the click also navigates to the event.
 */
export async function markNotificationReadRequest(input: {
  notificationId: string;
}): Promise<NotificationRequestResult<{ unreadCount: number }>> {
  const response = await fetch(
    ROUTES.api.notifications +
      NOTIFICATION_ENDPOINT.separator +
      encodeURIComponent(input.notificationId),
    {
      body: JSON.stringify({ isRead: true }),
      cache: NO_STORE_CACHE,
      headers: { [HTTP_REQUEST.contentTypeHeader]: HTTP_REQUEST.jsonContentType },
      keepalive: true,
      method: HTTP_REQUEST.methodPatch,
    }
  );
  const result = await readNotificationResponse(response, notificationMarkReadResponseSchema);

  return result.isSuccess ? { isSuccess: true, unreadCount: result.dto.unreadCount } : result;
}

/**
 * "Marcar todas como leídas".
 */
export async function markAllNotificationsReadRequest(): Promise<
  NotificationRequestResult<{ unreadCount: number }>
> {
  const response = await fetch(ROUTES.api.notifications + NOTIFICATION_ENDPOINT.markAllReadPath, {
    cache: NO_STORE_CACHE,
    method: HTTP_REQUEST.methodPost,
  });
  const result = await readNotificationResponse(response, notificationMarkReadResponseSchema);

  return result.isSuccess ? { isSuccess: true, unreadCount: result.dto.unreadCount } : result;
}
