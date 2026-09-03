import type {
  TribeEventOccurrenceResult,
  TribeEventResult,
} from "@/src/modules/events/application/results/tribe-event-result";
import type {
  TribeEvent,
  TribeEventDateRange,
} from "@/src/modules/events/domain/entities/tribe-event";
import type { TribeEventOccurrenceAttendance } from "@/src/modules/events/domain/repositories/tribe-event-repository";
import {
  buildTribeEventRecurrenceRule,
  expandTribeEventOccurrences,
} from "@/src/modules/events/domain/services/tribe-event-recurrence";

const OCCURRENCE_KEY_SEPARATOR = "@";
const EMPTY_ATTENDANCE = {
  goingCount: 0,
  viewerStatus: null,
} as const;

export function buildTribeEventOccurrenceKey(
  eventId: string,
  occurrenceStartsAt: string
): string {
  return eventId + OCCURRENCE_KEY_SEPARATOR + occurrenceStartsAt;
}

export function toTribeEventResult(event: TribeEvent): TribeEventResult {
  return {
    ...event,
    recurrenceRule: buildTribeEventRecurrenceRule(event),
  };
}

function sortByStart(
  firstOccurrence: TribeEventOccurrenceResult,
  secondOccurrence: TribeEventOccurrenceResult
): number {
  return (
    firstOccurrence.startsAt.localeCompare(secondOccurrence.startsAt) ||
    firstOccurrence.title.localeCompare(secondOccurrence.title)
  );
}

/**
 * Expands every event into its occurrences inside the range, attaching the
 * attendance summary that belongs to each slot, sorted by start time.
 */
export function buildTribeEventOccurrences(
  events: TribeEvent[],
  attendances: TribeEventOccurrenceAttendance[],
  range: TribeEventDateRange
): TribeEventOccurrenceResult[] {
  const attendanceByKey = new Map(
    attendances.map((attendance) => [
      buildTribeEventOccurrenceKey(
        attendance.eventId,
        new Date(attendance.occurrenceStartsAt).toISOString()
      ),
      { goingCount: attendance.goingCount, viewerStatus: attendance.viewerStatus },
    ])
  );

  return events
    .flatMap((event) => {
      const eventResult = toTribeEventResult(event);

      return expandTribeEventOccurrences(event, range).map((occurrence) => {
        const occurrenceKey = buildTribeEventOccurrenceKey(
          event.id,
          occurrence.startsAt
        );

        return {
          attendance: attendanceByKey.get(occurrenceKey) ?? EMPTY_ATTENDANCE,
          description: eventResult.description,
          endsAt: occurrence.endsAt,
          eventId: eventResult.id,
          meetingUrl: eventResult.meetingUrl,
          occurrenceKey,
          recurrenceFrequency: eventResult.recurrenceFrequency,
          recurrenceRule: eventResult.recurrenceRule,
          recurrenceUntil: eventResult.recurrenceUntil,
          seriesEndsAt: eventResult.endsAt,
          seriesStartsAt: eventResult.startsAt,
          startsAt: occurrence.startsAt,
          title: eventResult.title,
        };
      });
    })
    .sort(sortByStart);
}
