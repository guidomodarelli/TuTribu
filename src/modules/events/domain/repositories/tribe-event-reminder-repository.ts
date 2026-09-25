import type {
  TribeEventAttendanceStatus,
  TribeEventDateRange,
} from "@/src/modules/events/domain/entities/tribe-event";
import type { TribeEventReminderSeries } from "@/src/modules/events/domain/services/tribe-event-reminder-windows";
import type { NewNotification, NotificationEventOccurrenceType } from "@/src/modules/notifications/domain/entities/notification";

/**
 * Persistence of the reminder job. It runs without an app user, through the
 * maintenance connection (the table owner or a dedicated maintenance role):
 * it reads the series of every tribe and enqueues reminders for the members
 * who answered, skipping a date that was cancelled or moved after the read.
 */

export type ListTribeEventReminderSeriesQuery = TribeEventDateRange & {
  /** Keyset cursor: only series whose id sorts after this one. */
  afterEventId: string | null;
  limit: number;
};

export type TribeEventReminderSeriesPage = {
  /** Cursor of the next page, or null when this was the last one. */
  nextCursor: string | null;
  series: TribeEventReminderSeries[];
};

/**
 * One due reminder for one occurrence. The adapter fans it out to every
 * member whose answer is in `statuses` and who can still read the tribe.
 */
export type TribeEventReminderCandidate = {
  eventId: string;
  notification: Pick<
    NewNotification<NotificationEventOccurrenceType>,
    "dedupeKey" | "payload" | "type"
  >;
  /**
   * Exclusive lower bound of the window that selected the reminder (minutes
   * before the effective start). The adapter rechecks it against the database
   * clock after locking the event, so a candidate that became late while the
   * run waited (a manager transaction holding the event row, a slow page) is
   * not enqueued after its cutoff.
   */
  minimumLeadMinutes: number;
  originalStartsAt: string;
  statuses: readonly TribeEventAttendanceStatus[];
  tribeId: string;
};

export interface TribeEventReminderRepository {
  /**
   * Enqueues the reminders (insert-or-ignore on the recipient dedupe key).
   *
   * @returns How many notifications were actually created.
   */
  enqueueReminders(candidates: readonly TribeEventReminderCandidate[]): Promise<number>;
  listSeriesInRange(query: ListTribeEventReminderSeriesQuery): Promise<TribeEventReminderSeriesPage>;
}
