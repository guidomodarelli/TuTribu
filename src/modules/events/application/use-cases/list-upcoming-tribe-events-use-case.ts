import type { ListUpcomingTribeEventsQuery } from "@/src/modules/events/application/commands/tribe-event-command";
import type {
  TribeEventOccurrenceResult,
  TribeEventUpcomingListResult,
} from "@/src/modules/events/application/results/tribe-event-result";
import { buildTribeEventOccurrences } from "@/src/modules/events/application/services/tribe-event-occurrences";
import { createUpcomingTribeEventRange } from "@/src/modules/events/application/services/tribe-event-time-ranges";
import {
  TRIBE_EVENT_RANGE_MATCH,
  TRIBE_EVENT_UPCOMING,
} from "@/src/modules/events/constants/tribe-events";
import type { TribeEventRepository } from "@/src/modules/events/domain/repositories/tribe-event-repository";

type ListUpcomingTribeEventsDependencies = {
  tribeEventRepository: TribeEventRepository;
};

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
  const range = createUpcomingTribeEventRange(nowTime);
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
