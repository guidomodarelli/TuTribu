import type {
  TRIBE_EVENT_MUTATION_STATUS,
} from "@/src/modules/events/constants/tribe-events";
import type {
  TribeEventOccurrenceException,
  TribeEventOccurrenceExceptionKind,
  TribeEventSchedule,
} from "@/src/modules/events/domain/entities/tribe-event";

/**
 * Persistence of per-occurrence exceptions (cancelled or moved dates). Every
 * write repeats `can_manage_tribe_events` in SQL because the runtime role
 * bypasses RLS; reads repeat `can_read_tribe_content`.
 */

export type TribeEventOccurrenceReferenceQuery = {
  eventId: string;
  originalStartsAt: string;
  tribeSlug: string;
};

export type ListTribeEventExceptionsQuery = {
  eventId: string;
  tribeSlug: string;
};

/**
 * Exception already validated by the use case (real slot of a recurring
 * series, new end after the new start). `schedule` is the series schedule
 * that validation used; the write is refused with `scheduleChanged` when the
 * stored schedule no longer matches it once the event row is locked, so
 * validation and write see one schedule. Moving a cancelled date refills its
 * waitlist in the same transaction.
 */
export type SaveTribeEventOccurrenceExceptionCommand = TribeEventOccurrenceReferenceQuery & {
  kind: TribeEventOccurrenceExceptionKind;
  newEndsAt: string | null;
  newStartsAt: string | null;
  reason: string | null;
  schedule: TribeEventSchedule;
};

/**
 * `occurrenceEnded` comes from the database re-check under the event row lock
 * (`clock_timestamp()`), for a write that waited past the end of the date or
 * whose host clock lags behind the database.
 */
type ExceptionFailureStatus =
  | typeof TRIBE_EVENT_MUTATION_STATUS.forbidden
  | typeof TRIBE_EVENT_MUTATION_STATUS.notFound
  | typeof TRIBE_EVENT_MUTATION_STATUS.occurrenceEnded;

export type TribeEventOccurrenceExceptionSaveResult =
  | {
      exception: TribeEventOccurrenceException;
      status: typeof TRIBE_EVENT_MUTATION_STATUS.exceptionSaved;
    }
  | {
      status: ExceptionFailureStatus | typeof TRIBE_EVENT_MUTATION_STATUS.scheduleChanged;
    };

/**
 * Deleting an exception that does not exist is still `exceptionCleared`, so
 * "Restaurar fecha" is idempotent under retries. Restoring a date that is
 * still a slot of the series also refills its waitlist in the same
 * transaction. A restore is refused (`occurrenceEnded`) when the date ended
 * at its current times or when its original slot already ended.
 */
export type TribeEventOccurrenceExceptionClearResult = {
  status: typeof TRIBE_EVENT_MUTATION_STATUS.exceptionCleared | ExceptionFailureStatus;
};

export type TribeEventOccurrenceExceptionRepository = {
  clear: (
    command: TribeEventOccurrenceReferenceQuery
  ) => Promise<TribeEventOccurrenceExceptionClearResult>;
  find: (
    query: TribeEventOccurrenceReferenceQuery
  ) => Promise<TribeEventOccurrenceException | null>;
  listByEvent: (query: ListTribeEventExceptionsQuery) => Promise<TribeEventOccurrenceException[]>;
  save: (
    command: SaveTribeEventOccurrenceExceptionCommand
  ) => Promise<TribeEventOccurrenceExceptionSaveResult>;
};
