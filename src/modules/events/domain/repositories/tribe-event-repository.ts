import type {
  TribeEvent,
  TribeEventAttendanceOption,
  TribeEventAttendanceStatus,
  TribeEventAttendee,
  TribeEventAttendeePreview,
  TribeEventDateRange,
  TribeEventOccurrenceException,
  TribeEventRecurrenceFrequency,
  TribeEventType,
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
  eventType: TribeEventType;
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
  /** Exceptions of those series in the range (cancelled or moved dates). */
  exceptions: TribeEventOccurrenceException[];
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
  /** Active members who do not manage events may propose a meeting. */
  canProposeEvents: boolean;
};

/**
 * Series whose occurrences can fall in a range, plus the exceptions whose
 * original slot or new start falls in it, and the attendance of every slot
 * shown in the range (including slots moved in from another month).
 */
export type TribeEventRangeListing = {
  attendances: TribeEventOccurrenceAttendance[];
  events: TribeEvent[];
  exceptions: TribeEventOccurrenceException[];
  /** Pending member proposals; always 0 for viewers who cannot review them. */
  pendingProposalCount: number;
  viewerPermissions: TribeEventViewerPermissions;
};

export type ListTribeEventOccurrencesQuery = TribeEventDateRange & {
  eventId: string;
  tribeSlug: string;
};

/**
 * One series inside a range, used to answer a mutation with the fresh
 * occurrences of the visible month (null event: not found or not readable).
 */
export type TribeEventOccurrenceListing = {
  attendances: TribeEventOccurrenceAttendance[];
  event: TribeEvent | null;
  exceptions: TribeEventOccurrenceException[];
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
  getOccurrenceAttendanceReport: (
    query: GetTribeEventAttendanceReportQuery
  ) => Promise<TribeEventAttendanceReportLookup>;
  listByTribeRange: (
    query: ListTribeEventsByRangeQuery
  ) => Promise<TribeEventRangeListing>;
  listEventOccurrences: (
    query: ListTribeEventOccurrencesQuery
  ) => Promise<TribeEventOccurrenceListing>;
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
