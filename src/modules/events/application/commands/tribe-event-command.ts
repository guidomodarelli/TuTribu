import type {
  TribeEventAttendanceOption,
  TribeEventOccurrenceExceptionKind,
  TribeEventRecurrenceFrequency,
  TribeEventType,
} from "@/src/modules/events/domain/entities/tribe-event";
import type { TribeEventOccurrenceReaction } from "@/src/modules/events/domain/entities/tribe-event-post-event";

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
  /** Types to keep; empty keeps every type. */
  eventTypes: readonly TribeEventType[];
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
  eventType: TribeEventType;
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

/**
 * Change requested for one date of a series, as produced by the input
 * schema: a cancelled date carries no new times; a moved date carries its
 * new start and an optional new end.
 */
export type TribeEventOccurrenceExceptionInput = {
  kind: TribeEventOccurrenceExceptionKind;
  newEndsAt: string | null;
  newStartsAt: string | null;
  originalStartsAt: string;
  reason: string | null;
};

export type SaveTribeEventOccurrenceExceptionCommand = TribeEventOccurrenceExceptionInput & {
  eventId: string;
  tribeSlug: string;
  visibleMonth: string | null;
};

export type ClearTribeEventOccurrenceExceptionCommand = {
  eventId: string;
  originalStartsAt: string;
  tribeSlug: string;
  visibleMonth: string | null;
};

/**
 * Reduced meeting proposal as produced by the input schema.
 */
export type TribeEventProposalInput = {
  description: string | null;
  durationMinutes: number;
  eventType: TribeEventType;
  startsAt: string;
  title: string;
};

export type CreateTribeEventProposalCommand = TribeEventProposalInput & {
  tribeSlug: string;
};

export type ListTribeEventProposalsQuery = {
  tribeSlug: string;
};

/**
 * Approval: the event fields the manager confirmed (prefilled from the
 * proposal and possibly edited).
 */
export type ApproveTribeEventProposalCommand = TribeEventFieldsInput & {
  proposalId: string;
  tribeSlug: string;
  visibleMonth: string | null;
};

export type RejectTribeEventProposalCommand = {
  proposalId: string;
  reviewNote: string | null;
  tribeSlug: string;
};

export type WithdrawTribeEventProposalCommand = {
  proposalId: string;
  tribeSlug: string;
};

/**
 * Management of the signed-in member's own calendar feed token.
 */
export type TribeEventCalendarFeedTokenCommand = {
  tribeSlug: string;
};

/**
 * Public feed request: the token (already checked to be well-formed by the
 * route) is the only credential; there is no session.
 */
export type GetTribeEventCalendarFeedQuery = {
  /** Types to keep; empty keeps every type. */
  eventTypes: readonly TribeEventType[];
  token: string;
  tribeSlug: string;
};

/**
 * One occurrence of a series by its stable identity (original start), used
 * by the post-event resources, reactions, and conversation.
 */
export type TribeEventOccurrenceQuery = {
  eventId: string;
  originalStartsAt: string;
  tribeSlug: string;
};

/**
 * Material link as produced by the input schema (trimmed title, http/https
 * URL).
 */
export type TribeEventMaterialInput = {
  title: string;
  url: string;
};

/**
 * "Agregar grabación y materiales": replaces the recording (null removes it)
 * and the whole list of materials of one finished occurrence.
 */
export type SaveTribeEventPostEventCommand = TribeEventOccurrenceQuery & {
  materials: TribeEventMaterialInput[];
  recordingUrl: string | null;
};

/**
 * "¿Cómo estuvo?": sets the viewer's reaction (null removes it).
 */
export type SetTribeEventOccurrenceReactionCommand = TribeEventOccurrenceQuery & {
  reaction: TribeEventOccurrenceReaction | null;
};

export type CreateTribeEventOccurrenceCommentCommand = TribeEventOccurrenceQuery & {
  content: string;
};

export type DeleteTribeEventOccurrenceCommentCommand = {
  commentId: string;
  tribeSlug: string;
};
