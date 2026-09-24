import { TRIBE_EVENT_DEFAULT_DURATION_MINUTES } from "@/src/modules/events/constants/tribe-events";

const MILLISECONDS_PER_MINUTE = 60_000;

/**
 * Start and optional end of one occurrence, as ISO 8601 instants.
 */
export type TribeEventOccurrenceTimes = {
  endsAt: string | null;
  startsAt: string;
};

/**
 * End instant (epoch ms) of an occurrence. An occurrence without an explicit
 * end lasts {@link TRIBE_EVENT_DEFAULT_DURATION_MINUTES}, the same duration
 * calendar exports assume, so "finished" and "in progress" agree everywhere.
 *
 * @param occurrence - Start and optional end of the occurrence.
 * @returns The end time in milliseconds since the epoch.
 */
export function getTribeEventOccurrenceEndTime(occurrence: TribeEventOccurrenceTimes): number {
  if (occurrence.endsAt) {
    return Date.parse(occurrence.endsAt);
  }

  return (
    Date.parse(occurrence.startsAt) +
    TRIBE_EVENT_DEFAULT_DURATION_MINUTES * MILLISECONDS_PER_MINUTE
  );
}

/**
 * Tells whether an occurrence already finished at `nowTime`. The effective end
 * comes from {@link getTribeEventOccurrenceEndTime}, so an occurrence is
 * finished from that instant onwards and still open while it is in progress.
 *
 * @param occurrence - Start and optional end of the occurrence.
 * @param nowTime - Current time (epoch ms).
 * @returns True once the occurrence ended.
 */
export function hasTribeEventOccurrenceEnded(
  occurrence: TribeEventOccurrenceTimes,
  nowTime: number
): boolean {
  return getTribeEventOccurrenceEndTime(occurrence) <= nowTime;
}
