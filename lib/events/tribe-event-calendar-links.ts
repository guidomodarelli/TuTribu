import { buildGoogleCalendarEventUrl } from "@/lib/calendar/google-calendar-link";
import type { TribeEventOccurrenceResult } from "@/src/modules/events/application/results/tribe-event-result";
import { isOccurrenceMoved } from "@/lib/events/tribe-event-occurrence-exception-copy";
import { TRIBE_EVENT_DEFAULT_DURATION_MINUTES } from "@/src/modules/events/constants/tribe-events";

/**
 * Google Calendar "add event" link for an occurrence, shared by the agenda
 * rows and the detail dialog. Series include their RRULE so Google adds the
 * whole series; the meeting link travels as the location.
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
  return buildGoogleCalendarEventUrl({
    defaultDurationMinutes: TRIBE_EVENT_DEFAULT_DURATION_MINUTES,
    description: occurrence.description,
    endsAt: occurrence.endsAt,
    location: occurrence.meetingUrl,
    recurrenceRule: isOccurrenceMoved(occurrence) ? null : occurrence.recurrenceRule,
    startsAt: occurrence.startsAt,
    title: occurrence.title,
  });
}
