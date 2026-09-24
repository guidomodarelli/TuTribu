import type {
  ClearTribeEventOccurrenceExceptionCommand,
  SaveTribeEventOccurrenceExceptionCommand,
} from "@/src/modules/events/application/commands/tribe-event-command";
import type { TribeEventOccurrenceExceptionMutationResult } from "@/src/modules/events/application/results/tribe-event-result";
import {
  isInvalidTribeEventDateRange,
  listVisibleMonthOccurrences,
} from "@/src/modules/events/application/services/tribe-event-field-rules";
import { pickValidatedTribeEventSchedule } from "@/src/modules/events/application/services/tribe-event-validated-schedule";
import {
  TRIBE_EVENT_MUTATION_STATUS,
  TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND,
  TRIBE_EVENT_RECURRENCE_FREQUENCY,
} from "@/src/modules/events/constants/tribe-events";
import type { TribeEventOccurrenceExceptionRepository } from "@/src/modules/events/domain/repositories/tribe-event-occurrence-exception-repository";
import type { TribeEvent } from "@/src/modules/events/domain/entities/tribe-event";
import type { TribeEventRepository } from "@/src/modules/events/domain/repositories/tribe-event-repository";
import {
  resolveTribeEventOccurrenceByOriginalStart,
  resolveTribeEventOccurrenceException,
} from "@/src/modules/events/domain/services/tribe-event-occurrence-exceptions";
import { hasTribeEventOccurrenceEnded } from "@/src/modules/events/domain/services/tribe-event-occurrence-timing";
import { isTribeEventOccurrence } from "@/src/modules/events/domain/services/tribe-event-recurrence";

type TribeEventOccurrenceExceptionDependencies = {
  /**
   * Current time source (epoch ms), injectable for deterministic tests. Used
   * to keep finished occurrences frozen; defaults to the system clock.
   */
  now?: () => number;
  tribeEventOccurrenceExceptionRepository: TribeEventOccurrenceExceptionRepository;
  tribeEventRepository: TribeEventRepository;
};

/**
 * Whether the occurrence identified by its original start already ended, at
 * its current effective times (a moved date ends at its new time). Ended
 * occurrences are frozen like their answers: cancelling, moving, or
 * restoring them would rewrite the attendance history and the streak.
 */
async function hasCurrentOccurrenceEnded(
  dependencies: TribeEventOccurrenceExceptionDependencies,
  event: TribeEvent,
  command: { eventId: string; originalStartsAt: string; tribeSlug: string },
  nowTime: number
): Promise<boolean> {
  const currentException = await dependencies.tribeEventOccurrenceExceptionRepository.find({
    eventId: command.eventId,
    originalStartsAt: command.originalStartsAt,
    tribeSlug: command.tribeSlug,
  });
  const occurrence = resolveTribeEventOccurrenceByOriginalStart(
    event,
    currentException ? [currentException] : [],
    command.originalStartsAt
  );

  return occurrence !== null && hasTribeEventOccurrenceEnded(occurrence, nowTime);
}

/**
 * Whether the original slot of the occurrence (the time a restore brings it
 * back to) already ended. A date moved into the future from a slot that
 * already ended is still open at its current time, but restoring it would
 * retroactively add it, and its preserved answers, to the history.
 */
function hasOriginalSlotEnded(
  event: TribeEvent,
  originalStartsAt: string,
  nowTime: number
): boolean {
  const originalSlot = resolveTribeEventOccurrenceByOriginalStart(event, [], originalStartsAt);

  return originalSlot !== null && hasTribeEventOccurrenceEnded(originalSlot, nowTime);
}

/**
 * Cancels or moves one date of a series ("Cancelar esta fecha" / "Mover esta
 * fecha"). Rules a schema cannot express live here: the event must be a
 * recurring series, the original start must be a real slot of it, and a new
 * end must come after the new start. Saving again replaces the previous
 * exception of that date (a cancelled date can later be moved, and back).
 * An occurrence that already ended (at its current effective times) is
 * frozen, and a date cannot be moved to a schedule that already ended.
 * These checks run before the write transaction, so the validated schedule
 * travels with the write and the repository refuses it (`scheduleChanged`)
 * when a manager edited the series in between, and repeats the end checks
 * with `clock_timestamp()` under the event row lock (`occurrenceEnded`) for a
 * write that waited past the end or runs on a skewed host clock.
 *
 * The occurrence keeps its key (`eventId@originalStartsAt`), so deep links
 * and attendance stay attached to it after a move.
 */
