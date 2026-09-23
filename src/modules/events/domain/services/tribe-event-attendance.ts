import { TRIBE_EVENT_ATTENDANCE_STATUS } from "@/src/modules/events/constants/tribe-events";
import {
  getTribeEventOccurrenceEndTime,
  type TribeEventOccurrenceTimes,
} from "@/src/modules/events/domain/services/tribe-event-occurrence-timing";

/**
 * Attendance rules shared by the use cases and the UI: free seats of an
 * occurrence, the most recent finished occurrences, and the viewer streak.
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
