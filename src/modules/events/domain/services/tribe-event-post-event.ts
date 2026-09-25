import { TRIBE_EVENT_OCCURRENCE_REACTIONS } from "@/src/modules/events/constants/tribe-event-post-event";
import type {
  TribeEventOccurrenceException,
  TribeEventSchedule,
} from "@/src/modules/events/domain/entities/tribe-event";
import type {
  TribeEventOccurrenceReaction,
  TribeEventOccurrenceReactionSummary,
} from "@/src/modules/events/domain/entities/tribe-event-post-event";
import {
  resolveTribeEventOccurrenceException,
  type TribeEventResolvedOccurrence,
} from "@/src/modules/events/domain/services/tribe-event-occurrence-exceptions";
import {
  getTribeEventOccurrenceEndTime,
  type TribeEventOccurrenceTimes,
} from "@/src/modules/events/domain/services/tribe-event-occurrence-timing";
import {
  expandTribeEventOccurrences,
  isTribeEventOccurrence,
} from "@/src/modules/events/domain/services/tribe-event-recurrence";

/**
 * Rules shared by the post-event resources (recording, materials, reactions,
 * conversation) of one occurrence.
 */

const SINGLE_SLOT_RANGE_MS = 1;

/**
 * Resolves one occurrence of a series by its original start, applying its
 * exception (cancelled date or effective times of a moved date).
 *
 * @param schedule - Series schedule.
 * @param exception - Exception stored for that original start, if any.
 * @param originalStartsAt - Original start of the slot (occurrence identity).
 * @returns The resolved occurrence, or null when the instant is not a slot of
 * the series.
 */
export function resolveTribeEventOccurrenceSlot(
  schedule: TribeEventSchedule,
  exception: TribeEventOccurrenceException | null,
  originalStartsAt: string
): TribeEventResolvedOccurrence | null {
  if (!isTribeEventOccurrence(schedule, originalStartsAt)) {
    return null;
  }

  if (exception) {
    return resolveTribeEventOccurrenceException(schedule, exception);
  }

  const canonicalStartsAt = new Date(originalStartsAt).toISOString();
  const [slot] = expandTribeEventOccurrences(schedule, {
    rangeEnd: new Date(Date.parse(canonicalStartsAt) + SINGLE_SLOT_RANGE_MS).toISOString(),
    rangeStart: canonicalStartsAt,
  });

  return {
    endsAt: slot?.endsAt ?? null,
    exception: null,
    originalStartsAt: canonicalStartsAt,
    startsAt: canonicalStartsAt,
  };
}

/**
 * Whether an occurrence already ended (effective end, default duration when
 * it has none). Only finished occurrences take recordings and reactions.
 *
 * @param occurrence - Effective start and optional end.
 * @param nowTime - Current time in epoch milliseconds.
 * @returns True once the end is reached.
 */
export function isTribeEventOccurrenceFinished(
  occurrence: TribeEventOccurrenceTimes,
  nowTime: number
): boolean {
  return getTribeEventOccurrenceEndTime(occurrence) <= nowTime;
}

/**
 * Reaction summary of an occurrence nobody reacted to yet.
 *
 * @returns Zero for every reaction of the catalog and no viewer reaction.
 */
export function createEmptyTribeEventReactionSummary(): TribeEventOccurrenceReactionSummary {
  return {
    counts: Object.fromEntries(
      TRIBE_EVENT_OCCURRENCE_REACTIONS.map((reaction) => [reaction, 0])
    ) as Record<TribeEventOccurrenceReaction, number>,
    viewerReaction: null,
  };
}

/**
 * Narrows a stored value to the reaction catalog.
 *
 * @param value - Candidate value (for example a database column).
 * @returns True when it is a known reaction.
 */
export function isTribeEventOccurrenceReaction(
  value: unknown
): value is TribeEventOccurrenceReaction {
  return (TRIBE_EVENT_OCCURRENCE_REACTIONS as readonly unknown[]).includes(value);
}
