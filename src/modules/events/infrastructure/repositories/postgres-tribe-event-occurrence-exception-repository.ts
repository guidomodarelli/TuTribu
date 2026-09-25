import { sql } from "drizzle-orm";

import {
  TRIBE_EVENT_MUTATION_STATUS,
  TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND,
} from "@/src/modules/events/constants/tribe-events";
import type {
  TribeEventOccurrenceException,
  TribeEventSchedule,
} from "@/src/modules/events/domain/entities/tribe-event";
import type {
  ListTribeEventExceptionsQuery,
  SaveTribeEventOccurrenceExceptionCommand,
  TribeEventOccurrenceExceptionClearResult,
  TribeEventOccurrenceExceptionRepository,
  TribeEventOccurrenceExceptionSaveResult,
  TribeEventOccurrenceReferenceQuery,
} from "@/src/modules/events/domain/repositories/tribe-event-occurrence-exception-repository";
import {
  TRIBE_EVENT_OCCURRENCE_EXCEPTION_COLUMNS,
  lockViewerMembership,
  mapTribeEventOccurrenceExceptions,
  type TribeEventDatabaseExecutor,
  type TribeEventOccurrenceExceptionRow,
} from "@/src/modules/events/infrastructure/repositories/tribe-event-sql";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

type ExceptionMutationRow = Partial<TribeEventOccurrenceExceptionRow> & {
  /** The saved exception turned a cancelled date into an active (moved) one. */
  reactivated?: boolean | null;
  status: string | null;
};

type ExceptionClearRow = {
  /** An exception was deleted and its date is still a slot of the series. */
  restored: boolean | null;
  status: string | null;
};

function mapFailureStatus(
  status: string | null
):
  | typeof TRIBE_EVENT_MUTATION_STATUS.forbidden
  | typeof TRIBE_EVENT_MUTATION_STATUS.notFound
  | typeof TRIBE_EVENT_MUTATION_STATUS.occurrenceEnded {
  if (
    status === TRIBE_EVENT_MUTATION_STATUS.notFound ||
    status === TRIBE_EVENT_MUTATION_STATUS.occurrenceEnded
  ) {
    return status;
  }

  return TRIBE_EVENT_MUTATION_STATUS.forbidden;
}

function mapSaveFailureStatus(
  status: string | null
):
  | typeof TRIBE_EVENT_MUTATION_STATUS.forbidden
  | typeof TRIBE_EVENT_MUTATION_STATUS.notFound
  | typeof TRIBE_EVENT_MUTATION_STATUS.occurrenceEnded
  | typeof TRIBE_EVENT_MUTATION_STATUS.scheduleChanged {
  return status === TRIBE_EVENT_MUTATION_STATUS.scheduleChanged
    ? TRIBE_EVENT_MUTATION_STATUS.scheduleChanged
    : mapFailureStatus(status);
}

/**
 * Whether the locked event still carries the schedule the use case validated
 * the occurrence against (milliseconds, like the attendance schedule check,
 * because the application parses the schedule with JS dates). Comparing the
 * schedule, not `updated_at`, keeps title or capacity edits from refusing a
 * valid write.
 */
function buildLockedScheduleMatchCondition(schedule: TribeEventSchedule) {
  return sql`
    (
      date_trunc('milliseconds', locked_event.starts_at),
      date_trunc('milliseconds', locked_event.ends_at),
      locked_event.recurrence_frequency,
      date_trunc('milliseconds', locked_event.recurrence_until)
    ) is not distinct from (
      ${schedule.startsAt}::timestamptz,
      ${schedule.endsAt}::timestamptz,
      ${schedule.recurrenceFrequency}::text,
      ${schedule.recurrenceUntil}::timestamptz
    )
  `;
}

/**
 * The target event of a write, resolved through the tribe slug so an
 * exception can never be written for another tribe's event. `locked_event`
 * locks that event row `FOR UPDATE` (only for managers, so a plain member
 * never blocks anyone): attendance answers hold the same row `FOR SHARE`
 * while they read the exception of their date, so a date that is cancelled,
 * moved, or restored concurrently waits for in-flight answers, and answers
 * that start later see the committed exception. It also exposes the schedule
 * of the locked row (the latest committed version under READ COMMITTED), the
 * only one writes may trust.
 *
 * Every write runs `lockViewerMembership` in a previous statement: the
 * `can_manage_tribe_events` checks here keep the statement snapshot even
 * after waiting on the event row, so without that lock a manager demoted,
 * blocked, or removed meanwhile would still write. Lock order stays
 * membership → event row → occurrence advisory lock (refill).
 */
