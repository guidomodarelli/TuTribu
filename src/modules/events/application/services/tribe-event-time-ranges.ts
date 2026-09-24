import { TRIBE_EVENT_UPCOMING } from "@/src/modules/events/constants/tribe-events";
import type { TribeEventDateRange } from "@/src/modules/events/domain/entities/tribe-event";

const MILLISECONDS_PER_DAY = 86_400_000;

/**
 * Window `[now - lookbackDays, now)` used to look at finished occurrences.
 *
 * @param nowTime - Reference instant (epoch ms).
 * @param lookbackDays - How many days back the window reaches.
 * @returns The past range as ISO 8601 instants.
 */
export function createPastTribeEventRange(
  nowTime: number,
  lookbackDays: number
): TribeEventDateRange {
  return {
    rangeEnd: new Date(nowTime).toISOString(),
    rangeStart: new Date(nowTime - lookbackDays * MILLISECONDS_PER_DAY).toISOString(),
  };
}

/**
 * Window `[now, now + TRIBE_EVENT_UPCOMING.windowDays)` of the running and
 * upcoming occurrences (matched by overlap, so a running occurrence stays in).
 *
 * @param nowTime - Reference instant (epoch ms).
 * @returns The upcoming range as ISO 8601 instants.
 */
export function createUpcomingTribeEventRange(nowTime: number): TribeEventDateRange {
  return {
    rangeEnd: new Date(
      nowTime + TRIBE_EVENT_UPCOMING.windowDays * MILLISECONDS_PER_DAY
    ).toISOString(),
    rangeStart: new Date(nowTime).toISOString(),
  };
}
