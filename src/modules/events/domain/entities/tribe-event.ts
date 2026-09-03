import type {
  TRIBE_EVENT_ATTENDANCE_STATUS,
  TRIBE_EVENT_RECURRENCE_FREQUENCY,
} from "@/src/modules/events/constants/tribe-events";

export type TribeEventRecurrenceFrequency =
  (typeof TRIBE_EVENT_RECURRENCE_FREQUENCY)[keyof typeof TRIBE_EVENT_RECURRENCE_FREQUENCY];

export type TribeEventAttendanceStatus =
  (typeof TRIBE_EVENT_ATTENDANCE_STATUS)[keyof typeof TRIBE_EVENT_ATTENDANCE_STATUS];

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