function buildTargetEventCte(eventId: string, tribeSlug: string) {
  return sql`
    target_tribe as (
      select tribes.id
      from public.tribes
      where tribes.slug = ${tribeSlug}
      limit 1
    ),
    target_event as (
      select events.id, events.tribe_id
      from public.events
      inner join target_tribe
        on target_tribe.id = events.tribe_id
      where events.id = ${eventId}
      limit 1
    ),
    locked_event as (
      select
        events.id,
        events.starts_at,
        events.ends_at,
        events.recurrence_frequency,
        events.recurrence_until
      from public.events
      inner join target_event
        on target_event.id = events.id
      where public.can_manage_tribe_events(target_event.tribe_id)
      for update of events
    )
  `;
}

/**
 * Refills the waitlist of one date through `refill_tribe_event_waitlists`,
 * which keeps the lock order (event row, already held by the caller's
 * statement in this transaction, then the occurrence advisory lock) and
 * re-checks the cancellation and the effective end with `clock_timestamp()`
 * under it.
 */
async function refillOccurrenceWaitlist(
  database: RequestDatabase,
  eventId: string,
  originalStartsAt: string
) {
  await database.execute(sql`
    select public.refill_tribe_event_waitlists(
      ${eventId}::uuid,
      array[${originalStartsAt}::timestamptz]
    ) as promoted_count
  `);
}

/**
 * Postgres adapter of the per-occurrence exceptions. Reads repeat
 * `can_read_tribe_content`; writes repeat `can_manage_tribe_events` (the
 * runtime role bypasses RLS). This adapter is the only writer: request roles
 * may only read the table, because RLS cannot enforce the slot, end, and
 * schedule checks these statements run under the event lock.
 */
