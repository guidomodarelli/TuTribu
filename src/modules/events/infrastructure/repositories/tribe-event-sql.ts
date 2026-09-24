import { sql } from "drizzle-orm";

import {
  TRIBE_EVENT_DEFAULT_DURATION_MINUTES,
  TRIBE_EVENT_DEFAULT_TYPE,
  TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND,
  TRIBE_EVENT_RANGE_MATCH,
  TRIBE_EVENT_RECURRENCE_FREQUENCY,
  TRIBE_EVENT_TYPE,
} from "@/src/modules/events/constants/tribe-events";
import type {
  TribeEvent,
  TribeEventDateRange,
  TribeEventOccurrenceException,
  TribeEventOccurrenceExceptionKind,
  TribeEventRangeMatch,
  TribeEventRecurrenceFrequency,
  TribeEventType,
} from "@/src/modules/events/domain/entities/tribe-event";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

/**
 * SQL fragments and row mappers shared by the events repositories (series,
 * occurrence exceptions, and proposals). Rows are consumed with the minimal
 * narrowing their adapter needs; they are not revalidated with schemas.
 */

/**
 * Runs a callback inside the request-scoped transaction
 * (`withRequestContext`), which sets `app.current_user_id` for the guards.
 */
export type TribeEventDatabaseExecutor = <T>(
  callback: (database: RequestDatabase) => Promise<T>
) => Promise<T>;

/**
 * Duration of every occurrence of a series (needs an `events` row in scope):
 * its explicit end minus its start, or the default duration when it has no
 * end (same rule as `getTribeEventOccurrenceEndTime`). Used to match
 * occurrences by overlap.
 */
export const TRIBE_EVENT_OCCURRENCE_DURATION = sql`
  (
    coalesce(
      events.ends_at,
      events.starts_at + make_interval(mins => ${TRIBE_EVENT_DEFAULT_DURATION_MINUTES}::integer)
    ) - events.starts_at
  )
`;

export type TribeEventRow = {
  capacity: number | string | null;
  description: string | null;
  ends_at: Date | string | null;
  event_type: string | null;
  id: string;
  meeting_url: string | null;
  recurrence_frequency: string;
  recurrence_until: Date | string | null;
  starts_at: Date | string;
  title: string;
};

export type TribeEventOccurrenceExceptionRow = {
  event_id: string;
  kind: string | null;
  new_ends_at: Date | string | null;
  new_starts_at: Date | string | null;
  original_starts_at: Date | string;
  reason: string | null;
};

const COUNT_BASE = 10;

export const TRIBE_EVENT_COLUMNS = sql`
  events.id,
  events.capacity,
  events.title,
  events.description,
  events.meeting_url,
  events.starts_at,
  events.ends_at,
  events.recurrence_frequency,
  events.recurrence_until,
  events.event_type
`;

export const RETURNING_TRIBE_EVENT_COLUMNS = sql`
  returning
    events.id,
    events.capacity,
    events.title,
    events.description,
    events.meeting_url,
    events.starts_at,
    events.ends_at,
    events.recurrence_frequency,
    events.recurrence_until,
    events.event_type
`;

export const TRIBE_EVENT_OCCURRENCE_EXCEPTION_COLUMNS = sql`
  event_occurrence_exceptions.event_id,
  event_occurrence_exceptions.original_starts_at,
  event_occurrence_exceptions.kind,
  event_occurrence_exceptions.new_starts_at,
  event_occurrence_exceptions.new_ends_at,
  event_occurrence_exceptions.reason
`;

