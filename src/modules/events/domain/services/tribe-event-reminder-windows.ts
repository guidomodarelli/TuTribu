import { TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND } from "@/src/modules/events/constants/tribe-events";
import type {
  TribeEventDateRange,
  TribeEventOccurrenceException,
  TribeEventSchedule,
} from "@/src/modules/events/domain/entities/tribe-event";
import { expandTribeEventOccurrencesWithExceptions } from "@/src/modules/events/domain/services/tribe-event-occurrence-exceptions";

/**
 * Pure selection of the occurrences that are due for a reminder. A reminder
 * window is "starts `leadMinutes` from now, give or take `toleranceMinutes`",
 * measured on the effective start (a moved date uses its new time) and never
 * on a cancelled date.
 */

const MILLISECONDS_PER_MINUTE = 60_000;

export type TribeEventReminderWindow = {
  leadMinutes: number;
  toleranceMinutes: number;
};

/**
 * One series of any tribe with its exceptions, as read by the reminder job.
 */
export type TribeEventReminderSeries = {
  event: TribeEventSchedule & { id: string };
  exceptions: readonly TribeEventOccurrenceException[];
  tribeId: string;
};

export type TribeEventDueReminder<TWindow extends TribeEventReminderWindow> = {
  eventId: string;
  /** Stable identity of the occurrence (the instant the rule generates). */
  originalStartsAt: string;
  /** Effective start (the new time of a moved date). */
  startsAt: string;
  tribeId: string;
  window: TWindow;
};

function getWindowBounds(window: TribeEventReminderWindow, now: number) {
  return {
    end: now + (window.leadMinutes + window.toleranceMinutes) * MILLISECONDS_PER_MINUTE,
    start: now + (window.leadMinutes - window.toleranceMinutes) * MILLISECONDS_PER_MINUTE,
  };
}

/**
 * Smallest range `[rangeStart, rangeEnd)` covering every reminder window,
 * used to read only the series that can have a due occurrence.
 *
 * @param windows - Reminder windows.
 * @param now - Reference time in epoch milliseconds.
 * @returns The UTC range to query.
 */
export function getTribeEventReminderRange(
  windows: readonly TribeEventReminderWindow[],
  now: number
): TribeEventDateRange {
  const bounds = windows.map((window) => getWindowBounds(window, now));

  return {
    rangeEnd: new Date(Math.max(...bounds.map((bound) => bound.end))).toISOString(),
    rangeStart: new Date(Math.min(...bounds.map((bound) => bound.start))).toISOString(),
  };
}

/**
 * Expands every series inside the reminder range (with its exceptions) and
 * returns, per window, the occurrences whose effective start falls in
 * `[now + lead - tolerance, now + lead + tolerance)`. Cancelled dates are
 * skipped.
 *
 * @param series - Series with their exceptions.
 * @param windows - Reminder windows (each one is returned on its matches).
 * @param now - Reference time in epoch milliseconds.
 * @returns The due reminders, one per (window, occurrence).
 */
export function selectDueTribeEventReminders<TWindow extends TribeEventReminderWindow>(
  series: readonly TribeEventReminderSeries[],
  windows: readonly TWindow[],
  now: number
): TribeEventDueReminder<TWindow>[] {
  const range = getTribeEventReminderRange(windows, now);
  const dueReminders: TribeEventDueReminder<TWindow>[] = [];

  for (const { event, exceptions, tribeId } of series) {
    const occurrences = expandTribeEventOccurrencesWithExceptions(event, exceptions, range);

    for (const occurrence of occurrences) {
      if (occurrence.exception?.kind === TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND.cancelled) {
        continue;
      }

      const startTime = Date.parse(occurrence.startsAt);

      for (const window of windows) {
        const bounds = getWindowBounds(window, now);

        if (startTime >= bounds.start && startTime < bounds.end) {
          dueReminders.push({
            eventId: event.id,
            originalStartsAt: occurrence.originalStartsAt,
            startsAt: occurrence.startsAt,
            tribeId,
            window,
          });
        }
      }
    }
  }

  return dueReminders;
}