export class PostgresTribeEventOccurrenceExceptionRepository
  implements TribeEventOccurrenceExceptionRepository
{
  constructor(private readonly executeWithDatabase: TribeEventDatabaseExecutor) {}

  async find({
    eventId,
    originalStartsAt,
    tribeSlug,
  }: TribeEventOccurrenceReferenceQuery): Promise<TribeEventOccurrenceException | null> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        select ${TRIBE_EVENT_OCCURRENCE_EXCEPTION_COLUMNS}
        from public.event_occurrence_exceptions
        inner join public.tribes
          on tribes.id = event_occurrence_exceptions.tribe_id
        where tribes.slug = ${tribeSlug}
          and event_occurrence_exceptions.event_id = ${eventId}
          and event_occurrence_exceptions.original_starts_at = ${originalStartsAt}::timestamptz
          and public.can_read_tribe_content(tribes.id)
        limit 1
      `);
      const [exception] = mapTribeEventOccurrenceExceptions(
        (result.rows ?? []) as TribeEventOccurrenceExceptionRow[]
      );

      return exception ?? null;
    });
  }

  async listByEvent({
    eventId,
    tribeSlug,
  }: ListTribeEventExceptionsQuery): Promise<TribeEventOccurrenceException[]> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        select ${TRIBE_EVENT_OCCURRENCE_EXCEPTION_COLUMNS}
        from public.event_occurrence_exceptions
        inner join public.tribes
          on tribes.id = event_occurrence_exceptions.tribe_id
        where tribes.slug = ${tribeSlug}
          and event_occurrence_exceptions.event_id = ${eventId}
          and public.can_read_tribe_content(tribes.id)
        order by event_occurrence_exceptions.original_starts_at asc
      `);

      return mapTribeEventOccurrenceExceptions(
        (result.rows ?? []) as TribeEventOccurrenceExceptionRow[]
      );
    });
  }

  /**
   * Upserts the exception of one date: the UNIQUE (event_id,
   * original_starts_at) key makes a repeated save (retry, double click, or a
   * cancelled date that is later moved) replace the previous one. The use
   * case validated the date in an earlier transaction, so the write only
   * happens when the locked event still has that validated schedule
   * (otherwise `schedule_changed`) and, re-checked with `clock_timestamp()`
   * after the lock, the date has not ended at its current effective times
   * and a move does not land on a schedule that already ended (otherwise
   * `occurrence_ended`): a write that waited on the lock past the end, or
   * whose host clock lags behind, cannot rewrite frozen history.
   *
   * Moving a cancelled date reactivates it: every refill path skipped it while
   * it was cancelled, so its waitlist is refilled in the same transaction,
   * like a restore.
   */
  async save(
    command: SaveTribeEventOccurrenceExceptionCommand
  ): Promise<TribeEventOccurrenceExceptionSaveResult> {
    const isMoved = command.kind === TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND.moved;

    return this.executeWithDatabase(async (database) => {
      await lockViewerMembership(database, command.tribeSlug);
      const result = await database.execute(sql`
        with ${buildTargetEventCte(command.eventId, command.tribeSlug)},
        validated_event as (
          select locked_event.id, locked_event.starts_at, locked_event.ends_at
          from locked_event
          where ${buildLockedScheduleMatchCondition(command.schedule)}
        ),
        -- Read under the event lock: every exception write holds it, so the
        -- current exception cannot change until this transaction ends.
        occurrence_state as (
          select
            validated_event.id,
            current_state.is_cancelled as was_cancelled,
            (
              current_state.effective_ends_at <= clock_timestamp()
              or (
                ${isMoved}::boolean
                and coalesce(
                  ${command.newEndsAt}::timestamptz,
                  public.tribe_event_occurrence_ends_at(
                    ${command.newStartsAt}::timestamptz,
                    validated_event.starts_at,
                    validated_event.ends_at
                  )
                ) <= clock_timestamp()
              )
            ) as has_ended
          from validated_event
          cross join lateral public.resolve_tribe_event_occurrence_exception(
            validated_event.id,
            ${command.originalStartsAt}::timestamptz,
            validated_event.starts_at,
            validated_event.ends_at
          ) as current_state
        ),
        open_occurrence as (
          select occurrence_state.id, occurrence_state.was_cancelled
          from occurrence_state
          where not occurrence_state.has_ended
        ),
        saved_exception as (
          insert into public.event_occurrence_exceptions as event_occurrence_exceptions (
            event_id,
            tribe_id,
            original_starts_at,
            kind,
            new_starts_at,
            new_ends_at,
            reason,
            created_by,
            created_at,
            updated_at
          )
          select
            target_event.id,
            target_event.tribe_id,
            ${command.originalStartsAt}::timestamptz,
            ${command.kind},
            ${command.newStartsAt}::timestamptz,
            ${command.newEndsAt}::timestamptz,
            ${command.reason},
            public.current_app_user_id(),
            timezone('utc', now()),
            timezone('utc', now())
          from target_event
          inner join open_occurrence
            on open_occurrence.id = target_event.id
          where public.can_manage_tribe_events(target_event.tribe_id)
          on conflict (event_id, original_starts_at) do update set
            kind = excluded.kind,
            new_starts_at = excluded.new_starts_at,
            new_ends_at = excluded.new_ends_at,
            reason = excluded.reason,
            updated_at = excluded.updated_at
          returning ${TRIBE_EVENT_OCCURRENCE_EXCEPTION_COLUMNS}
        )
        select
          case
            when exists (select 1 from saved_exception) then ${TRIBE_EVENT_MUTATION_STATUS.exceptionSaved}
            when not exists (select 1 from target_event) then ${TRIBE_EVENT_MUTATION_STATUS.notFound}
            -- Validated schedule, but the date ended once the lock was held.
            when exists (select 1 from occurrence_state) then ${TRIBE_EVENT_MUTATION_STATUS.occurrenceEnded}
            -- Locked (so the viewer manages events) but not validated.
            when exists (select 1 from locked_event) then ${TRIBE_EVENT_MUTATION_STATUS.scheduleChanged}
            else ${TRIBE_EVENT_MUTATION_STATUS.forbidden}
          end as status,
          (
            ${isMoved}::boolean
            and exists (select 1 from saved_exception)
            and coalesce((select open_occurrence.was_cancelled from open_occurrence), false)
          ) as reactivated,
          saved_exception.*
        from (select 1) result
        left join saved_exception
          on true
      `);
      const row = (result.rows?.[0] ?? null) as ExceptionMutationRow | null;

      if (row?.status !== TRIBE_EVENT_MUTATION_STATUS.exceptionSaved) {
        return { status: mapSaveFailureStatus(row?.status ?? null) };
      }

      const [exception] = mapTribeEventOccurrenceExceptions([
        row as TribeEventOccurrenceExceptionRow,
      ]);

      if (!exception) {
        return { status: TRIBE_EVENT_MUTATION_STATUS.forbidden };
      }

      if (row.reactivated === true) {
        await refillOccurrenceWaitlist(database, command.eventId, command.originalStartsAt);
      }

      return { exception, status: TRIBE_EVENT_MUTATION_STATUS.exceptionSaved };
    });
  }

  /**
   * Deletes the exception of one date and, when one was deleted and the date
   * is still a slot of the locked schedule, refills its waitlist in the same
   * transaction: every refill path skips a cancelled date, so seats freed
   * while it was cancelled (a capacity increase, an attendee who became
   * inactive) would stay empty until another write.
   *
   * Like a save, it re-checks the end with `clock_timestamp()` under the
   * event lock and answers `occurrence_ended` without deleting when the date
   * ended at its current effective times or when the original slot it would
   * return to already ended (a past date moved into the future stays frozen,
   * so its preserved answers never re-enter the history or the streak).
   */
  async clear({
    eventId,
    originalStartsAt,
    tribeSlug,
  }: TribeEventOccurrenceReferenceQuery): Promise<TribeEventOccurrenceExceptionClearResult> {
    return this.executeWithDatabase(async (database) => {
      await lockViewerMembership(database, tribeSlug);
      const result = await database.execute(sql`
        with ${buildTargetEventCte(eventId, tribeSlug)},
        occurrence_slot as (
          select
            locked_event.id,
            locked_event.starts_at,
            locked_event.ends_at,
            public.is_tribe_event_series_occurrence(
              ${originalStartsAt}::timestamptz,
              locked_event.starts_at,
              locked_event.recurrence_frequency,
              locked_event.recurrence_until
            ) as is_series_slot
          from locked_event
        ),
        -- Read under the event lock: every exception write holds it.
        occurrence_state as (
          select
            occurrence_slot.id,
            occurrence_slot.is_series_slot,
            (
              (
                occurrence_slot.is_series_slot
                and public.tribe_event_occurrence_ends_at(
                  ${originalStartsAt}::timestamptz,
                  occurrence_slot.starts_at,
                  occurrence_slot.ends_at
                ) <= clock_timestamp()
              )
              or (
                exists (
                  select 1
                  from public.event_occurrence_exceptions as current_exception
                  where current_exception.event_id = occurrence_slot.id
                    and current_exception.original_starts_at = ${originalStartsAt}::timestamptz
                )
                and current_state.effective_ends_at <= clock_timestamp()
              )
            ) as has_ended
          from occurrence_slot
          cross join lateral public.resolve_tribe_event_occurrence_exception(
            occurrence_slot.id,
            ${originalStartsAt}::timestamptz,
            occurrence_slot.starts_at,
            occurrence_slot.ends_at
          ) as current_state
        ),
        restorable_occurrence as (
          select occurrence_state.id, occurrence_state.is_series_slot
          from occurrence_state
          where not occurrence_state.has_ended
        ),
        deleted_exception as (
          delete from public.event_occurrence_exceptions
          using target_event, restorable_occurrence
          where restorable_occurrence.id = target_event.id
            and event_occurrence_exceptions.event_id = target_event.id
            and event_occurrence_exceptions.original_starts_at = ${originalStartsAt}::timestamptz
            and public.can_manage_tribe_events(target_event.tribe_id)
          returning event_occurrence_exceptions.id
        )
        select
          case
            when not exists (select 1 from target_event) then ${TRIBE_EVENT_MUTATION_STATUS.notFound}
            when exists (select 1 from occurrence_state where occurrence_state.has_ended)
              then ${TRIBE_EVENT_MUTATION_STATUS.occurrenceEnded}
            when exists (select 1 from deleted_exception)
              or public.can_manage_tribe_events((select tribe_id from target_event))
              then ${TRIBE_EVENT_MUTATION_STATUS.exceptionCleared}
            else ${TRIBE_EVENT_MUTATION_STATUS.forbidden}
          end as status,
          exists (
            select 1
            from deleted_exception
            cross join restorable_occurrence
            where restorable_occurrence.is_series_slot
          ) as restored
      `);
      const row = (result.rows?.[0] ?? null) as ExceptionClearRow | null;
      const status = row?.status ?? null;

      if (status !== TRIBE_EVENT_MUTATION_STATUS.exceptionCleared) {
        return { status: mapFailureStatus(status) };
      }

      if (row?.restored === true) {
        await refillOccurrenceWaitlist(database, eventId, originalStartsAt);
      }

      return { status };
    });
  }
}
