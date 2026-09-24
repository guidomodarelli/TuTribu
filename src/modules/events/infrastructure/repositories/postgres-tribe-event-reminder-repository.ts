import { sql } from "drizzle-orm";

import type {
  ListTribeEventReminderSeriesQuery,
  TribeEventReminderCandidate,
  TribeEventReminderRepository,
  TribeEventReminderSeriesPage,
} from "@/src/modules/events/domain/repositories/tribe-event-reminder-repository";
import {
  TRIBE_EVENT_COLUMNS,
  TRIBE_EVENT_OCCURRENCE_EXCEPTION_COLUMNS,
  buildSeriesInRangePredicate,
  mapCount,
  mapTribeEvent,
  mapTribeEventOccurrenceExceptions,
  type TribeEventDatabaseExecutor,
  type TribeEventOccurrenceExceptionRow,
  type TribeEventRow,
} from "@/src/modules/events/infrastructure/repositories/tribe-event-sql";

type TribeEventReminderSeriesRow = TribeEventRow & { tribe_id: string };

/**
 * Reminder job adapter. It is composed with the maintenance connection (the
 * table owner, no app user): the queries are not scoped to one tribe, and
 * the owner-exception SELECT policies of 20260926120000 let them cross
 * `FORCE ROW LEVEL SECURITY` even where the owner has no BYPASSRLS. Every
 * recipient is still checked against the tribe membership (active or muted)
 * at insert time, so a member who left or was blocked is never notified.
 */
export class PostgresTribeEventReminderRepository implements TribeEventReminderRepository {
  constructor(private readonly executeWithDatabase: TribeEventDatabaseExecutor) {}

  /**
   * One keyset page of series (ordered by id) that can have a date in the
   * range, plus their exceptions in a second query (no N+1). It reads one
   * row past the limit to know whether another page exists.
   */
  async listSeriesInRange({
    afterEventId,
    limit,
    rangeEnd,
    rangeStart,
  }: ListTribeEventReminderSeriesQuery): Promise<TribeEventReminderSeriesPage> {
    return this.executeWithDatabase(async (database) => {
      const cursorFilter = afterEventId ? sql`and events.id > ${afterEventId}::uuid` : sql``;
      const seriesResult = await database.execute(sql`
        select ${TRIBE_EVENT_COLUMNS}, events.tribe_id
        from public.events
        where ${buildSeriesInRangePredicate({ rangeEnd, rangeStart })}
          ${cursorFilter}
        order by events.id asc
        limit ${limit + 1}
      `);
      const rows = (seriesResult.rows ?? []) as TribeEventReminderSeriesRow[];
      const pageRows = rows.slice(0, limit);
      const hasNextPage = rows.length > limit;

      if (pageRows.length === 0) {
        return { nextCursor: null, series: [] };
      }

      const exceptionsResult = await database.execute(sql`
        select ${TRIBE_EVENT_OCCURRENCE_EXCEPTION_COLUMNS}
        from public.event_occurrence_exceptions
        where event_occurrence_exceptions.event_id = any(${sql.param(
          pageRows.map((row) => row.id)
        )}::uuid[])
      `);
      const exceptions = mapTribeEventOccurrenceExceptions(
        (exceptionsResult.rows ?? []) as TribeEventOccurrenceExceptionRow[]
      );

      return {
        nextCursor: hasNextPage ? (pageRows.at(-1)?.id ?? null) : null,
        series: pageRows.map((row) => ({
          event: mapTribeEvent(row),
          exceptions: exceptions.filter((exception) => exception.eventId === row.id),
          tribeId: row.tribe_id,
        })),
      };
    });
  }

  /**
   * Fans every candidate out to the members whose answer for that occurrence
   * is in its statuses and who can still read the tribe, in one statement.
   * `on conflict do nothing` on (recipient, dedupe_key) makes reruns and
   * parallel runs insert each reminder once.
   */
  async enqueueReminders(candidates: readonly TribeEventReminderCandidate[]): Promise<number> {
    if (candidates.length === 0) {
      return 0;
    }

    const candidatesJson = JSON.stringify(
      candidates.map((candidate) => ({
        dedupe_key: candidate.notification.dedupeKey,
        event_id: candidate.eventId,
        occurrence_starts_at: candidate.originalStartsAt,
        payload: candidate.notification.payload,
        statuses: candidate.statuses,
        tribe_id: candidate.tribeId,
        type: candidate.notification.type,
      }))
    );

    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with reminder_candidates as (
          select *
          from jsonb_to_recordset(${candidatesJson}::jsonb) as candidate(
            dedupe_key text,
            event_id uuid,
            occurrence_starts_at timestamptz,
            payload jsonb,
            statuses jsonb,
            tribe_id uuid,
            type text
          )
        ),
        inserted_notifications as (
          insert into public.notifications (
            recipient_user_id,
            tribe_id,
            type,
            payload,
            dedupe_key
          )
          select
            event_attendances.user_id,
            event_attendances.tribe_id,
            reminder_candidates.type,
            reminder_candidates.payload,
            reminder_candidates.dedupe_key
          from reminder_candidates
          inner join public.event_attendances
            on event_attendances.event_id = reminder_candidates.event_id
            and event_attendances.tribe_id = reminder_candidates.tribe_id
            and event_attendances.occurrence_starts_at = reminder_candidates.occurrence_starts_at
          where event_attendances.status in (
              select jsonb_array_elements_text(reminder_candidates.statuses)
            )
            and public.can_receive_tribe_notifications(
              event_attendances.tribe_id,
              event_attendances.user_id
            )
          on conflict (recipient_user_id, dedupe_key) do nothing
          returning notifications.id
        )
        select count(*)::integer as created_count
        from inserted_notifications
      `);

      return mapCount(
        ((result.rows?.[0] ?? null) as { created_count: number | string | null } | null)
          ?.created_count ?? null
      );
    });
  }
}
