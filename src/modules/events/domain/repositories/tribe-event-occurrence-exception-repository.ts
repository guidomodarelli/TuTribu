import type {
  TRIBE_EVENT_MUTATION_STATUS,
} from "@/src/modules/events/constants/tribe-events";
import type {
  TribeEventOccurrenceException,
  TribeEventOccurrenceExceptionKind,
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
 * series, new end after the new start).
 */
export type SaveTribeEventOccurrenceExceptionCommand = TribeEventOccurrenceReferenceQuery & {
  kind: TribeEventOccurrenceExceptionKind;
  newEndsAt: string | null;
  newStartsAt: string | null;
  reason: string | null;
};

type ExceptionFailureStatus =
  | typeof TRIBE_EVENT_MUTATION_STATUS.forbidden
  | typeof TRIBE_EVENT_MUTATION_STATUS.notFound;

export type TribeEventOccurrenceExceptionSaveResult =
  | {
      exception: TribeEventOccurrenceException;
      status: typeof TRIBE_EVENT_MUTATION_STATUS.exceptionSaved;
    }
  | {
      status: ExceptionFailureStatus;
    };

/**
 * Deleting an exception that does not exist is still `exceptionCleared`, so
 * "Restaurar fecha" is idempotent under retries.
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
