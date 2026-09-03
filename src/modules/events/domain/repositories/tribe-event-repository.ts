import type {
  TribeEvent,
  TribeEventAttendanceStatus,
  TribeEventDateRange,
  TribeEventRecurrenceFrequency,
} from "@/src/modules/events/domain/entities/tribe-event";
import type {
  TRIBE_EVENT_MUTATION_STATUS,
} from "@/src/modules/events/constants/tribe-events";

export type ListTribeEventsByRangeQuery = TribeEventDateRange & {
  tribeSlug: string;
};

export type FindTribeEventQuery = {
  eventId: string;
  tribeSlug: string;
};

/**
 * Event fields already normalized by the application layer (trimmed text,
 * empty optionals turned into null, validated dates and links).
 */
export type PersistTribeEventCommand = {
  description: string | null;
  endsAt: string | null;
  meetingUrl: string | null;
  recurrenceFrequency: TribeEventRecurrenceFrequency;
  recurrenceUntil: string | null;
  startsAt: string;
  title: string;
  tribeSlug: string;
};

export type PersistTribeEventUpdateCommand = PersistTribeEventCommand & {
  eventId: string;
};

export type DeleteTribeEventRepositoryCommand = {
  eventId: string;
  tribeSlug: string;
};

export type TribeEventAttendanceKey = {
  eventId: string;
  occurrenceStartsAt: string;
  tribeSlug: string;
};

export type SetTribeEventAttendanceRepositoryCommand = TribeEventAttendanceKey & {
  status: TribeEventAttendanceStatus;
};

/**
 * Aggregated attendance of one occurrence as seen by the current viewer.
 */
export type TribeEventAttendanceSummary = {
  goingCount: number;
  viewerStatus: TribeEventAttendanceStatus | null;
};

export type TribeEventOccurrenceAttendance = TribeEventAttendanceSummary & {
  eventId: string;
  occurrenceStartsAt: string;
};

export type TribeEventViewerPermissions = {
  canManageEvents: boolean;
};

export type TribeEventRangeListing = {
  attendances: TribeEventOccurrenceAttendance[];
  events: TribeEvent[];
  viewerPermissions: TribeEventViewerPermissions;
};

type TribeEventMutationFailureStatus =
  | typeof TRIBE_EVENT_MUTATION_STATUS.forbidden
  | typeof TRIBE_EVENT_MUTATION_STATUS.notFound;

export type TribeEventCreationResult =
  | {
      event: TribeEvent;
      status: typeof TRIBE_EVENT_MUTATION_STATUS.created;
    }
  | {
      status: TribeEventMutationFailureStatus;
    };

export type TribeEventUpdateResult =
  | {
      event: TribeEvent;
      status: typeof TRIBE_EVENT_MUTATION_STATUS.updated;
    }
  | {
      status: TribeEventMutationFailureStatus;
    };

export type TribeEventDeletionResult = {
  status:
    | typeof TRIBE_EVENT_MUTATION_STATUS.deleted
    | TribeEventMutationFailureStatus;
};

export type TribeEventAttendanceResult =
  | {
      attendance: TribeEventAttendanceSummary;
      status:
        | typeof TRIBE_EVENT_MUTATION_STATUS.attendanceCleared
        | typeof TRIBE_EVENT_MUTATION_STATUS.attendanceSaved;
    }
  | {
      status: TribeEventMutationFailureStatus;
    };

export type TribeEventRepository = {
  clearAttendance: (
    command: TribeEventAttendanceKey
  ) => Promise<TribeEventAttendanceResult>;
  create: (command: PersistTribeEventCommand) => Promise<TribeEventCreationResult>;
  delete: (
    command: DeleteTribeEventRepositoryCommand
  ) => Promise<TribeEventDeletionResult>;
  findById: (query: FindTribeEventQuery) => Promise<TribeEvent | null>;
  listByTribeRange: (
    query: ListTribeEventsByRangeQuery
  ) => Promise<TribeEventRangeListing>;
  setAttendance: (
    command: SetTribeEventAttendanceRepositoryCommand
  ) => Promise<TribeEventAttendanceResult>;
  update: (
    command: PersistTribeEventUpdateCommand
  ) => Promise<TribeEventUpdateResult>;
};
