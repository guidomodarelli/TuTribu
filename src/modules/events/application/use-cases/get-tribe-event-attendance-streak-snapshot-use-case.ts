import type { GetTribeEventAttendanceStreakQuery } from "@/src/modules/events/application/commands/tribe-event-command";
import type {
  TribeEventAttendanceStreakResult,
  TribeEventAttendanceStreakSnapshotResult,
} from "@/src/modules/events/application/results/tribe-event-result";
import {
  buildTribeEventOccurrenceKey,
  groupTribeEventExceptionsByEvent,
} from "@/src/modules/events/application/services/tribe-event-occurrences";
import {
  createPastTribeEventRange,
  createUpcomingTribeEventRange,
} from "@/src/modules/events/application/services/tribe-event-time-ranges";
import {
  TRIBE_EVENT_ATTENDANCE_STREAK,
  TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND,
  TRIBE_EVENT_RANGE_MATCH,
} from "@/src/modules/events/constants/tribe-events";
import type { TribeEventDateRange } from "@/src/modules/events/domain/entities/tribe-event";
import type {
  TribeEventRepository,
  TribeEventViewerAttendanceHistory,
} from "@/src/modules/events/domain/repositories/tribe-event-repository";
import { calculateTribeEventAttendanceStreak } from "@/src/modules/events/domain/services/tribe-event-attendance";
import {
  expandTribeEventOccurrencesWithExceptions,
  type TribeEventResolvedOccurrence,
} from "@/src/modules/events/domain/services/tribe-event-occurrence-exceptions";
import { getTribeEventOccurrenceEndTime } from "@/src/modules/events/domain/services/tribe-event-occurrence-timing";

type GetTribeEventAttendanceStreakSnapshotDependencies = {
  tribeEventRepository: TribeEventRepository;
};

/**
 * Occurrences of every series of the snapshot inside `range`, with the
 * exceptions read by the same statement applied: a moved date is placed (and
 * ends) at its new time and keeps its original start as attendance key; a
 * cancelled date never took place, so it counts neither for the streak nor
 * for the next refresh instant.
 */
function listHeldOccurrences(
  snapshot: TribeEventViewerAttendanceHistory,
  range: TribeEventDateRange,
  rangeMatch?: (typeof TRIBE_EVENT_RANGE_MATCH)[keyof typeof TRIBE_EVENT_RANGE_MATCH]
): Array<TribeEventResolvedOccurrence & { eventId: string }> {
  const exceptionsByEvent = groupTribeEventExceptionsByEvent(snapshot.exceptions);

  return snapshot.events.flatMap((event) =>
    expandTribeEventOccurrencesWithExceptions(
      event,
      exceptionsByEvent.get(event.id) ?? [],
      range,
      rangeMatch
    )
      .filter(
        (occurrence) =>
          occurrence.exception?.kind !== TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND.cancelled
      )
      .map((occurrence) => ({ ...occurrence, eventId: event.id }))
  );
}

/**
 * Streak over the last finished occurrences of the tribe, across every
 * series, inside the past range ending at the reference instant. The snapshot
 * may carry series that only have upcoming occurrences; the expansion over
 * the past range simply yields nothing for them.
 */
function calculateViewerAttendanceStreak(
  snapshot: TribeEventViewerAttendanceHistory,
  pastRange: TribeEventDateRange,
  nowTime: number
): TribeEventAttendanceStreakResult | null {
  const viewerStatusByKey = new Map(
    snapshot.viewerAttendances.map((attendance) => [
      buildTribeEventOccurrenceKey(
        attendance.eventId,
        new Date(attendance.occurrenceStartsAt).toISOString()
      ),
      attendance.status,
    ])
  );
  const occurrences = listHeldOccurrences(snapshot, pastRange).map((occurrence) => ({
    ...occurrence,
    viewerStatus:
      viewerStatusByKey.get(
        buildTribeEventOccurrenceKey(occurrence.eventId, occurrence.originalStartsAt)
      ) ?? null,
  }));

  return calculateTribeEventAttendanceStreak(occurrences, nowTime, {
    minimumAttended: TRIBE_EVENT_ATTENDANCE_STREAK.minimumAttended,
    windowSize: TRIBE_EVENT_ATTENDANCE_STREAK.windowSize,
  });
}

/**
 * Nearest effective end (explicit end, or the default duration; the new end
 * of a moved date) after the reference instant of an occurrence that is still
 * running or starts inside the upcoming range. Occurrences match the range by
 * interval overlap, so an occurrence that started in an earlier month and is
 * still running counts. Cancelled dates are skipped.
 */