export function saveTribeEventOccurrenceException(
  dependencies: TribeEventOccurrenceExceptionDependencies
) {
  const { now = Date.now, tribeEventOccurrenceExceptionRepository, tribeEventRepository } =
    dependencies;

  return async (
    command: SaveTribeEventOccurrenceExceptionCommand
  ): Promise<TribeEventOccurrenceExceptionMutationResult> => {
    const event = await tribeEventRepository.findById({
      eventId: command.eventId,
      tribeSlug: command.tribeSlug,
    });

    if (!event) {
      return { status: TRIBE_EVENT_MUTATION_STATUS.notFound };
    }

    if (
      event.recurrenceFrequency === TRIBE_EVENT_RECURRENCE_FREQUENCY.none ||
      !isTribeEventOccurrence(event, command.originalStartsAt)
    ) {
      return { status: TRIBE_EVENT_MUTATION_STATUS.invalidOccurrence };
    }

    const isMoved = command.kind === TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND.moved;

    if (
      isMoved &&
      (command.newStartsAt === null ||
        isInvalidTribeEventDateRange(command.newStartsAt, command.newEndsAt))
    ) {
      return { status: TRIBE_EVENT_MUTATION_STATUS.invalidDate };
    }

    const nowTime = now();
    const movedOccurrence =
      isMoved && command.newStartsAt !== null
        ? resolveTribeEventOccurrenceException(event, {
            eventId: command.eventId,
            kind: command.kind,
            newEndsAt: command.newEndsAt,
            newStartsAt: command.newStartsAt,
            originalStartsAt: command.originalStartsAt,
            reason: command.reason,
          })
        : null;

    if (
      (await hasCurrentOccurrenceEnded(dependencies, event, command, nowTime)) ||
      (movedOccurrence !== null && hasTribeEventOccurrenceEnded(movedOccurrence, nowTime))
    ) {
      return { status: TRIBE_EVENT_MUTATION_STATUS.occurrenceEnded };
    }

    const result = await tribeEventOccurrenceExceptionRepository.save({
      eventId: command.eventId,
      kind: command.kind,
      newEndsAt: isMoved ? command.newEndsAt : null,
      newStartsAt: isMoved ? command.newStartsAt : null,
      originalStartsAt: command.originalStartsAt,
      reason: command.reason,
      schedule: pickValidatedTribeEventSchedule(event),
      tribeSlug: command.tribeSlug,
    });

    if (result.status !== TRIBE_EVENT_MUTATION_STATUS.exceptionSaved) {
      return { status: result.status };
    }

    return {
      occurrences: await listVisibleMonthOccurrences(tribeEventRepository, command),
      status: result.status,
    };
  };
}

/**
 * "Restaurar fecha": removes the exception so the date follows the series
 * again. Idempotent: restoring a date without exception succeeds. Like the
 * other date changes, it is refused once the occurrence ended, at its
 * current effective times or at the original slot it would return to (a past
 * date moved into the future stays frozen). The repository repeats both
 * checks with `clock_timestamp()` under the event row lock and refills the
 * waitlist of the restored date in the same transaction (seats freed while
 * it was cancelled were never offered).
 */
export function clearTribeEventOccurrenceException(
  dependencies: TribeEventOccurrenceExceptionDependencies
) {
  const { now = Date.now, tribeEventOccurrenceExceptionRepository, tribeEventRepository } =
    dependencies;

  return async (
    command: ClearTribeEventOccurrenceExceptionCommand
  ): Promise<TribeEventOccurrenceExceptionMutationResult> => {
    const event = await tribeEventRepository.findById({
      eventId: command.eventId,
      tribeSlug: command.tribeSlug,
    });

    if (!event) {
      return { status: TRIBE_EVENT_MUTATION_STATUS.notFound };
    }

    const nowTime = now();

    if (
      hasOriginalSlotEnded(event, command.originalStartsAt, nowTime) ||
      (await hasCurrentOccurrenceEnded(dependencies, event, command, nowTime))
    ) {
      return { status: TRIBE_EVENT_MUTATION_STATUS.occurrenceEnded };
    }

    const result = await tribeEventOccurrenceExceptionRepository.clear({
      eventId: command.eventId,
      originalStartsAt: command.originalStartsAt,
      tribeSlug: command.tribeSlug,
    });

    if (result.status !== TRIBE_EVENT_MUTATION_STATUS.exceptionCleared) {
      return { status: result.status };
    }

    return {
      occurrences: await listVisibleMonthOccurrences(tribeEventRepository, command),
      status: result.status,
    };
  };
}
