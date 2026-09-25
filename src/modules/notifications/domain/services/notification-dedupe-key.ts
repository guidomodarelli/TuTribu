import { NOTIFICATION_DEDUPE_KEY_SEPARATOR } from "@/src/modules/notifications/constants/notifications";
import type { NotificationType } from "@/src/modules/notifications/domain/entities/notification";

/**
 * Builds the dedupe key of a notification: `<type>:<subject>[:<version>]`.
 * It is unique per recipient in the database, so every producer that builds
 * the same key for the same fact enqueues it once, however many times it
 * runs. `version` distinguishes real repetitions of a fact (a second move of
 * the same date); the SQL producers build the same shape.
 *
 * @param type - Notification type.
 * @param subject - Stable identity of what the notification is about (for
 * an event occurrence, `eventId@originalStartsAt`).
 * @param version - Optional version of the fact.
 * @returns The dedupe key.
 */
export function buildNotificationDedupeKey(
  type: NotificationType,
  subject: string,
  version?: string
): string {
  const parts = version === undefined ? [type, subject] : [type, subject, version];

  return parts.join(NOTIFICATION_DEDUPE_KEY_SEPARATOR);
}