export function mapDateValue(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function mapNullableDateValue(value: Date | string | null): string | null {
  return value ? mapDateValue(value) : null;
}

export function mapCount(value: number | string | null): number {
  if (typeof value === "number") {
    return value;
  }

  const parsed = value === null ? Number.NaN : Number.parseInt(value, COUNT_BASE);

  return Number.isFinite(parsed) ? parsed : 0;
}

export function mapNullableCount(value: number | string | null): number | null {
  return value === null ? null : mapCount(value);
}

function mapRecurrenceFrequency(value: string | null): TribeEventRecurrenceFrequency {
  return (
    Object.values(TRIBE_EVENT_RECURRENCE_FREQUENCY).find((frequency) => frequency === value) ??
    TRIBE_EVENT_RECURRENCE_FREQUENCY.none
  );
}

/**
 * Narrows a stored type to the catalog; an unknown value (never expected,
 * the CHECK forbids it) falls back to the default type.
 */
export function mapTribeEventType(value: string | null): TribeEventType {
  return (
    Object.values(TRIBE_EVENT_TYPE).find((eventType) => eventType === value) ??
    TRIBE_EVENT_DEFAULT_TYPE
  );
}

export function mapTribeEvent(row: TribeEventRow): TribeEvent {
  return {
    capacity: mapNullableCount(row.capacity),
    description: row.description,
    endsAt: mapNullableDateValue(row.ends_at),
    eventType: mapTribeEventType(row.event_type),
    id: row.id,
    meetingUrl: row.meeting_url,
    recurrenceFrequency: mapRecurrenceFrequency(row.recurrence_frequency),
    recurrenceUntil: mapNullableDateValue(row.recurrence_until),
    startsAt: mapDateValue(row.starts_at),
    title: row.title,
  };
}

function mapExceptionKind(value: string | null): TribeEventOccurrenceExceptionKind | null {
  return (
    Object.values(TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND).find((kind) => kind === value) ?? null
  );
}

/**
 * Maps exception rows, dropping a row with an unknown kind instead of
 * failing the whole listing.
 */
export function mapTribeEventOccurrenceExceptions(
  rows: TribeEventOccurrenceExceptionRow[]
): TribeEventOccurrenceException[] {
  return rows.flatMap((row) => {
    const kind = mapExceptionKind(row.kind);

    return kind
      ? [
          {
            eventId: row.event_id,
            kind,
            newEndsAt: mapNullableDateValue(row.new_ends_at),
            newStartsAt: mapNullableDateValue(row.new_starts_at),
            originalStartsAt: mapDateValue(row.original_starts_at),
            reason: row.reason,
          },
        ]
      : [];
  });
}

/**
 * Exceptions of a tribe (optionally of one event) whose original slot or
 * moved slot overlaps `[rangeStart, rangeEnd)` (start before the range end,
 * effective end after the range start): a date moved out of the range is
 * needed to hide it, a date moved into the range to show it, and an
 * in-progress date that started before the range still needs its exception.
 * This is a superset of the "starts within" match; the domain expansion
 * decides the final matching. Guarded by `can_read_tribe_content` because
 * the runtime role bypasses RLS.
 */
export function buildTribeEventExceptionsInRangeQuery({
  eventId,
  rangeEnd,
  rangeStart,
  tribeSlug,
}: TribeEventDateRange & { eventId?: string; tribeSlug: string }) {
  const eventFilter = eventId
    ? sql`and event_occurrence_exceptions.event_id = ${eventId}`
    : sql``;

  return sql`
    select ${TRIBE_EVENT_OCCURRENCE_EXCEPTION_COLUMNS}
    from public.event_occurrence_exceptions
    inner join public.tribes
      on tribes.id = event_occurrence_exceptions.tribe_id
    inner join public.events
      on events.id = event_occurrence_exceptions.event_id
    where tribes.slug = ${tribeSlug}
      and public.can_read_tribe_content(tribes.id)
      ${eventFilter}
      and (
        (
          event_occurrence_exceptions.original_starts_at < ${rangeEnd}
          and event_occurrence_exceptions.original_starts_at
            + ${TRIBE_EVENT_OCCURRENCE_DURATION} > ${rangeStart}
        )
        or (
          event_occurrence_exceptions.kind = ${TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND.moved}
          and event_occurrence_exceptions.new_starts_at < ${rangeEnd}
          and coalesce(
            event_occurrence_exceptions.new_ends_at,
            event_occurrence_exceptions.new_starts_at + ${TRIBE_EVENT_OCCURRENCE_DURATION}
          ) > ${rangeStart}
        )
      )
    order by event_occurrence_exceptions.original_starts_at asc
  `;
}

/**
 * Moved dates that belong to the range, as a SQL predicate that needs an
 * `events` row in scope (for the series duration). With `overlaps` a moved
 * date matches while its effective interval (its new end, or its new start
 * plus the series duration) overlaps the range; with `startsWithin` its new
 * start must fall inside the range. `originalStartsAtColumn` narrows the
 * predicate to one answered slot (attendance rows keep the original start).
 * Moved dates bring their series into a listing even when the series itself
 * ended before the range (the last date moved later).
 */
export function buildMovedIntoRangePredicate(
  { rangeEnd, rangeStart }: TribeEventDateRange,
  rangeMatch: TribeEventRangeMatch,
  originalStartsAtColumn?: ReturnType<typeof sql>
) {
  const slotFilter = originalStartsAtColumn
    ? sql`and moved_exceptions.original_starts_at = ${originalStartsAtColumn}`
    : sql``;
  const rangeFilter =
    rangeMatch === TRIBE_EVENT_RANGE_MATCH.overlaps
      ? sql`
          and moved_exceptions.new_starts_at < ${rangeEnd}
          and coalesce(
            moved_exceptions.new_ends_at,
            moved_exceptions.new_starts_at + ${TRIBE_EVENT_OCCURRENCE_DURATION}
          ) > ${rangeStart}
        `
      : sql`
          and moved_exceptions.new_starts_at >= ${rangeStart}
          and moved_exceptions.new_starts_at < ${rangeEnd}
        `;

  return sql`
    exists (
      select 1
      from public.event_occurrence_exceptions moved_exceptions
      where moved_exceptions.event_id = events.id
        and moved_exceptions.kind = ${TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND.moved}
        ${slotFilter}
        ${rangeFilter}
    )
  `;
}

/**
 * Predicate on an `events` row: a series with at least one occurrence whose
 * interval (start to effective end, see `TRIBE_EVENT_OCCURRENCE_DURATION`)
 * overlaps `[rangeStart, rangeEnd)`, or a series with a date moved into the
 * range. It is a superset of "starts within the range", so callers pick
 * their own matching through the occurrence expansion. Shared by the
 * calendar listing and the calendar feed.
 */
export function buildSeriesInRangePredicate({ rangeEnd, rangeStart }: TribeEventDateRange) {
  return sql`
    (
      (
        events.starts_at < ${rangeEnd}
        and (
          (
            events.recurrence_frequency = ${TRIBE_EVENT_RECURRENCE_FREQUENCY.none}
            and events.starts_at + ${TRIBE_EVENT_OCCURRENCE_DURATION} > ${rangeStart}
          )
          or (
            events.recurrence_frequency <> ${TRIBE_EVENT_RECURRENCE_FREQUENCY.none}
            and (
              events.recurrence_until is null
              or events.recurrence_until + ${TRIBE_EVENT_OCCURRENCE_DURATION} > ${rangeStart}
            )
          )
        )
      )
      or ${buildMovedIntoRangePredicate({ rangeEnd, rangeStart }, TRIBE_EVENT_RANGE_MATCH.overlaps)}
    )
  `;
}
