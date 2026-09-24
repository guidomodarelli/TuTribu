import { buildGoogleCalendarEventUrl } from "@/lib/calendar/google-calendar-link";
import type { TribeEventOccurrenceResult } from "@/src/modules/events/application/results/tribe-event-result";
import { isOccurrenceMoved } from "@/lib/events/tribe-event-occurrence-exception-copy";
import { TRIBE_EVENT_DEFAULT_DURATION_MINUTES } from "@/src/modules/events/constants/tribe-events";

/**
 * Google Calendar "add event" link for an occurrence, shared by the agenda
 * rows and the detail dialog. Series include their RRULE and are anchored at
 * the series start/end (not the clicked slot), so Google adds the whole
 * series including earlier slots; single events keep the occurrence times.
 * The meeting link travels as the location.
 *
 * The "add event" link cannot carry EXDATE or RECURRENCE-ID, so a series
 * link ignores cancelled and moved dates (the .ics download includes them).
 * A moved date is exported as a single event at its new time, and callers
 * do not offer the link for a cancelled date.
 *
 * @param occurrence - Occurrence to export.
 * @returns The Google Calendar URL.
 */
export function buildTribeEventGoogleCalendarUrl(
  occurrence: TribeEventOccurrenceResult
): string {
  // A moved date leaves the series pattern, so it is exported on its own.
  const exportsSeries = occurrence.recurrenceRule !== null && !isOccurrenceMoved(occurrence);

  return buildGoogleCalendarEventUrl({
    defaultDurationMinutes: TRIBE_EVENT_DEFAULT_DURATION_MINUTES,
    description: occurrence.description,
    endsAt: exportsSeries ? occurrence.seriesEndsAt : occurrence.endsAt,
    location: occurrence.meetingUrl,
    recurrenceRule: exportsSeries ? occurrence.recurrenceRule : null,
    startsAt: exportsSeries ? occurrence.seriesStartsAt : occurrence.startsAt,
    title: occurrence.title,
  });
}
