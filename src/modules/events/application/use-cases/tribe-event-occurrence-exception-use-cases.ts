import type {
  ClearTribeEventOccurrenceExceptionCommand,
  SaveTribeEventOccurrenceExceptionCommand,
} from "@/src/modules/events/application/commands/tribe-event-command";
import type { TribeEventOccurrenceExceptionMutationResult } from "@/src/modules/events/application/results/tribe-event-result";
import {
  isInvalidTribeEventDateRange,
  listVisibleMonthOccurrences,
} from "@/src/modules/events/application/services/tribe-event-field-rules";
import {
  TRIBE_EVENT_MUTATION_STATUS,
  TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND,
  TRIBE_EVENT_RECURRENCE_FREQUENCY,
} from "@/src/modules/events/constants/tribe-events";
import type { TribeEventOccurrenceExceptionRepository } from "@/src/modules/events/domain/repositories/tribe-event-occurrence-exception-repository";
import type { TribeEventRepository } from "@/src/modules/events/domain/repositories/tribe-event-repository";
import { isTribeEventOccurrence } from "@/src/modules/events/domain/services/tribe-event-recurrence";

type TribeEventOccurrenceExceptionDependencies = {
  tribeEventOccurrenceExceptionRepository: TribeEventOccurrenceExceptionRepository;
  tribeEventRepository: TribeEventRepository;
};

/**
 * Cancels or moves one date of a series ("Cancelar esta fecha" / "Mover esta
 * fecha"). Rules a schema cannot express live here: the event must be a
 * recurring series, the original start must be a real slot of it, and a new
 * end must come after the new start. Saving again replaces the previous
 * exception of that date (a cancelled date can later be moved, and back).
 *
 * The occurrence keeps its key (`eventId@originalStartsAt`), so deep links
 * and attendance stay attached to it after a move.
 */
export function saveTribeEventOccurrenceException({
  tribeEventOccurrenceExceptionRepository,
  tribeEventRepository,
}: TribeEventOccurrenceExceptionDependencies) {
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

    const result = await tribeEventOccurrenceExceptionRepository.save({
      eventId: command.eventId,
      kind: command.kind,
      newEndsAt: isMoved ? command.newEndsAt : null,
      newStartsAt: isMoved ? command.newStartsAt : null,
      originalStartsAt: command.originalStartsAt,
      reason: command.reason,
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
 * again. Idempotent: restoring a date without exception succeeds.
 */
export function clearTribeEventOccurrenceException({
  tribeEventOccurrenceExceptionRepository,
  tribeEventRepository,
}: TribeEventOccurrenceExceptionDependencies) {
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
