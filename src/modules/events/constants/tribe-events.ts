export const TRIBE_EVENT_MUTATION_STATUS = {
  attendanceCleared: "attendance_cleared",
  attendanceSaved: "attendance_saved",
  created: "created",
  deleted: "deleted",
  forbidden: "forbidden",
  invalidAttendance: "invalid_attendance",
  invalidDate: "invalid_date",
  invalidInput: "invalid_input",
  invalidMeetingUrl: "invalid_meeting_url",
  invalidRecurrence: "invalid_recurrence",
  notFound: "not_found",
  updated: "updated",
} as const;

export const TRIBE_EVENT_RECURRENCE_FREQUENCY = {
  biweekly: "biweekly",
  monthly: "monthly",
  none: "none",
  weekly: "weekly",
} as const;

export const TRIBE_EVENT_ATTENDANCE_STATUS = {
  going: "going",
  notGoing: "not_going",
} as const;

export const TRIBE_EVENT_FIELD_LIMIT = {
  descriptionMaxLength: 2000,
  titleMaxLength: 120,
} as const;

/**
 * Duration assumed when an event has no explicit end, used by calendar exports
 * (ICS, Google Calendar) which require a closed interval.
 */
export const TRIBE_EVENT_DEFAULT_DURATION_MINUTES = 60;

export const TRIBE_EVENT_UPCOMING = {
  defaultLimit: 3,
  windowDays: 30,
} as const;

/**
 * Safety cap for recurrence expansion so a malformed range can never loop
 * unbounded. A weekly series inside a 31-day window needs at most 5 slots.
 */
export const TRIBE_EVENT_RECURRENCE_EXPANSION_LIMIT = 1000;
