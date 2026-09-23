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

/**
 * Parts of an occurrence key (`eventId@startsAt`).
 */
export type TribeEventOccurrenceKeyParts = {
  eventId: string;
  occurrenceStartsAt: string;
};

/**
 * Splits an occurrence key received from outside (for example the `event`
 * query parameter of a deep link). The start must be the canonical ISO form
 * produced by {@link buildTribeEventOccurrenceKey}; anything else is rejected
 * so the key can only ever match a real occurrence.
 *
 * @param occurrenceKey - Untrusted key value.
 * @returns The event id and start instant, or null when malformed.
 */
export function parseTribeEventOccurrenceKey(
  occurrenceKey: string
): TribeEventOccurrenceKeyParts | null {
  const [eventId, occurrenceStartsAt, ...extraParts] = occurrenceKey.split(
    OCCURRENCE_KEY_SEPARATOR
  );

  if (!eventId || !occurrenceStartsAt || extraParts.length > 0) {
    return null;
  }

  const startTime = Date.parse(occurrenceStartsAt);

  if (Number.isNaN(startTime) || new Date(startTime).toISOString() !== occurrenceStartsAt) {
    return null;
  }

  return { eventId, occurrenceStartsAt };
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
