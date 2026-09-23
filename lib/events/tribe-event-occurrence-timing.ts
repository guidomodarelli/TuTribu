import type { TribeEventOccurrenceResult } from "@/src/modules/events/application/results/tribe-event-result";

/**
 * End instant (epoch ms) of an occurrence.
 */
export function getOccurrenceEndTime(
  occurrence: Pick<TribeEventOccurrenceResult, "endsAt" | "startsAt">
): number {
  return Date.parse(occurrence.endsAt ?? occurrence.startsAt);
}

/**
 * Whether the occurrence already finished at `nowTime` (epoch ms).
 */
export function isOccurrencePast(
  occurrence: Pick<TribeEventOccurrenceResult, "endsAt" | "startsAt">,
  nowTime: number
): boolean {
  return getOccurrenceEndTime(occurrence) < nowTime;
}
