import type { TRIBE_EVENT_MUTATION_STATUS } from "@/src/modules/events/constants/tribe-events";
import type {
  TribeEvent,
  TribeEventAttendanceOption,
  TribeEventAttendanceStatus,
  TribeEventAttendee,
  TribeEventAttendeePreview,
  TribeEventRecurrenceFrequency,
} from "@/src/modules/events/domain/entities/tribe-event";
import type { TribeEventAttendanceStreak } from "@/src/modules/events/domain/services/tribe-event-attendance";
import type {
  TribeEventAttendanceResult,
  TribeEventAttendanceSummary,
  TribeEventDeletionResult,
  TribeEventOccurrenceGoingCount,
  TribeEventViewerPermissions,
} from "@/src/modules/events/domain/repositories/tribe-event-repository";

export type TribeEventResult = TribeEvent & {
  /**
   * RFC 5545 RRULE value for series (without the `RRULE:` prefix), null for
   * single events. Lets the UI build calendar links without domain logic.
   */
  recurrenceRule: string | null;
};

export type TribeEventAttendanceSummaryResult = TribeEventAttendanceSummary;

/**
 * One concrete slot of an event inside the requested range. `startsAt` and
 * `endsAt` are the slot times; `seriesStartsAt` keeps the first occurrence so
 * the edit form can show the series anchor.
 */
export type TribeEventOccurrenceResult = {
  attendance: TribeEventAttendanceSummaryResult;
  /** Seats per occurrence of the series; null means unlimited. */
  capacity: number | null;
  description: string | null;
  endsAt: string | null;
  eventId: string;
  meetingUrl: string | null;
  occurrenceKey: string;
  recurrenceFrequency: TribeEventRecurrenceFrequency;
  recurrenceRule: string | null;
  recurrenceUntil: string | null;
  seriesEndsAt: string | null;
  seriesStartsAt: string;
  startsAt: string;
  title: string;
};

export type TribeEventViewerPermissionsResult = TribeEventViewerPermissions;

export type TribeEventMonthResult = {
  current: string;
  next: string;
  previous: string;
};

export type TribeEventListResult = {
  events: TribeEventOccurrenceResult[];
  month: TribeEventMonthResult;
  /**
   * Deep-linked occurrence to open on load, only when it is a valid key that
   * belongs to `events`; null otherwise.
   */
  selectedOccurrenceKey: string | null;
  viewerPermissions: TribeEventViewerPermissionsResult;
};

export type TribeEventUpcomingListResult = {
  events: TribeEventOccurrenceResult[];
};

export type TribeEventSaveFailureStatus =
  | typeof TRIBE_EVENT_MUTATION_STATUS.forbidden
  | typeof TRIBE_EVENT_MUTATION_STATUS.invalidDate
  | typeof TRIBE_EVENT_MUTATION_STATUS.invalidMeetingUrl
  | typeof TRIBE_EVENT_MUTATION_STATUS.invalidRecurrence
  | typeof TRIBE_EVENT_MUTATION_STATUS.notFound;

/**
 * Outcome of creating or updating an event. `occurrences` carries the slots of
 * the caller's visible month (empty when no month was requested).
 */
export type TribeEventSaveResult =
  | {
      event: TribeEventResult;
      occurrences: TribeEventOccurrenceResult[];
      status:
        | typeof TRIBE_EVENT_MUTATION_STATUS.created
        | typeof TRIBE_EVENT_MUTATION_STATUS.updated;
    }
  | {
      status: TribeEventSaveFailureStatus;
    };

export type TribeEventDeleteResult = TribeEventDeletionResult;

export type TribeEventAttendanceMutationResult =
  | TribeEventAttendanceResult
  | {
      status: typeof TRIBE_EVENT_MUTATION_STATUS.invalidAttendance;
    };

/**
 * Viewer-only streak shown on the next event card ("Fuiste a 4 de los
 * últimos 5 encuentros"). Never exposed to other members.
 */
export type TribeEventAttendanceStreakResult = TribeEventAttendanceStreak;

export type TribeEventAttendeeResult = TribeEventAttendee;

/**
 * Manager view of one occurrence: answers grouped by status (waitlisted in
 * FIFO order) and, for series, the "going" totals of the last finished
 * occurrences, oldest first.
 */
export type TribeEventAttendanceReportResult = {
  attendeeGroups: {
    going: TribeEventAttendeeResult[];
    maybe: TribeEventAttendeeResult[];
    notGoing: TribeEventAttendeeResult[];
    waitlisted: TribeEventAttendeeResult[];
  };
  eventTitle: string;
  occurrenceStartsAt: string;
  trend: TribeEventOccurrenceGoingCount[];
};

export type TribeEventAttendanceReportLookupResult =
  | {
      report: TribeEventAttendanceReportResult;
      status: typeof TRIBE_EVENT_MUTATION_STATUS.found;
    }
  | {
      status:
        | typeof TRIBE_EVENT_MUTATION_STATUS.forbidden
        | typeof TRIBE_EVENT_MUTATION_STATUS.invalidAttendance
        | typeof TRIBE_EVENT_MUTATION_STATUS.notFound;
    };

export type {
  TribeEventAttendanceOption,
  TribeEventAttendanceStatus,
  TribeEventAttendeePreview,
};
