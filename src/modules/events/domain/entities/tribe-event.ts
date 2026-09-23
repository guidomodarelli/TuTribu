import type {
  TRIBE_EVENT_ATTENDANCE_OPTIONS,
  TRIBE_EVENT_ATTENDANCE_STATUS,
  TRIBE_EVENT_RECURRENCE_FREQUENCY,
} from "@/src/modules/events/constants/tribe-events";

export type TribeEventRecurrenceFrequency =
  (typeof TRIBE_EVENT_RECURRENCE_FREQUENCY)[keyof typeof TRIBE_EVENT_RECURRENCE_FREQUENCY];

export type TribeEventAttendanceStatus =
  (typeof TRIBE_EVENT_ATTENDANCE_STATUS)[keyof typeof TRIBE_EVENT_ATTENDANCE_STATUS];

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
