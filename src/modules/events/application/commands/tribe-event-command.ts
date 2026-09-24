import type {
  TribeEventAttendanceOption,
  TribeEventRecurrenceFrequency,
} from "@/src/modules/events/domain/entities/tribe-event";

/**
 * Commands and queries of the events use cases. Every value here was already
 * validated by the route or page boundary (`infrastructure/api/schemas`):
 * slugs are canonical, event ids are uuids, instants are canonical ISO UTC,
 * months are `YYYY-MM`, and optional text is trimmed or null. Use cases only
 * enforce the business rules a schema cannot express.
 */

/**
 * Deep-linked occurrence (`eventId@startsAt`) already split and validated.
 */
export type TribeEventOccurrenceReference = {
  eventId: string;
  key: string;
  occurrenceStartsAt: string;
};

/**
 * Listing of the events page or endpoint. Without `month`, the month is
 * derived from `occurrence` (so the linked occurrence is part of the listing)
 * or falls back to the current Buenos Aires month.
 */
export type ListTribeEventsQuery = {
  month: string | null;
  occurrence: TribeEventOccurrenceReference | null;
  tribeSlug: string;
};

export type ListUpcomingTribeEventsQuery = {
  limit?: number;
  tribeSlug: string;
};

export type GetTribeEventQuery = {
  eventId: string;
  tribeSlug: string;
};

/**
 * Event fields as produced by the input schema: trimmed title, canonical
 * instants, null for empty optionals, capacity as a number (null means
 * unlimited), and a known recurrence frequency.
 */
export type TribeEventFieldsInput = {
  capacity: number | null;
  description: string | null;
  endsAt: string | null;
  meetingUrl: string | null;
  recurrenceFrequency: TribeEventRecurrenceFrequency;
  recurrenceUntil: string | null;
  startsAt: string;
  title: string;
};

/**
 * `visibleMonth` lets the caller get back the occurrences of the month it is
 * rendering so the UI can update without a full reload (null: none).
 */
export type CreateTribeEventCommand = TribeEventFieldsInput & {
  tribeSlug: string;
  visibleMonth: string | null;
};

/**
 * Event fields of an update as produced by the input schema. Unlike creation,
 * an omitted `capacity` stays undefined and means "keep the stored capacity":
 * an older client or API consumer that does not know the field must not
 * remove an existing limit. `null` removes it explicitly and a positive
 * integer sets it.
 */
export type TribeEventUpdateFieldsInput = Omit<TribeEventFieldsInput, "capacity"> & {
  capacity?: number | null;
};

export type UpdateTribeEventCommand = TribeEventUpdateFieldsInput & {
  eventId: string;
  tribeSlug: string;
  visibleMonth: string | null;
};

export type DeleteTribeEventCommand = {
  eventId: string;
  tribeSlug: string;
};

/**
 * Attendance answer as produced by the input schema.
 */
export type TribeEventAttendanceInput = {
  occurrenceStartsAt: string;
  status: TribeEventAttendanceOption;
};

export type SetTribeEventAttendanceCommand = TribeEventAttendanceInput & {
  eventId: string;
  tribeSlug: string;
};

export type GetTribeEventAttendanceReportQuery = {
  eventId: string;
  occurrenceStartsAt: string;
  tribeSlug: string;
};

/**
 * `now` is the application instant the caller took before the read. It only
 * sizes the read ranges (with a clock margin): the streak, its next refresh
 * instant, and `attendanceStreakComputedAt` all use the database instant the
 * snapshot read returns, so the response agrees on one "now" and that "now"
 * is the clock attendance writes use to refuse ended occurrences.
 */
export type GetTribeEventAttendanceStreakQuery = {
  now: Date;
  tribeSlug: string;
};

export type ClearTribeEventAttendanceCommand = {
  eventId: string;
  occurrenceStartsAt: string;
  tribeSlug: string;
};
