import type { GetTribeEventAttendanceStreakQuery } from "@/src/modules/events/application/commands/tribe-event-command";
import type {
  TribeEventAttendanceStreakResult,
  TribeEventAttendanceStreakSnapshotResult,
} from "@/src/modules/events/application/results/tribe-event-result";
import { buildTribeEventOccurrenceKey } from "@/src/modules/events/application/services/tribe-event-occurrences";
import {
  createPastTribeEventRange,
  createUpcomingTribeEventRange,
} from "@/src/modules/events/application/services/tribe-event-time-ranges";
import {
  TRIBE_EVENT_ATTENDANCE_STREAK,
  TRIBE_EVENT_RANGE_MATCH,
} from "@/src/modules/events/constants/tribe-events";
import type {
  TribeEvent,
  TribeEventDateRange,
} from "@/src/modules/events/domain/entities/tribe-event";
import type {
  TribeEventRepository,
  TribeEventViewerAttendanceHistory,
} from "@/src/modules/events/domain/repositories/tribe-event-repository";
import { calculateTribeEventAttendanceStreak } from "@/src/modules/events/domain/services/tribe-event-attendance";
import { getTribeEventOccurrenceEndTime } from "@/src/modules/events/domain/services/tribe-event-occurrence-timing";
import { expandTribeEventOccurrences } from "@/src/modules/events/domain/services/tribe-event-recurrence";

type GetTribeEventAttendanceStreakSnapshotDependencies = {
  tribeEventRepository: TribeEventRepository;
};

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
  const occurrences = snapshot.events.flatMap((event) =>
    expandTribeEventOccurrences(event, pastRange).map((occurrence) => ({
      ...occurrence,
      viewerStatus:
        viewerStatusByKey.get(buildTribeEventOccurrenceKey(event.id, occurrence.startsAt)) ??
        null,
    }))
  );

  return calculateTribeEventAttendanceStreak(occurrences, nowTime, {
    minimumAttended: TRIBE_EVENT_ATTENDANCE_STREAK.minimumAttended,
    windowSize: TRIBE_EVENT_ATTENDANCE_STREAK.windowSize,
  });
}

/**
 * Nearest effective end (explicit end, or the default duration) after the
 * reference instant of an occurrence that is still running or starts inside
 * the upcoming range. Occurrences match the range by interval overlap, so an
 * occurrence that started in an earlier month and is still running counts.
 */
function findNextOccurrenceEnd(
  events: TribeEvent[],
  upcomingRange: TribeEventDateRange,
  nowTime: number
): string | null {
  let nextEndTime: number | null = null;

  for (const event of events) {
    const occurrences = expandTribeEventOccurrences(
      event,
      upcomingRange,
      TRIBE_EVENT_RANGE_MATCH.overlaps
    );

    for (const occurrence of occurrences) {
      const endTime = getTribeEventOccurrenceEndTime(occurrence);

      if (endTime > nowTime && (nextEndTime === null || endTime < nextEndTime)) {
        nextEndTime = endTime;
      }
    }
  }

  return nextEndTime === null ? null : new Date(nextEndTime).toISOString();
}

/**
 * Viewer attendance streak plus the next instant at which it can change, for
 * the events page, the lightweight streak read, and the series mutation
 * responses.
 *
 * Both values come from one repository read, which the adapter answers from a
 * single database snapshot, and from the same reference instant `query.now`.
 * Reading them separately let a series another manager created or rescheduled
 * between the two reads show up in one value and not in the other, pairing a
 * streak with a deadline of a different schedule. The streak itself is
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
    const nowTime = query.now.getTime();
    const pastRange = createPastTribeEventRange(
      nowTime,
      TRIBE_EVENT_ATTENDANCE_STREAK.lookbackDays
    );
    const upcomingRange = createUpcomingTribeEventRange(nowTime);
    const snapshot = await tribeEventRepository.readViewerAttendanceStreakSnapshot({
      eventRange: {
        rangeEnd: upcomingRange.rangeEnd,
        rangeStart: pastRange.rangeStart,
      },
      tribeSlug: query.tribeSlug.trim(),
      viewerAttendanceRange: pastRange,
    });

    return {
      attendanceStreak: calculateViewerAttendanceStreak(snapshot, pastRange, nowTime),
      nextRefreshAt: findNextOccurrenceEnd(snapshot.events, upcomingRange, nowTime),
    };
  };
}
