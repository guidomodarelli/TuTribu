import { TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND } from "@/src/modules/events/constants/tribe-events";
import type {
  TribeEventDateRange,
  TribeEventOccurrenceException,
  TribeEventOccurrenceExceptionKind,
  TribeEventSchedule,
} from "@/src/modules/events/domain/entities/tribe-event";
import {
  expandTribeEventOccurrences,
  isTribeEventOccurrence,
} from "@/src/modules/events/domain/services/tribe-event-recurrence";

/**
 * Applies per-occurrence exceptions (cancelled or moved dates) to the
 * expansion of a series. The identity of every occurrence is its original
 * start (`originalStartsAt`), the instant the recurrence rule generates; a
 * move only changes where the occurrence is shown.
 */

/**
 * Exception facts exposed with an occurrence (never the internal ids).
 */
export type TribeEventOccurrenceExceptionSummary = {
  kind: TribeEventOccurrenceExceptionKind;
  reason: string | null;
};

/**
 * One occurrence after applying exceptions: `startsAt`/`endsAt` are the
 * effective times; `originalStartsAt` is the stable slot of the series.
 */
export type TribeEventResolvedOccurrence = {
  endsAt: string | null;
  exception: TribeEventOccurrenceExceptionSummary | null;
  originalStartsAt: string;
  startsAt: string;
};

const SINGLE_SLOT_RANGE_MS = 1;

function toCanonicalInstant(value: string): string {
  return new Date(value).toISOString();
}

function isInRange(instant: string, range: TribeEventDateRange): boolean {
  const time = Date.parse(instant);

  return time >= Date.parse(range.rangeStart) && time < Date.parse(range.rangeEnd);
}

/**
 * End of a moved slot: the explicit new end, else the new start plus the
 * series duration, else no end (like the series itself).
 */
function resolveMovedEndsAt(
  schedule: TribeEventSchedule,
  exception: TribeEventOccurrenceException,
  newStartsAt: string
): string | null {
  if (exception.newEndsAt) {
    return toCanonicalInstant(exception.newEndsAt);
  }

  if (!schedule.endsAt) {
    return null;
  }

  const durationMs = Date.parse(schedule.endsAt) - Date.parse(schedule.startsAt);

  return new Date(Date.parse(newStartsAt) + durationMs).toISOString();
}

/**
 * Finds the exception stored for an original start, comparing instants (the
 * database may return another ISO form of the same instant).
 *
 * @param exceptions - Exceptions of one event.
 * @param originalStartsAt - Original start of the slot.
 * @returns The matching exception or null.
 */
export function findTribeEventOccurrenceException(
  exceptions: readonly TribeEventOccurrenceException[],
  originalStartsAt: string
): TribeEventOccurrenceException | null {
  const originalTime = Date.parse(originalStartsAt);

  return (
    exceptions.find((exception) => Date.parse(exception.originalStartsAt) === originalTime) ??
    null
  );
}

/**
 * Resolves one exception into the occurrence it produces, or null when its
 * original start is no longer a slot of the series (the series was edited
 * after the exception was stored).
 *
 * @param schedule - Series schedule.
 * @param exception - Exception of that series.
 * @returns The occurrence with its effective times, or null.
 */
export function resolveTribeEventOccurrenceException(
  schedule: TribeEventSchedule,
  exception: TribeEventOccurrenceException
): TribeEventResolvedOccurrence | null {
  if (!isTribeEventOccurrence(schedule, exception.originalStartsAt)) {
    return null;
  }

  const originalStartsAt = toCanonicalInstant(exception.originalStartsAt);
  const summary = { kind: exception.kind, reason: exception.reason };

  if (exception.kind === TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND.moved && exception.newStartsAt) {
    const newStartsAt = toCanonicalInstant(exception.newStartsAt);

    return {
      endsAt: resolveMovedEndsAt(schedule, exception, newStartsAt),
      exception: summary,
      originalStartsAt,
      startsAt: newStartsAt,
    };
  }

  const [slot] = expandTribeEventOccurrences(schedule, {
    rangeEnd: new Date(Date.parse(originalStartsAt) + SINGLE_SLOT_RANGE_MS).toISOString(),
    rangeStart: originalStartsAt,
  });

  return {
    endsAt: slot?.endsAt ?? null,
    exception: summary,
    originalStartsAt,
    startsAt: originalStartsAt,
  };
}

/**
 * Expands a series inside `[rangeStart, rangeEnd)` and applies its
 * exceptions:
 * - a cancelled slot stays in place, flagged as cancelled;
 * - a moved slot leaves its original place and appears where its new start
 *   falls, which may be another month;
 * - an exception whose original start is no longer a slot of the series
 *   (the series was edited afterwards) is ignored.
 *
 * @param schedule - Series schedule.
 * @param exceptions - Exceptions of this series (any range).
 * @param range - Queried range, in UTC.
 * @returns Occurrences sorted by effective start.
 */
export function expandTribeEventOccurrencesWithExceptions(
  schedule: TribeEventSchedule,
  exceptions: readonly TribeEventOccurrenceException[],
  range: TribeEventDateRange
): TribeEventResolvedOccurrence[] {
  const exceptionByOriginalStart = new Map(
    exceptions.map((exception) => [toCanonicalInstant(exception.originalStartsAt), exception])
  );
  const occurrences: TribeEventResolvedOccurrence[] = [];

  for (const slot of expandTribeEventOccurrences(schedule, range)) {
    const exception = exceptionByOriginalStart.get(slot.startsAt);

    if (exception?.kind === TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND.moved) {
      continue;
    }

    occurrences.push({
      endsAt: slot.endsAt,
      exception: exception ? { kind: exception.kind, reason: exception.reason } : null,
      originalStartsAt: slot.startsAt,
      startsAt: slot.startsAt,
    });
  }

  for (const exception of exceptionByOriginalStart.values()) {
    if (
      exception.kind !== TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND.moved ||
      !exception.newStartsAt ||
      !isInRange(exception.newStartsAt, range)
    ) {
      continue;
    }

    const movedOccurrence = resolveTribeEventOccurrenceException(schedule, exception);

    if (movedOccurrence) {
      occurrences.push(movedOccurrence);
    }
  }

  return occurrences.sort(
    (firstOccurrence, secondOccurrence) =>
      Date.parse(firstOccurrence.startsAt) - Date.parse(secondOccurrence.startsAt)
  );
}