function findNextOccurrenceEnd(
  snapshot: TribeEventViewerAttendanceHistory,
  upcomingRange: TribeEventDateRange,
  nowTime: number
): string | null {
  let nextEndTime: number | null = null;

  for (const occurrence of listHeldOccurrences(
    snapshot,
    upcomingRange,
    TRIBE_EVENT_RANGE_MATCH.overlaps
  )) {
    const endTime = getTribeEventOccurrenceEndTime(occurrence);

    if (endTime > nowTime && (nextEndTime === null || endTime < nextEndTime)) {
      nextEndTime = endTime;
    }
  }

  return nextEndTime === null ? null : new Date(nextEndTime).toISOString();
}

/**
 * Read ranges sized from the application instant and widened by the clock
 * margin on both sides, so they cover the past and upcoming ranges of any
 * database instant within that margin.
 */
function createSnapshotReadRanges(applicationTime: number) {
  const marginMs = TRIBE_EVENT_ATTENDANCE_STREAK.readRangeClockMarginMs;
  const earliestPastRange = createPastTribeEventRange(
    applicationTime - marginMs,
    TRIBE_EVENT_ATTENDANCE_STREAK.lookbackDays
  );
  const latestUpcomingRange = createUpcomingTribeEventRange(applicationTime + marginMs);

  return {
    eventRange: {
      rangeEnd: latestUpcomingRange.rangeEnd,
      rangeStart: earliestPastRange.rangeStart,
    },
    viewerAttendanceRange: {
      rangeEnd: latestUpcomingRange.rangeStart,
      rangeStart: earliestPastRange.rangeStart,
    },
  };
}

/**
 * Parses the database reference instant and checks that the widened read
 * ranges cover it; otherwise the streak would be computed without some of
 * the series or answers it needs.
 */
function readDatabaseReferenceTime(
  snapshot: TribeEventViewerAttendanceHistory,
  applicationTime: number,
  tribeSlug: string
): number {
  const referenceTime = Date.parse(snapshot.referenceTime);
  const clockSkewMs = referenceTime - applicationTime;

  if (
    Number.isNaN(referenceTime) ||
    Math.abs(clockSkewMs) > TRIBE_EVENT_ATTENDANCE_STREAK.readRangeClockMarginMs
  ) {
    throw new Error(
      `getTribeEventAttendanceStreakSnapshot: database reference time is outside the read margin for tribe "${tribeSlug}" (clockSkewMs: ${clockSkewMs})`
    );
  }

  return referenceTime;
}

/**
 * Viewer attendance streak plus the next instant at which it can change, for
 * the events page, the lightweight streak read, and the series mutation
 * responses.
 *
 * Both values come from one repository read, which the adapter answers from a
 * single database snapshot, and from the same reference instant: the
 * DATABASE instant of that read (`computedAt`), not the application clock.
 * Attendance writes refuse ended occurrences with the database clock, so a
 * host clock running ahead would count an occurrence in the streak (and drop
 * its end from `nextRefreshAt`) while PostgreSQL still accepts answers for
 * it. `query.now` only sizes the read ranges, widened by
 * `TRIBE_EVENT_ATTENDANCE_STREAK.readRangeClockMarginMs`. Reading the values
 * separately let a series another manager created or rescheduled between the
 * two reads show up in one value and not in the other. The streak itself is
 * computed exactly as before: the last finished occurrences inside
 * `TRIBE_EVENT_ATTENDANCE_STREAK.lookbackDays`.
 *
 * The events calendar only watches the occurrences of the visible month, so
 * `nextRefreshAt` also covers an occurrence that started earlier and is still
 * running, which would otherwise never refresh the streak on screen.
 */
export function getTribeEventAttendanceStreakSnapshot({
  tribeEventRepository,
}: GetTribeEventAttendanceStreakSnapshotDependencies) {
  return async (
    query: GetTribeEventAttendanceStreakQuery
  ): Promise<TribeEventAttendanceStreakSnapshotResult> => {
    const applicationTime = query.now.getTime();
    const tribeSlug = query.tribeSlug.trim();
    const snapshot = await tribeEventRepository.readViewerAttendanceStreakSnapshot({
      ...createSnapshotReadRanges(applicationTime),
      tribeSlug,
    });
    const referenceTime = readDatabaseReferenceTime(snapshot, applicationTime, tribeSlug);
    const pastRange = createPastTribeEventRange(
      referenceTime,
      TRIBE_EVENT_ATTENDANCE_STREAK.lookbackDays
    );
    const upcomingRange = createUpcomingTribeEventRange(referenceTime);

    return {
      attendanceStreak: calculateViewerAttendanceStreak(snapshot, pastRange, referenceTime),
      computedAt: new Date(referenceTime).toISOString(),
      nextRefreshAt: findNextOccurrenceEnd(snapshot, upcomingRange, referenceTime),
    };
  };
}
