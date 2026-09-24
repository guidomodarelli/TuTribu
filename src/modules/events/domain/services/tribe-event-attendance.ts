import {
  TRIBE_EVENT_ATTENDANCE_STATUS,
  TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND,
} from "@/src/modules/events/constants/tribe-events";
import type {
  TribeEventOccurrenceException,
  TribeEventSchedule,
} from "@/src/modules/events/domain/entities/tribe-event";
import { resolveTribeEventOccurrenceByOriginalStart } from "@/src/modules/events/domain/services/tribe-event-occurrence-exceptions";
import {
  getTribeEventOccurrenceEndTime,
  hasTribeEventOccurrenceEnded,
  type TribeEventOccurrenceTimes,
} from "@/src/modules/events/domain/services/tribe-event-occurrence-timing";

/**
 * Attendance rules shared by the use cases and the UI: free seats of an
 * occurrence, the most recent finished occurrences, the viewer streak, and
 * which waitlists a capacity edit may refill.
 */

export type TribeEventAttendanceStreakRule = {
  minimumAttended: number;
  windowSize: number;
};

export type TribeEventAttendanceStreak = {
  attendedCount: number;
  occurrenceCount: number;
};

type OccurrenceWithViewerStatus = TribeEventOccurrenceTimes & {
  viewerStatus: string | null;
};

/**
 * Free seats of an occurrence.
 *
 * @param capacity - Capacity of the series, null when unlimited.
 * @param goingCount - People currently going.
 * @returns The remaining seats (never negative, since lowering the capacity
 * never removes anyone), or null when the series has no capacity.
 */
export function getTribeEventRemainingSpots(
  capacity: number | null,
  goingCount: number
): number | null {
  if (capacity === null) {
    return null;
  }

  return Math.max(capacity - goingCount, 0);
}

/**
 * Latest occurrences that already finished at `nowTime`.
 *
 * @param occurrences - Occurrences in any order.
 * @param nowTime - Current time (epoch ms).
 * @param limit - How many finished occurrences to keep.
 * @returns Up to `limit` finished occurrences, oldest first.
 */
export function selectRecentPastOccurrences<TOccurrence extends TribeEventOccurrenceTimes>(
  occurrences: TOccurrence[],
  nowTime: number,
  limit: number
): TOccurrence[] {
  return occurrences
    .filter((occurrence) => getTribeEventOccurrenceEndTime(occurrence) <= nowTime)
    .sort(
      (firstOccurrence, secondOccurrence) =>
        Date.parse(firstOccurrence.startsAt) - Date.parse(secondOccurrence.startsAt)
    )
    .slice(-limit);
}

/**
 * Viewer streak over the last finished occurrences of a tribe. Only "going"
 * counts as attended; waitlisted, maybe and not going do not.
 *
 * @param occurrences - Occurrences with the viewer answer, in any order.
 * @param nowTime - Current time (epoch ms).
 * @param rule - Window size and minimum attended to report a streak.
 * @returns The attended and considered counts, or null below the minimum.
 */
export function calculateTribeEventAttendanceStreak(
  occurrences: OccurrenceWithViewerStatus[],
  nowTime: number,
  rule: TribeEventAttendanceStreakRule
): TribeEventAttendanceStreak | null {
  const recentOccurrences = selectRecentPastOccurrences(
    occurrences,
    nowTime,
    rule.windowSize
  );
  const attendedCount = recentOccurrences.filter(
    (occurrence) => occurrence.viewerStatus === TRIBE_EVENT_ATTENDANCE_STATUS.going
  ).length;

  if (attendedCount < rule.minimumAttended) {
    return null;
  }

  return { attendedCount, occurrenceCount: recentOccurrences.length };
}

/**
 * Earliest occurrence start that can still be in progress at `nowTime`: one
 * occurrence duration (explicit, or the implicit one without `endsAt`) before
 * now. Used to bound the candidate read of a waitlist refill.
 *
 * @param schedule - Updated schedule of the series.
 * @param nowTime - Current time (epoch ms).
 * @returns The lower bound as an ISO 8601 instant.
 */
export function getWaitlistRefillLookbackStart(
  schedule: TribeEventSchedule,
  nowTime: number
): string {
  const durationMs =
    getTribeEventOccurrenceEndTime(schedule) - Date.parse(schedule.startsAt);

  return new Date(nowTime - durationMs).toISOString();
}

/**
 * Waitlisted occurrence starts that a capacity edit may refill: exact slots
 * of the UPDATED schedule that have not ended at `nowTime` (occurrences in
 * progress included). Starts of dates removed by a schedule edit are dropped,
 * so their rows stay as history and are never promoted.
 *
 * Exceptions follow the stable key `eventId@originalStartsAt`: attendance
 * rows keep the original start, so a moved date is refilled under its
 * original start but "ended" is decided with its effective (moved) times; a
 * cancelled date takes no answers, so it is never refilled.
 *
 * @param schedule - Updated schedule of the series.
 * @param candidateStarts - Original starts that currently have a waitlist.
 * @param nowTime - Current time (epoch ms).
 * @param exceptions - Exceptions of the series (moved or cancelled dates).
 * @returns Canonical ISO original starts that may be refilled, in input order.
 */
export function selectRefillableWaitlistOccurrenceStarts(
  schedule: TribeEventSchedule,
  candidateStarts: string[],
  nowTime: number,
  exceptions: readonly TribeEventOccurrenceException[] = []
): string[] {
  return candidateStarts.flatMap((candidateStart) => {
    const occurrence = resolveTribeEventOccurrenceByOriginalStart(
      schedule,
      exceptions,
      candidateStart
    );

    if (
      !occurrence ||
      occurrence.exception?.kind === TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND.cancelled ||
      hasTribeEventOccurrenceEnded(occurrence, nowTime)
    ) {
      return [];
    }

    return [occurrence.originalStartsAt];
  });
}
