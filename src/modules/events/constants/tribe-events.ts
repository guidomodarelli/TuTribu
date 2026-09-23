export const TRIBE_EVENT_MUTATION_STATUS = {
  attendanceCleared: "attendance_cleared",
  attendanceSaved: "attendance_saved",
  created: "created",
  deleted: "deleted",
  forbidden: "forbidden",
  exceptionCleared: "exception_cleared",
  exceptionSaved: "exception_saved",
  found: "found",
  invalidAttendance: "invalid_attendance",
  invalidDate: "invalid_date",
  invalidMeetingUrl: "invalid_meeting_url",
  invalidOccurrence: "invalid_occurrence",
  invalidRecurrence: "invalid_recurrence",
  notFound: "not_found",
  occurrenceCancelled: "occurrence_cancelled",
  proposalApproved: "proposal_approved",
  proposalCreated: "proposal_created",
  proposalLimitReached: "proposal_limit_reached",
  proposalRejected: "proposal_rejected",
  proposalResolved: "proposal_resolved",
  proposalWithdrawn: "proposal_withdrawn",
  updated: "updated",
} as const;

/**
 * Fixed catalog of event types (not editable per tribe). The values mirror
 * the `events_valid_event_type` CHECK; labels live in `tribe-event-copy.ts`
 * and colors in `src/styles/event-type-tokens.css`.
 */
export const TRIBE_EVENT_TYPE = {
  inPerson: "in_person",
  live: "live",
  questionsAndAnswers: "qa",
  social: "social",
  workshop: "workshop",
} as const;

/**
 * Display order of the event types (form selector and filter chips).
 */
export const TRIBE_EVENT_TYPES = [
  TRIBE_EVENT_TYPE.live,
  TRIBE_EVENT_TYPE.workshop,
  TRIBE_EVENT_TYPE.questionsAndAnswers,
  TRIBE_EVENT_TYPE.inPerson,
  TRIBE_EVENT_TYPE.social,
] as const;

/**
 * Type of a series created without an explicit choice (same as the column
 * default).
 */
export const TRIBE_EVENT_DEFAULT_TYPE = TRIBE_EVENT_TYPE.live;

/**
 * Change applied to one occurrence of a series.
 */
export const TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND = {
  cancelled: "cancelled",
  moved: "moved",
} as const;

/**
 * Optional reason of a cancelled or moved date (mirrors the SQL CHECK).
 */
export const TRIBE_EVENT_OCCURRENCE_EXCEPTION_REASON_MAX_LENGTH = 280;

export const TRIBE_EVENT_PROPOSAL_STATUS = {
  approved: "approved",
  pending: "pending",
  rejected: "rejected",
  withdrawn: "withdrawn",
} as const;

/**
 * Limits of member proposals. `pendingPerMember` is the anti-spam cap of
 * pending proposals per member and tribe; the list sizes bound the panel.
 */
export const TRIBE_EVENT_PROPOSAL_LIMIT = {
  authorListSize: 20,
  managerListSize: 50,
  pendingPerMember: 3,
  reviewNoteMaxLength: 500,
} as const;

/**
 * Durations offered by the proposal form, in display order.
 */
const TRIBE_EVENT_PROPOSAL_DURATION_OPTION_MINUTES = {
  halfHour: 30,
  hour: 60,
  hourAndHalf: 90,
  threeHours: 180,
  twoHours: 120,
} as const;

/**
 * Duration of a proposed meeting in minutes (mirrors the SQL CHECK). The form
 * offers `options`; the schema accepts any whole value inside the bounds.
 */
export const TRIBE_EVENT_PROPOSAL_DURATION = {
  defaultMinutes: TRIBE_EVENT_PROPOSAL_DURATION_OPTION_MINUTES.hour,
  maxMinutes: 480,
  minMinutes: 15,
  options: [
    TRIBE_EVENT_PROPOSAL_DURATION_OPTION_MINUTES.halfHour,
    TRIBE_EVENT_PROPOSAL_DURATION_OPTION_MINUTES.hour,
    TRIBE_EVENT_PROPOSAL_DURATION_OPTION_MINUTES.hourAndHalf,
    TRIBE_EVENT_PROPOSAL_DURATION_OPTION_MINUTES.twoHours,
    TRIBE_EVENT_PROPOSAL_DURATION_OPTION_MINUTES.threeHours,
  ],
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
 * Query parameter names of the tribe events page: the visible month, the
 * occurrence whose detail opens on load (deep link), and the type filter.
 */
export const TRIBE_EVENTS_ROUTE_QUERY = {
  event: "event",
  month: "month",
  type: "type",
} as const;

/**
 * Separator accepted between event types in one `type` query value
 * (`?type=live,workshop`); repeating the parameter works too.
 */
export const TRIBE_EVENT_TYPE_QUERY_SEPARATOR = ",";

export const TRIBE_EVENT_UPCOMING = {
  defaultLimit: 3,
  windowDays: 30,
} as const;

/**
 * Safety cap for recurrence expansion so a malformed range can never loop
 * unbounded. A weekly series inside a 31-day window needs at most 5 slots.
 */
export const TRIBE_EVENT_RECURRENCE_EXPANSION_LIMIT = 1000;
