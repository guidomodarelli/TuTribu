import { z } from "zod";

/**
 * Input contracts of `app/api/notifications/**`. Each route validates its
 * params, query, and body once, at its boundary, with these schemas.
 */

export const NOTIFICATION_INPUT_ISSUE = {
  invalidInput: "invalid_notification_input",
  invalidNotificationReference: "invalid_notification_reference",
} as const;

/** Routes without query parameters accept (and ignore) none. */
export const notificationEmptyQuerySchema = z.object({});

/** Routes without route params. */
export const notificationEmptyParamsSchema = z.object({});

/** `[notificationId]` segment: notifications use Postgres uuids. */
export const notificationRouteParamsSchema = z.object({
  notificationId: z.uuid({ error: NOTIFICATION_INPUT_ISSUE.invalidNotificationReference }),
});

/**
 * Body of `PATCH /api/notifications/[notificationId]`: the only change a
 * recipient may make is marking the notification as read.
 */
export const notificationMarkReadBodySchema = z.object({
  isRead: z.literal(true, { error: NOTIFICATION_INPUT_ISSUE.invalidInput }),
});

export type NotificationMarkReadRequestBody = z.infer<typeof notificationMarkReadBodySchema>;
