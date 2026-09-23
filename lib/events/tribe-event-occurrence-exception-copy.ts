import {
  formatBuenosAiresWeekdayDay,
  getBuenosAiresMonthKey,
} from "@/lib/date-time/buenos-aires-format";
import type { TribeEventOccurrenceResult } from "@/src/modules/events/application/results/tribe-event-result";
import { TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND } from "@/src/modules/events/constants/tribe-events";

/**
 * Presentation helpers of cancelled and moved dates, shared by the month
 * grid, the agenda rows, and the detail dialog.
 */

const COPY = {
  cancelledBadge: "Cancelado",
  movedBadge: "Movido",
  movedFromPrefix: "Movido desde el ",
} as const;

export const TRIBE_EVENT_OCCURRENCE_EXCEPTION_COPY = COPY;

type OccurrenceExceptionFacts = Pick<TribeEventOccurrenceResult, "exception">;

/**
 * Whether the date was cancelled (shown struck through, no answers).
 */
export function isOccurrenceCancelled(occurrence: OccurrenceExceptionFacts): boolean {
  return occurrence.exception?.kind === TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND.cancelled;
}

/**
 * Whether the date was moved away from its original slot.
 */
export function isOccurrenceMoved(occurrence: OccurrenceExceptionFacts): boolean {
  return occurrence.exception?.kind === TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND.moved;
}

/**
 * "Movido desde el jueves 12" for a moved date (adding the month when the
 * original slot was in another month), or null for any other occurrence.
 *
 * @param occurrence - Occurrence with its original and effective start.
 * @returns The note or null.
 */
export function formatMovedFromLabel(
  occurrence: Pick<TribeEventOccurrenceResult, "exception" | "originalStartsAt" | "startsAt">
): string | null {
  if (!isOccurrenceMoved(occurrence)) {
    return null;
  }

  const isOtherMonth =
    getBuenosAiresMonthKey(occurrence.originalStartsAt) !==
    getBuenosAiresMonthKey(occurrence.startsAt);

  return COPY.movedFromPrefix + formatBuenosAiresWeekdayDay(occurrence.originalStartsAt, isOtherMonth);
}
