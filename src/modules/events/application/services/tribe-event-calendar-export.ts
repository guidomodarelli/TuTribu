import type { TribeEventCalendarResult } from "@/src/modules/events/application/results/tribe-event-result";
import { toTribeEventResult } from "@/src/modules/events/application/services/tribe-event-occurrences";
import type {
  TribeEvent,
  TribeEventOccurrenceException,
} from "@/src/modules/events/domain/entities/tribe-event";
import { resolveTribeEventOccurrenceException } from "@/src/modules/events/domain/services/tribe-event-occurrence-exceptions";

/**
 * Series plus its still-valid cancelled and moved dates, shared by the
 * single-event `.ics` download and the tribe calendar feed. Exceptions whose
 * original slot is no longer part of the series (the series was edited after
 * the date was changed) are left out, like in the calendar listing.
 *
 * @param event - Series to export.
 * @param exceptions - Stored exceptions of that series.
 * @returns The series result with its resolved exceptions.
 */
export function buildTribeEventCalendarResult(
  event: TribeEvent,
  exceptions: readonly TribeEventOccurrenceException[]
): TribeEventCalendarResult {
  return {
    event: toTribeEventResult(event),
    occurrenceExceptions: exceptions.flatMap((exception) => {
      const occurrence = resolveTribeEventOccurrenceException(event, exception);

      return occurrence?.exception ? [{ ...occurrence, exception: occurrence.exception }] : [];
    }),
  };
}
