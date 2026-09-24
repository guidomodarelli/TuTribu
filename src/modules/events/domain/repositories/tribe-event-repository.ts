import type {
  TribeEvent,
  TribeEventAttendanceOption,
  TribeEventAttendanceStatus,
  TribeEventAttendee,
  TribeEventAttendeePreview,
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
  capacity: number | null;
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
  /**
   * Range whose attendance summaries of the event are read back after the
   * waitlist refill, or null to skip that read (no visible month).
   */
  attendanceRange: TribeEventDateRange | null;
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
  status: TribeEventAttendanceOption;
};

/**
 * Aggregated attendance of one occurrence as seen by the current viewer.
 * `goingPreview` holds the first people who answered "going" (bounded by
 * `TRIBE_EVENT_ATTENDEE_PREVIEW_LIMIT`); `goingCount` is the full total.
 */
export type TribeEventAttendanceSummary = {
  goingCount: number;
  goingPreview: TribeEventAttendeePreview[];
  maybeCount: number;
  viewerStatus: TribeEventAttendanceStatus | null;
  /** 1-based FIFO position when the viewer is waitlisted, null otherwise. */
  viewerWaitlistPosition: number | null;
  waitlistedCount: number;
};

export type TribeEventOccurrenceAttendance = TribeEventAttendanceSummary & {
  eventId: string;
  occurrenceStartsAt: string;
};

export type ListViewerAttendanceHistoryQuery = TribeEventDateRange & {
  tribeSlug: string;
};

export type TribeEventViewerAttendance = {
  eventId: string;
  occurrenceStartsAt: string;
  status: TribeEventAttendanceStatus;
};

/**
 * Series of the tribe inside a past range plus the viewer's own answers,
 * enough to compute the viewer streak without aggregating other members.
 */
export type TribeEventViewerAttendanceHistory = {
  events: TribeEvent[];
  viewerAttendances: TribeEventViewerAttendance[];
};

export type GetTribeEventAttendanceReportQuery = TribeEventAttendanceKey & {
  /** Past occurrence starts whose "going" totals feed the manager trend. */
  trendOccurrenceStartsAts: string[];
};

export type TribeEventOccurrenceGoingCount = {
  goingCount: number;
  occurrenceStartsAt: string;
};

export type TribeEventAttendanceReportLookup =
  | {
      attendees: TribeEventAttendee[];
      status: typeof TRIBE_EVENT_MUTATION_STATUS.found;
      trend: TribeEventOccurrenceGoingCount[];
    }
  | {
      status: TribeEventMutationFailureStatus;
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
      /**
       * Attendance summaries of the event inside `attendanceRange`, read in
       * the same transaction after the waitlist refill so they already
       * include its promotions. Empty when no range was requested.
       */
      attendances: TribeEventOccurrenceAttendance[];
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
      /**
       * `occurrenceEnded` comes from the definer function guard (defense in
       * depth behind the use case check) when the occurrence already ended.
       */
      status:
        | TribeEventMutationFailureStatus
        | typeof TRIBE_EVENT_MUTATION_STATUS.occurrenceEnded;
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
  getOccurrenceAttendanceReport: (
    query: GetTribeEventAttendanceReportQuery
  ) => Promise<TribeEventAttendanceReportLookup>;
  listByTribeRange: (
    query: ListTribeEventsByRangeQuery
  ) => Promise<TribeEventRangeListing>;
  listViewerAttendanceHistory: (
    query: ListViewerAttendanceHistoryQuery
  ) => Promise<TribeEventViewerAttendanceHistory>;
  setAttendance: (
    command: SetTribeEventAttendanceRepositoryCommand
  ) => Promise<TribeEventAttendanceResult>;
  update: (
    command: PersistTribeEventUpdateCommand
  ) => Promise<TribeEventUpdateResult>;
};
