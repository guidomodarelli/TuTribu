import type {
  TribeEventOccurrenceResult,
  TribeEventResult,
} from "@/src/modules/events/application/results/tribe-event-result";
import type {
  TribeEvent,
  TribeEventDateRange,
  TribeEventRangeMatch,
} from "@/src/modules/events/domain/entities/tribe-event";
import type {
  TribeEventAttendanceSummary,
  TribeEventOccurrenceAttendance,
} from "@/src/modules/events/domain/repositories/tribe-event-repository";
import {
  buildTribeEventRecurrenceRule,
  expandTribeEventOccurrences,
} from "@/src/modules/events/domain/services/tribe-event-recurrence";

const OCCURRENCE_KEY_SEPARATOR = "@";
/**
 * Summary of an occurrence nobody answered yet. A fresh object per call so no
 * two occurrences share the same preview array.
 */
export function createEmptyTribeEventAttendance(): TribeEventAttendanceSummary {
  return {
    goingCount: 0,
    goingPreview: [],
    maybeCount: 0,
    viewerStatus: null,
    viewerWaitlistPosition: null,
    waitlistedCount: 0,
  };
}

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
 *
 * @param events - Series returned for the range.
 * @param attendances - Attendance summaries per occurrence.
 * @param range - Queried range.
 * @param rangeMatch - How occurrences are matched against the range; see
 *   `expandTribeEventOccurrences`. Defaults to matching by start.
 * @returns Occurrence results sorted by start and title.
 */
export function buildTribeEventOccurrences(
  events: TribeEvent[],
  attendances: TribeEventOccurrenceAttendance[],
  range: TribeEventDateRange,
  rangeMatch?: TribeEventRangeMatch
): TribeEventOccurrenceResult[] {
  const attendanceByKey = new Map(
    attendances.map((attendance) => [
      buildTribeEventOccurrenceKey(
        attendance.eventId,
        new Date(attendance.occurrenceStartsAt).toISOString()
      ),
      {
        goingCount: attendance.goingCount,
        goingPreview: attendance.goingPreview,
        maybeCount: attendance.maybeCount,
        viewerStatus: attendance.viewerStatus,
        viewerWaitlistPosition: attendance.viewerWaitlistPosition,
        waitlistedCount: attendance.waitlistedCount,
      },
    ])
  );

  return events
    .flatMap((event) => {
      const eventResult = toTribeEventResult(event);

      return expandTribeEventOccurrences(event, range, rangeMatch).map((occurrence) => {
        const occurrenceKey = buildTribeEventOccurrenceKey(
          event.id,
          occurrence.startsAt
        );

        return {
          attendance: attendanceByKey.get(occurrenceKey) ?? createEmptyTribeEventAttendance(),
          capacity: eventResult.capacity,
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
