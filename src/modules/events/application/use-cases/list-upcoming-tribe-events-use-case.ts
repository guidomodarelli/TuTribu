import type {
  GetTribeEventAttendanceStreakQuery,
  ListUpcomingTribeEventsQuery,
} from "@/src/modules/events/application/commands/tribe-event-command";
import type {
  TribeEventOccurrenceResult,
  TribeEventUpcomingListResult,
} from "@/src/modules/events/application/results/tribe-event-result";
import { buildTribeEventOccurrences } from "@/src/modules/events/application/services/tribe-event-occurrences";
import {
  TRIBE_EVENT_RANGE_MATCH,
  TRIBE_EVENT_UPCOMING,
} from "@/src/modules/events/constants/tribe-events";
import type { TribeEventRepository } from "@/src/modules/events/domain/repositories/tribe-event-repository";
import { getTribeEventOccurrenceEndTime } from "@/src/modules/events/domain/services/tribe-event-occurrence-timing";

type ListUpcomingTribeEventsDependencies = {
  tribeEventRepository: TribeEventRepository;
};

const MILLISECONDS_PER_DAY = 86_400_000;

/**
 * Occurrences of the tribe that are still running or start inside the
 * upcoming window, across every series, sorted by start. The range starts at
 * `nowTime` and occurrences are matched by interval overlap, so an occurrence
 * that is still running (its explicit end, or the default duration when it
 * has none, is ahead) is included no matter how long ago it started.
 */
async function listRunningAndUpcomingOccurrences(
  tribeEventRepository: TribeEventRepository,
  tribeSlug: string,
  nowTime: number
): Promise<TribeEventOccurrenceResult[]> {
  const range = {
    rangeEnd: new Date(
      nowTime + TRIBE_EVENT_UPCOMING.windowDays * MILLISECONDS_PER_DAY
    ).toISOString(),
    rangeStart: new Date(nowTime).toISOString(),
  };
  const listing = await tribeEventRepository.listByTribeRange({
    ...range,
    tribeSlug: tribeSlug.trim(),
  });

  return buildTribeEventOccurrences(
    listing.events,
    listing.attendances,
    range,
    TRIBE_EVENT_RANGE_MATCH.overlaps
  );
}

/**
 * Next few occurrences of the tribe, across every series, for the tribe home.
 * Finished occurrences drop out; running ones stay listed (see
 * {@link listRunningAndUpcomingOccurrences}).
 */
export function listUpcomingTribeEvents({
  tribeEventRepository,
}: ListUpcomingTribeEventsDependencies) {
  return async (
    query: ListUpcomingTribeEventsQuery
  ): Promise<TribeEventUpcomingListResult> => {
    const limit = query.limit ?? TRIBE_EVENT_UPCOMING.defaultLimit;
    const occurrences = await listRunningAndUpcomingOccurrences(
      tribeEventRepository,
      query.tribeSlug,
      Date.now()
    );

    return {
      events: occurrences.slice(0, limit),
    };
  };
}

/**
 * Next instant at which the viewer attendance streak can change: the nearest
 * effective end (explicit end, or the default duration) of an occurrence of
 * the tribe that is still running or starts inside the upcoming window. The
 * events calendar only watches the occurrences of the visible month, which
 * match by start, so an occurrence that started in an earlier month and is
 * still running when the page loads would never trigger a refresh without
 * this instant. It reuses the overlap listing of the upcoming occurrences and
 * does not change how the streak itself is computed. It starts from the
 * reference instant `query.now`, the same one the streak read receives, so
 * the deadline is always the end of the next occurrence that streak has not
 * counted yet.
 *
 * @returns ISO 8601 instant, or null when nothing ends inside the window.
 */
export function getTribeEventAttendanceStreakNextRefreshAt({
  tribeEventRepository,
}: ListUpcomingTribeEventsDependencies) {
  return async (query: GetTribeEventAttendanceStreakQuery): Promise<string | null> => {
    const nowTime = query.now.getTime();
    const occurrences = await listRunningAndUpcomingOccurrences(
      tribeEventRepository,
      query.tribeSlug,
      nowTime
    );
    let nextEndTime: number | null = null;

    for (const occurrence of occurrences) {
      const endTime = getTribeEventOccurrenceEndTime(occurrence);

      if (endTime > nowTime && (nextEndTime === null || endTime < nextEndTime)) {
        nextEndTime = endTime;
      }
    }

    return nextEndTime === null ? null : new Date(nextEndTime).toISOString();
  };
}
