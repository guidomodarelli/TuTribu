import { buildGoogleCalendarEventUrl } from "@/lib/calendar/google-calendar-link";
import type { TribeEventOccurrenceResult } from "@/src/modules/events/application/results/tribe-event-result";
import { TRIBE_EVENT_DEFAULT_DURATION_MINUTES } from "@/src/modules/events/constants/tribe-events";

/**
 * Google Calendar "add event" link for an occurrence, shared by the agenda
 * rows and the detail dialog. Series include their RRULE and are anchored at
 * the series start/end (not the clicked slot), so Google adds the whole
 * series including earlier slots; single events keep the occurrence times.
 * The meeting link travels as the location.
 *
 * @param occurrence - Occurrence to export.
 * @returns The Google Calendar URL.
 */
export function buildTribeEventGoogleCalendarUrl(
  occurrence: TribeEventOccurrenceResult
): string {
  const isRecurring = occurrence.recurrenceRule !== null;

  return buildGoogleCalendarEventUrl({
    defaultDurationMinutes: TRIBE_EVENT_DEFAULT_DURATION_MINUTES,
    description: occurrence.description,
    endsAt: isRecurring ? occurrence.seriesEndsAt : occurrence.endsAt,
    location: occurrence.meetingUrl,
    recurrenceRule: occurrence.recurrenceRule,
    startsAt: isRecurring ? occurrence.seriesStartsAt : occurrence.startsAt,
    title: occurrence.title,
  });
}
