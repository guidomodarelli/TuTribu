import type { ListUpcomingTribeEventsQuery } from "@/src/modules/events/application/commands/tribe-event-command";
import type { TribeEventUpcomingListResult } from "@/src/modules/events/application/results/tribe-event-result";
import { buildTribeEventOccurrences } from "@/src/modules/events/application/services/tribe-event-occurrences";
import {
  TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND,
  TRIBE_EVENT_RANGE_MATCH,
  TRIBE_EVENT_UPCOMING,
} from "@/src/modules/events/constants/tribe-events";
import type { TribeEventRepository } from "@/src/modules/events/domain/repositories/tribe-event-repository";

type ListUpcomingTribeEventsDependencies = {
  tribeEventRepository: TribeEventRepository;
};

const MILLISECONDS_PER_DAY = 86_400_000;

/**
 * Next few occurrences of the tribe, across every series, for the tribe home.
 * The range starts at "now" and occurrences are matched by interval overlap,
 * so an occurrence that is still running (its explicit end, or the default
 * duration when it has none, is ahead) stays listed no matter how long ago it
 * started, and finished ones drop out.
 * Cancelled dates are left out (the calendar still shows them struck
 * through); moved dates appear at their new time.
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
        now + TRIBE_EVENT_UPCOMING.windowDays * MILLISECONDS_PER_DAY
      ).toISOString(),
      rangeStart: new Date(now).toISOString(),
    };
    const listing = await tribeEventRepository.listByTribeRange({
      ...range,
      tribeSlug: query.tribeSlug.trim(),
    });
    const occurrences = buildTribeEventOccurrences(
      listing.events,
      listing.attendances,
      listing.exceptions,
      range,
      TRIBE_EVENT_RANGE_MATCH.overlaps
    ).filter(
      (occurrence) =>
        occurrence.exception?.kind !== TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND.cancelled
    );

    return {
      events: occurrences.slice(0, limit),
    };
  };
}
