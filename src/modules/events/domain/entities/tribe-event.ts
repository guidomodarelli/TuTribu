import type {
  TRIBE_EVENT_ATTENDANCE_OPTIONS,
  TRIBE_EVENT_ATTENDANCE_STATUS,
  TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND,
  TRIBE_EVENT_PROPOSAL_STATUS,
  TRIBE_EVENT_RECURRENCE_FREQUENCY,
  TRIBE_EVENT_TYPE,
} from "@/src/modules/events/constants/tribe-events";

export type TribeEventRecurrenceFrequency =
  (typeof TRIBE_EVENT_RECURRENCE_FREQUENCY)[keyof typeof TRIBE_EVENT_RECURRENCE_FREQUENCY];

export type TribeEventAttendanceStatus =
  (typeof TRIBE_EVENT_ATTENDANCE_STATUS)[keyof typeof TRIBE_EVENT_ATTENDANCE_STATUS];

/**
 * Kind of meeting from the fixed catalog (`TRIBE_EVENT_TYPE`).
 */
export type TribeEventType = (typeof TRIBE_EVENT_TYPE)[keyof typeof TRIBE_EVENT_TYPE];

export type TribeEventOccurrenceExceptionKind =
  (typeof TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND)[keyof typeof TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND];

export type TribeEventProposalStatus =
  (typeof TRIBE_EVENT_PROPOSAL_STATUS)[keyof typeof TRIBE_EVENT_PROPOSAL_STATUS];

/**
 * Answer a member can request. `waitlisted` is assigned by the database.
 */
export type TribeEventAttendanceOption = (typeof TRIBE_EVENT_ATTENDANCE_OPTIONS)[number];

/**
 * Scheduling facts of an event series: the first occurrence, its optional end,
 * and how (and until when) it repeats. All values are ISO 8601 UTC strings.
 */
export type TribeEventSchedule = {
  endsAt: string | null;
  recurrenceFrequency: TribeEventRecurrenceFrequency;
  recurrenceUntil: string | null;
  startsAt: string;
};

export type TribeEvent = TribeEventSchedule & {
  /** Seats per occurrence; null means unlimited. */
  capacity: number | null;
  description: string | null;
  eventType: TribeEventType;
  id: string;
  meetingUrl: string | null;
  title: string;
};

/**
 * One concrete slot of a series inside a queried range.
 */
export type TribeEventOccurrenceWindow = {
  endsAt: string | null;
  startsAt: string;
};

/**
 * Change stored for one slot of a series. `originalStartsAt` is the instant
 * the recurrence rule generates for the slot and never changes: it is the
 * stable identity of the occurrence (key, attendance, deep links).
 */
export type TribeEventOccurrenceException = {
  eventId: string;
  kind: TribeEventOccurrenceExceptionKind;
  /** New end of a moved slot; null keeps the series duration (or no end). */
  newEndsAt: string | null;
  /** New start of a moved slot; null for cancelled slots. */
  newStartsAt: string | null;
  originalStartsAt: string;
  reason: string | null;
};

export type TribeEventDateRange = {
  rangeEnd: string;
  rangeStart: string;
};

/**
 * Public profile of a member who is going, shown as an avatar. Never carries
 * the email or any other private field.
 */
export type TribeEventAttendeePreview = {
  id: string;
  image: string | null;
  name: string;
};

/**
 * One answer as seen by a manager in the attendee list and the CSV export.
 */
export type TribeEventAttendee = {
  name: string;
  respondedAt: string;
  status: TribeEventAttendanceStatus;
};

/**
 * Meeting proposed by a member. Approving it creates a real event
 * (`eventId`); the proposal itself never becomes an event row.
 */
export type TribeEventProposal = {
  createdAt: string;
  description: string | null;
  durationMinutes: number;
  eventId: string | null;
  eventType: TribeEventType;
  id: string;
  /** Public name of the author (never the email); null if unavailable. */
  proposerName: string | null;
  reviewNote: string | null;
  reviewedAt: string | null;
  startsAt: string;
  status: TribeEventProposalStatus;
  title: string;
};
