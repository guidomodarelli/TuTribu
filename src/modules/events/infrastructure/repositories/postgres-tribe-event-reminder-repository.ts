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
  mapCount,
  mapTribeEvent,
  mapTribeEventOccurrenceExceptions,
  type TribeEventDatabaseExecutor,
  type TribeEventOccurrenceExceptionRow,
  type TribeEventRow,
} from "@/src/modules/events/infrastructure/repositories/tribe-event-sql";

type TribeEventReminderSeriesRow = TribeEventRow & { tribe_id: string };

/**
 * Reminder job adapter. It is composed with the maintenance connection (no
 * app user), which may be the table owner or a dedicated maintenance role
 * that only holds EXECUTE on the owner-only SECURITY DEFINER functions of
 * 20260926120000 (section 8). Every table access therefore goes through
 * those functions and never touches the tables directly: the series and
 * exceptions listings cross every tribe, and the enqueue revalidates each
 * date against the current schedule and exceptions (a date cancelled or
 * moved after the listing committed enqueues nothing) and checks every
 * recipient against the tribe membership (active or muted) at insert time.
 */
export class PostgresTribeEventReminderRepository implements TribeEventReminderRepository {
  constructor(private readonly executeWithDatabase: TribeEventDatabaseExecutor) {}

  /**
   * One keyset page of series (ordered by id) that can have a date in the
   * range, plus their exceptions in a second query (no N+1). The exceptions
   * read is bounded by the same range (`list_tribe_event_reminder_exceptions`
   * returns only the rows whose original slot can overlap it, or whose moved
   * date lands in it), so a long-lived series with years of history never
   * loads its past cancellations and moves on every run. It reads one row
   * past the limit to know whether another page exists.
   */
  async listSeriesInRange({
    afterEventId,
    limit,
    rangeEnd,
    rangeStart,
  }: ListTribeEventReminderSeriesQuery): Promise<TribeEventReminderSeriesPage> {
    return this.executeWithDatabase(async (database) => {
      const seriesResult = await database.execute(sql`
        select ${TRIBE_EVENT_COLUMNS}, events.tribe_id
        from public.list_tribe_event_reminder_series(
          ${rangeStart}::timestamptz,
          ${rangeEnd}::timestamptz,
          ${afterEventId}::uuid,
          ${limit + 1}::integer
        ) as events
        order by events.id asc
      `);
      const rows = (seriesResult.rows ?? []) as TribeEventReminderSeriesRow[];
      const pageRows = rows.slice(0, limit);
      const hasNextPage = rows.length > limit;

      if (pageRows.length === 0) {
        return { nextCursor: null, series: [] };
      }

      const exceptionsResult = await database.execute(sql`
        select ${TRIBE_EVENT_OCCURRENCE_EXCEPTION_COLUMNS}
        from public.list_tribe_event_reminder_exceptions(
          ${sql.param(pageRows.map((row) => row.id))}::uuid[],
          ${rangeStart}::timestamptz,
          ${rangeEnd}::timestamptz
        ) as event_occurrence_exceptions
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
   * is in its statuses and who can still read the tribe, in one call to
   * `enqueue_tribe_event_reminders`. That function locks the event rows
   * `FOR SHARE` (manager writes lock them `FOR UPDATE`) and then skips a
   * candidate whose date is no longer a slot of the series, was cancelled,
   * or whose current effective start differs from `payload.startsAt`, and
   * rechecks each window cutoff (`minimum_lead_minutes`) against
   * `clock_timestamp()` once the locks are held, so a late candidate is not
   * enqueued after its occurrence started (or after the day-before cutoff).
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
        minimum_lead_minutes: candidate.minimumLeadMinutes,
        occurrence_starts_at: candidate.originalStartsAt,
        payload: candidate.notification.payload,
        statuses: candidate.statuses,
        tribe_id: candidate.tribeId,
        type: candidate.notification.type,
      }))
    );

    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        select public.enqueue_tribe_event_reminders(${candidatesJson}::jsonb) as created_count
      `);

      return mapCount(
        ((result.rows?.[0] ?? null) as { created_count: number | string | null } | null)
          ?.created_count ?? null
      );
    });
  }
}
