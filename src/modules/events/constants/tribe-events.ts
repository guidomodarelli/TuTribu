export const TRIBE_EVENT_MUTATION_STATUS = {
  attendanceCleared: "attendance_cleared",
  attendanceSaved: "attendance_saved",
  created: "created",
  deleted: "deleted",
  forbidden: "forbidden",
  found: "found",
  invalidAttendance: "invalid_attendance",
  invalidCapacity: "invalid_capacity",
  invalidDate: "invalid_date",
  invalidInput: "invalid_input",
  invalidMeetingUrl: "invalid_meeting_url",
  invalidRecurrence: "invalid_recurrence",
  notFound: "not_found",
  occurrenceEnded: "occurrence_ended",
  scheduleChanged: "schedule_changed",
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
  maybe: "maybe",
  notGoing: "not_going",
  waitlisted: "waitlisted",
} as const;

/**
 * Answers a member can pick, in button order. `waitlisted` is never chosen:
 * the database assigns it when a "going" answer finds the event full.
 */
export const TRIBE_EVENT_ATTENDANCE_OPTIONS = [
  TRIBE_EVENT_ATTENDANCE_STATUS.going,
  TRIBE_EVENT_ATTENDANCE_STATUS.maybe,
  TRIBE_EVENT_ATTENDANCE_STATUS.notGoing,
] as const;

/**
 * People who are going shown as avatars in each occurrence summary.
 */
export const TRIBE_EVENT_ATTENDEE_PREVIEW_LIMIT = 5;

/**
 * Optional capacity of a series. The upper bound only guards against typos;
 * NULL (empty field) means unlimited.
 */
export const TRIBE_EVENT_CAPACITY_LIMIT = {
  max: 10_000,
  min: 1,
} as const;

/**
 * Viewer-only attendance streak on the next event: shown when the viewer went
 * to at least `minimumAttended` of the last `windowSize` finished occurrences
 * found within `lookbackDays`.
 */
export const TRIBE_EVENT_ATTENDANCE_STREAK = {
  lookbackDays: 180,
  minimumAttended: 2,
  windowSize: 5,
} as const;

/**
 * Manager trend of "going" answers across the last finished occurrences of a
 * series. The lookback keeps recurrence expansion bounded (six monthly slots
 * plus skipped months fit in it).
 */
export const TRIBE_EVENT_ATTENDANCE_TREND = {
  lookbackDays: 400,
  size: 6,
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

/**
 * Minutes before the start from which the UI offers the "Unirme" shortcut to
 * the meeting link, so members can join a few minutes early.
 */
export const TRIBE_EVENT_JOIN_WINDOW_MINUTES = 15;

/**
 * Query parameter names of the tribe events page: the visible month and the
 * occurrence whose detail opens on load (deep link).
 */
export const TRIBE_EVENTS_ROUTE_QUERY = {
  event: "event",
  month: "month",
} as const;

/**
 * How an occurrence is matched against a queried range. The month calendar
 * files each occurrence under the range where it starts (a workshop crossing
 * midnight between two months belongs to the month it began), while the
 * upcoming list keeps every occurrence whose interval still overlaps the range,
 * so an in-progress event stays visible until its effective end regardless of
 * how long ago it started.
 */
export const TRIBE_EVENT_RANGE_MATCH = {
  overlaps: "overlaps",
  startsWithin: "starts_within",
} as const;

export const TRIBE_EVENT_UPCOMING = {
  defaultLimit: 3,
  windowDays: 30,
} as const;

/**
 * Safety cap for recurrence expansion so a malformed range can never loop
 * unbounded. A weekly series inside a 31-day window needs at most 5 slots.
 */
export const TRIBE_EVENT_RECURRENCE_EXPANSION_LIMIT = 1000;
