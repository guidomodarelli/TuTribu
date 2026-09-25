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
  TribeEventSchedule,
} from "@/src/modules/events/domain/entities/tribe-event";
import type {
  TRIBE_EVENT_CAPACITY_UPDATE_KIND,
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

/**
 * Capacity change requested by an update: keep the stored value, or write a
 * new one (null removes the limit).
 */
export type TribeEventCapacityUpdate =
  | { kind: typeof TRIBE_EVENT_CAPACITY_UPDATE_KIND.unchanged }
  | { capacity: number | null; kind: typeof TRIBE_EVENT_CAPACITY_UPDATE_KIND.set };

export type PersistTribeEventUpdateCommand = Omit<
  PersistTribeEventCommand,
  "capacity" | "eventType"
> & {
  /**
   * Range whose attendance summaries of the event are read back after the
   * waitlist refill, or null to skip that read (no visible month).
   */
  attendanceRange: TribeEventDateRange | null;
  /**
   * `unchanged` leaves the capacity column untouched, so an update that does
   * not mention the capacity never removes an existing limit.
   */
  capacity: TribeEventCapacityUpdate;
  eventId: string;
  /**
   * New type of the series, or null to leave the event type column untouched,
   * so an update that does not mention the type keeps the stored one.
   */
  eventType: TribeEventType | null;
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

/**
 * Attendance write of one occurrence. `schedule` is the series schedule the
 * application used to prove the occurrence is a real slot; the write is
 * refused with `scheduleChanged` when the stored schedule no longer matches
 * it once the event row is locked, so validation and write see one schedule.
 */
export type TribeEventAttendanceWriteCommand = TribeEventAttendanceKey & {
  schedule: TribeEventSchedule;
};

export type SetTribeEventAttendanceRepositoryCommand = TribeEventAttendanceWriteCommand & {
  status: TribeEventAttendanceOption;
};

/**
 * Aggregated attendance of one occurrence as seen by the current viewer.
 * Totals, the going preview, and the waitlist position count only answers of
 * active tribe members, the same rule the database uses to assign seats, so
 * a member blocked or removed after answering never shows the occurrence as
 * full. `goingPreview` holds the first active people who answered "going"
 * (bounded by `TRIBE_EVENT_ATTENDEE_PREVIEW_LIMIT`); `goingCount` is the full
 * active total. `viewerStatus` is always the viewer's own stored answer.
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

/**
 * Everything the viewer attendance streak and its next refresh instant need,
 * read together: the series with an occurrence overlapping `eventRange`
 * (finished and upcoming occurrences) and the viewer's own answers to
 * occurrences starting inside `viewerAttendanceRange`, including dates moved
 * into it whose original start (the answer key) lies outside it.
 */
export type ReadViewerAttendanceStreakSnapshotQuery = {
  eventRange: TribeEventDateRange;
  tribeSlug: string;
  viewerAttendanceRange: TribeEventDateRange;
};

export type TribeEventViewerAttendance = {
  eventId: string;
  occurrenceStartsAt: string;
  status: TribeEventAttendanceStatus;
};

/**
 * Series of the tribe inside a range plus the viewer's own answers, enough to
 * compute the viewer streak without aggregating other members.
 */
export type TribeEventViewerAttendanceHistory = {
  events: TribeEvent[];
  /** Exceptions of those series in the range (cancelled or moved dates). */
  exceptions: TribeEventOccurrenceException[];
  /**
   * Database instant (ISO 8601, UTC) of the statement that read the series,
   * the exceptions, and the answers. Attendance writes decide whether an
   * occurrence ended with the database clock, so the streak cutoff and its
   * next refresh must use this instant instead of the application host clock.
   */
  referenceTime: string;
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
       * `occurrenceEnded` comes from the definer function guard, the only
       * source of truth for the end (database clock under the occurrence
       * lock, at the effective time of a moved date), also after waiting on
       * that lock. `occurrenceCancelled` means the date was cancelled.
       * `scheduleChanged` means a manager edited the schedule after the
       * occurrence was validated.
       */
      status:
        | TribeEventMutationFailureStatus
        | typeof TRIBE_EVENT_MUTATION_STATUS.occurrenceCancelled
        | typeof TRIBE_EVENT_MUTATION_STATUS.occurrenceEnded
        | typeof TRIBE_EVENT_MUTATION_STATUS.scheduleChanged;
    };

export type TribeEventRepository = {
  clearAttendance: (
    command: TribeEventAttendanceWriteCommand
  ) => Promise<TribeEventAttendanceResult>;
  create: (command: PersistTribeEventCommand) => Promise<TribeEventCreationResult>;
  delete: (
    command: DeleteTribeEventRepositoryCommand
  ) => Promise<TribeEventDeletionResult>;
  findById: (query: FindTribeEventQuery) => Promise<TribeEvent | null>;
  getOccurrenceAttendanceReport: (
    query: GetTribeEventAttendanceReportQuery
  ) => Promise<TribeEventAttendanceReportLookup>;
  /**
   * Series with at least one occurrence whose interval (start to effective
   * end) overlaps the range, plus the attendance of those occurrences. This is
   * a superset of the series with an occurrence starting inside the range, so
   * callers pick their own matching through the occurrence expansion.
   */
  listByTribeRange: (
    query: ListTribeEventsByRangeQuery
  ) => Promise<TribeEventRangeListing>;
  listEventOccurrences: (
    query: ListTribeEventOccurrencesQuery
  ) => Promise<TribeEventOccurrenceListing>;
  /**
   * Series, their exceptions, and viewer answers of
   * {@link ReadViewerAttendanceStreakSnapshotQuery} read from one database
   * snapshot, so the streak and the instant at which it changes next never
   * mix two versions of the schedule (for example a series another manager
   * created, rescheduled, or whose date was moved between two reads).
   */
  readViewerAttendanceStreakSnapshot: (
    query: ReadViewerAttendanceStreakSnapshotQuery
  ) => Promise<TribeEventViewerAttendanceHistory>;
  setAttendance: (
    command: SetTribeEventAttendanceRepositoryCommand
  ) => Promise<TribeEventAttendanceResult>;
  update: (
    command: PersistTribeEventUpdateCommand
  ) => Promise<TribeEventUpdateResult>;
};
