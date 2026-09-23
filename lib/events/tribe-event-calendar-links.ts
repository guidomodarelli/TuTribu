import { buildGoogleCalendarEventUrl } from "@/lib/calendar/google-calendar-link";
import type { TribeEventOccurrenceResult } from "@/src/modules/events/application/results/tribe-event-result";
import { TRIBE_EVENT_DEFAULT_DURATION_MINUTES } from "@/src/modules/events/constants/tribe-events";

/**
 * Google Calendar "add event" link for an occurrence, shared by the agenda
 * rows and the detail dialog. Series include their RRULE so Google adds the
 * whole series; the meeting link travels as the location.
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
    recurrenceRule: occurrence.recurrenceRule,
    startsAt: occurrence.startsAt,
    title: occurrence.title,
  });
}
