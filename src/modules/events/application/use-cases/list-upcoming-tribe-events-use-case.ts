import type { ListUpcomingTribeEventsQuery } from "@/src/modules/events/application/commands/tribe-event-command";
import type { TribeEventUpcomingListResult } from "@/src/modules/events/application/results/tribe-event-result";
import { buildTribeEventOccurrences } from "@/src/modules/events/application/services/tribe-event-occurrences";
import { TRIBE_EVENT_UPCOMING } from "@/src/modules/events/constants/tribe-events";
import type { TribeEventRepository } from "@/src/modules/events/domain/repositories/tribe-event-repository";
import { getTribeEventOccurrenceEndTime } from "@/src/modules/events/domain/services/tribe-event-occurrence-timing";

type ListUpcomingTribeEventsDependencies = {
  tribeEventRepository: TribeEventRepository;
};

const MILLISECONDS_PER_HOUR = 3_600_000;
const HOURS_PER_DAY = 24;
/**
 * Occurrences that started shortly before "now" are still relevant while they
 * run, so the query window starts a little in the past and the end time
 * decides whether the slot is still worth showing.
 */
const IN_PROGRESS_LOOKBACK_HOURS = 6;

/**
 * Next few occurrences of the tribe, across every series, for the tribe home.
 */
export function listUpcomingTribeEvents({
  tribeEventRepository,
}: ListUpcomingTribeEventsDependencies) {
  return async (
    query: ListUpcomingTribeEventsQuery
  ): Promise<TribeEventUpcomingListResult> => {
    const now = Date.now();
    const limit = query.limit ?? TRIBE_EVENT_UPCOMING.defaultLimit;
    const range = {
      rangeEnd: new Date(
        now +
          TRIBE_EVENT_UPCOMING.windowDays * HOURS_PER_DAY * MILLISECONDS_PER_HOUR
      ).toISOString(),
      rangeStart: new Date(
        now - IN_PROGRESS_LOOKBACK_HOURS * MILLISECONDS_PER_HOUR
      ).toISOString(),
    };
    const listing = await tribeEventRepository.listByTribeRange({
      ...range,
      tribeSlug: query.tribeSlug.trim(),
    });
    const occurrences = buildTribeEventOccurrences(
      listing.events,
      listing.attendances,
      range
    ).filter((occurrence) => getTribeEventOccurrenceEndTime(occurrence) > now);

    return {
      events: occurrences.slice(0, limit),
    };
  };
}
