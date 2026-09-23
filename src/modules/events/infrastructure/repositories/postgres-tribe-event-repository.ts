import { sql } from "drizzle-orm";

import {
  TRIBE_EVENT_ATTENDANCE_STATUS,
  TRIBE_EVENT_ATTENDEE_PREVIEW_LIMIT,
  TRIBE_EVENT_MUTATION_STATUS,
  TRIBE_EVENT_RECURRENCE_FREQUENCY,
} from "@/src/modules/events/constants/tribe-events";
import type {
  TribeEvent,
  TribeEventAttendanceOption,
  TribeEventAttendanceStatus,
  TribeEventAttendee,
  TribeEventAttendeePreview,
  TribeEventDateRange,
  TribeEventRecurrenceFrequency,
} from "@/src/modules/events/domain/entities/tribe-event";
import type {
  DeleteTribeEventRepositoryCommand,
  FindTribeEventQuery,
  GetTribeEventAttendanceReportQuery,
  ListTribeEventsByRangeQuery,
  ListViewerAttendanceHistoryQuery,
  PersistTribeEventCommand,
  PersistTribeEventUpdateCommand,
  SetTribeEventAttendanceRepositoryCommand,
  TribeEventAttendanceKey,
  TribeEventAttendanceReportLookup,
  TribeEventAttendanceResult,
  TribeEventAttendanceSummary,
  TribeEventCreationResult,
  TribeEventDeletionResult,
  TribeEventOccurrenceAttendance,
  TribeEventRangeListing,
  TribeEventRepository,
  TribeEventUpdateResult,
  TribeEventViewerAttendanceHistory,
} from "@/src/modules/events/domain/repositories/tribe-event-repository";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

type DatabaseExecutor = <T>(
  callback: (database: RequestDatabase) => Promise<T>
) => Promise<T>;

type EventRow = {
  capacity: number | string | null;
  description: string | null;
  ends_at: Date | string | null;
  id: string;
  meeting_url: string | null;
  recurrence_frequency: string;
  recurrence_until: Date | string | null;
  starts_at: Date | string;
  title: string;
};

type EventListRow = {
  can_manage_events: boolean | null;
  capacity: number | string | null;
  description: string | null;
  ends_at: Date | string | null;
  id: string | null;
  meeting_url: string | null;
  recurrence_frequency: string | null;
  recurrence_until: Date | string | null;
  starts_at: Date | string | null;
  title: string | null;
};

type AttendanceSummaryRow = {
  event_id: string;
  going_count: number | string | null;
  going_preview: unknown;
  maybe_count: number | string | null;
  occurrence_starts_at: Date | string;
  viewer_status: string | null;
  viewer_waitlist_position: number | string | null;
  waitlisted_count: number | string | null;
};

type ViewerAttendanceRow = {
  event_id: string;
  occurrence_starts_at: Date | string;
  status: string | null;
};

type AttendeeRow = {
  name: string | null;
  responded_at: Date | string;
  status: string | null;
};

type ReportAccessRow = {
  status: string | null;
};

type TrendRow = {
  going_count: number | string | null;
  occurrence_starts_at: Date | string;
};

type AttendancePreviewValue = {
  id?: unknown;
  image?: unknown;
  name?: unknown;
} | null;

type EventMutationRow = EventRow & {
  status: string | null;
};

type EventDeletionRow = {
  status: string | null;
};

type AttendanceResponseRow = {
  attendance_status: string | null;
  outcome: string | null;
  promoted_count: number | string | null;
};

/**
 * Outcomes returned by `public.respond_to_tribe_event_occurrence`.
 */
const ATTENDANCE_RESPONSE_OUTCOME = {
  cleared: "cleared",
  forbidden: "forbidden",
  invalid: "invalid",
  notFound: "not_found",
  saved: "saved",
} as const;
/**
 * Status order of the manager attendee list: who goes first, the waitlist in
 * FIFO order, then maybe and not going.
 */
const ATTENDEE_STATUS_ORDER = [
  TRIBE_EVENT_ATTENDANCE_STATUS.going,
  TRIBE_EVENT_ATTENDANCE_STATUS.waitlisted,
  TRIBE_EVENT_ATTENDANCE_STATUS.maybe,
  TRIBE_EVENT_ATTENDANCE_STATUS.notGoing,
] as const;
const SINGLE_OCCURRENCE_RANGE_MS = 1;
const EVENT_COLUMNS = sql`
  events.id,
  events.capacity,
  events.title,
  events.description,
  events.meeting_url,
  events.starts_at,
  events.ends_at,
  events.recurrence_frequency,
  events.recurrence_until
`;
const RETURNING_EVENT_COLUMNS = sql`
  returning
    events.id,
    events.capacity,
    events.title,
    events.description,
    events.meeting_url,
    events.starts_at,
    events.ends_at,
    events.recurrence_frequency,
    events.recurrence_until
`;
const COUNT_BASE = 10;

function mapDateValue(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapNullableDateValue(value: Date | string | null): string | null {
  return value ? mapDateValue(value) : null;
}

function mapRecurrenceFrequency(value: string | null): TribeEventRecurrenceFrequency {
  const frequencies = Object.values(TRIBE_EVENT_RECURRENCE_FREQUENCY);

  return (
    frequencies.find((frequency) => frequency === value) ??
    TRIBE_EVENT_RECURRENCE_FREQUENCY.none
  );
}

function mapAttendanceStatus(value: string | null): TribeEventAttendanceStatus | null {
  return (
    Object.values(TRIBE_EVENT_ATTENDANCE_STATUS).find((status) => status === value) ??
    null
  );
}

function mapCount(value: number | string | null): number {
  if (typeof value === "number") {
    return value;
  }

  const parsed = value === null ? Number.NaN : Number.parseInt(value, COUNT_BASE);

  return Number.isFinite(parsed) ? parsed : 0;
}

function mapNullableCount(value: number | string | null): number | null {
  return value === null ? null : mapCount(value);
}

function mapEvent(row: EventRow): TribeEvent {
  return {
    capacity: mapNullableCount(row.capacity),
    description: row.description,
    endsAt: mapNullableDateValue(row.ends_at),
    id: row.id,
    meetingUrl: row.meeting_url,
    recurrenceFrequency: mapRecurrenceFrequency(row.recurrence_frequency),
    recurrenceUntil: mapNullableDateValue(row.recurrence_until),
    startsAt: mapDateValue(row.starts_at),
    title: row.title,
  };
}

function isEventRow(row: EventListRow): row is EventListRow & EventRow {
  return row.id !== null && row.starts_at !== null && row.title !== null;
}

function mapEventRows(rows: EventListRow[]): TribeEvent[] {
  return rows.reduce<TribeEvent[]>((mappedEvents, row) => {
    if (isEventRow(row)) {
      mappedEvents.push(mapEvent(row));
    }

    return mappedEvents;
  }, []);
}

/**
 * Maps the `going_preview` JSON array built by the summary query, dropping
 * any malformed entry instead of failing the whole listing.
 */
function mapGoingPreview(value: unknown): TribeEventAttendeePreview[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.reduce<TribeEventAttendeePreview[]>(
    (previews, entry: AttendancePreviewValue) => {
      if (entry && typeof entry.id === "string" && typeof entry.name === "string") {
        previews.push({
          id: entry.id,
          image: typeof entry.image === "string" ? entry.image : null,
          name: entry.name,
        });
      }

      return previews;
    },
    []
  );
}

function mapAttendanceSummaryFields(row: AttendanceSummaryRow): TribeEventAttendanceSummary {
  return {
    goingCount: mapCount(row.going_count),
    goingPreview: mapGoingPreview(row.going_preview),
    maybeCount: mapCount(row.maybe_count),
    viewerStatus: mapAttendanceStatus(row.viewer_status),
    viewerWaitlistPosition: mapNullableCount(row.viewer_waitlist_position),
    waitlistedCount: mapCount(row.waitlisted_count),
  };
}

function mapAttendanceSummary(row: AttendanceSummaryRow): TribeEventOccurrenceAttendance {
  return {
    ...mapAttendanceSummaryFields(row),
    eventId: row.event_id,
    occurrenceStartsAt: mapDateValue(row.occurrence_starts_at),
  };
}

function createEmptyAttendanceSummary(): TribeEventAttendanceSummary {
  return {
    goingCount: 0,
    goingPreview: [],
    maybeCount: 0,
    viewerStatus: null,
    viewerWaitlistPosition: null,
    waitlistedCount: 0,
  };
}

function mapAttendee(row: AttendeeRow): TribeEventAttendee | null {
  const status = mapAttendanceStatus(row.status);

  return status && row.name !== null
    ? { name: row.name, respondedAt: mapDateValue(row.responded_at), status }
    : null;
}

function mapFailureStatus(
  status: string | null
): typeof TRIBE_EVENT_MUTATION_STATUS.forbidden | typeof TRIBE_EVENT_MUTATION_STATUS.notFound {
  return status === TRIBE_EVENT_MUTATION_STATUS.notFound
    ? TRIBE_EVENT_MUTATION_STATUS.notFound
    : TRIBE_EVENT_MUTATION_STATUS.forbidden;
}

function mapResponseFailureStatus(
  outcome: string | null
): typeof TRIBE_EVENT_MUTATION_STATUS.forbidden | typeof TRIBE_EVENT_MUTATION_STATUS.notFound {
  return outcome === ATTENDANCE_RESPONSE_OUTCOME.notFound
    ? TRIBE_EVENT_MUTATION_STATUS.notFound
    : TRIBE_EVENT_MUTATION_STATUS.forbidden;
}

function mapCreationResult(row: EventMutationRow | null): TribeEventCreationResult {
  if (row?.status === TRIBE_EVENT_MUTATION_STATUS.created) {
    return { event: mapEvent(row), status: row.status };
  }

  return { status: mapFailureStatus(row?.status ?? null) };
}

function mapUpdateResult(row: EventMutationRow | null): TribeEventUpdateResult {
  if (row?.status === TRIBE_EVENT_MUTATION_STATUS.updated) {
    return { event: mapEvent(row), status: row.status };
  }

  return { status: mapFailureStatus(row?.status ?? null) };
}

function mapDeletionResult(row: EventDeletionRow | null): TribeEventDeletionResult {
  if (
    row?.status === TRIBE_EVENT_MUTATION_STATUS.deleted ||
    row?.status === TRIBE_EVENT_MUTATION_STATUS.notFound
  ) {
    return { status: row.status };
  }

  return { status: TRIBE_EVENT_MUTATION_STATUS.forbidden };
}

/**
 * Series of the tribe whose occurrences can fall in `[rangeStart, rangeEnd)`,
 * guarded by `can_read_tribe_content` because the runtime role bypasses RLS.
 * Always returns at least one row carrying the viewer permissions.
 */
function buildEventsInRangeQuery({
  rangeEnd,
  rangeStart,
  tribeSlug,
}: TribeEventDateRange & { tribeSlug: string }) {
  return sql`
    with target_tribe as (
      select tribes.id
      from public.tribes
      where tribes.slug = ${tribeSlug}
      limit 1
    ),
    viewer_permissions as (
      select coalesce(public.can_manage_tribe_events((select id from target_tribe)), false) as can_manage_events
    ),
    event_rows as (
      select ${EVENT_COLUMNS}
      from public.events
      inner join target_tribe
        on target_tribe.id = events.tribe_id
      where public.can_read_tribe_content(target_tribe.id)
        and events.starts_at < ${rangeEnd}
        and (
          (
            events.recurrence_frequency = ${TRIBE_EVENT_RECURRENCE_FREQUENCY.none}
            and events.starts_at >= ${rangeStart}
          )
          or (
            events.recurrence_frequency <> ${TRIBE_EVENT_RECURRENCE_FREQUENCY.none}
            and (
              events.recurrence_until is null
              or events.recurrence_until >= ${rangeStart}
            )
          )
        )
    )
    select
      event_rows.id,
      event_rows.capacity,
      event_rows.title,
      event_rows.description,
      event_rows.meeting_url,
      event_rows.starts_at,
      event_rows.ends_at,
      event_rows.recurrence_frequency,
      event_rows.recurrence_until,
      viewer_permissions.can_manage_events
    from viewer_permissions
    left join event_rows
      on true
    order by event_rows.starts_at asc, event_rows.title asc
  `;
}

/**
 * One aggregated row per answered occurrence in the range (optionally of a
 * single event): totals per status, the viewer answer and waitlist position,
 * and a bounded JSON preview of who is going. A single statement for the
 * whole range avoids one query per occurrence; the "user" join only touches
 * preview rows and never selects the email.
 */
function buildAttendanceSummaryQuery({
  eventId,
  rangeEnd,
  rangeStart,
  tribeSlug,
}: TribeEventDateRange & { eventId?: string; tribeSlug: string }) {
  const eventFilter = eventId ? sql`and event_attendances.event_id = ${eventId}` : sql``;

  return sql`
    with ranked_attendances as (
      select
        event_attendances.event_id,
        event_attendances.occurrence_starts_at,
        event_attendances.user_id,
        event_attendances.status,
        row_number() over (
          partition by
            event_attendances.event_id,
            event_attendances.occurrence_starts_at,
            event_attendances.status
          order by event_attendances.responded_at asc, event_attendances.id asc
        ) as status_rank
      from public.event_attendances
      inner join public.tribes
        on tribes.id = event_attendances.tribe_id
      where tribes.slug = ${tribeSlug}
        and public.can_read_tribe_content(tribes.id)
        and event_attendances.occurrence_starts_at >= ${rangeStart}
        and event_attendances.occurrence_starts_at < ${rangeEnd}
        ${eventFilter}
    )
    select
      ranked_attendances.event_id,
      ranked_attendances.occurrence_starts_at,
      count(*) filter (
        where ranked_attendances.status = ${TRIBE_EVENT_ATTENDANCE_STATUS.going}
      ) as going_count,
      count(*) filter (
        where ranked_attendances.status = ${TRIBE_EVENT_ATTENDANCE_STATUS.maybe}
      ) as maybe_count,
      count(*) filter (
        where ranked_attendances.status = ${TRIBE_EVENT_ATTENDANCE_STATUS.waitlisted}
      ) as waitlisted_count,
      max(ranked_attendances.status) filter (
        where ranked_attendances.user_id = public.current_app_user_id()
      ) as viewer_status,
      max(ranked_attendances.status_rank) filter (
        where ranked_attendances.user_id = public.current_app_user_id()
          and ranked_attendances.status = ${TRIBE_EVENT_ATTENDANCE_STATUS.waitlisted}
      ) as viewer_waitlist_position,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', preview_users.id,
            'name', preview_users.name,
            'image', preview_users.image
          )
          order by ranked_attendances.status_rank
        ) filter (where preview_users.id is not null),
        '[]'::jsonb
      ) as going_preview
    from ranked_attendances
    left join public."user" preview_users
      on preview_users.id = ranked_attendances.user_id
      and ranked_attendances.status = ${TRIBE_EVENT_ATTENDANCE_STATUS.going}
      and ranked_attendances.status_rank <= ${TRIBE_EVENT_ATTENDEE_PREVIEW_LIMIT}
    group by ranked_attendances.event_id, ranked_attendances.occurrence_starts_at
  `;
}

export class PostgresTribeEventRepository implements TribeEventRepository {
  constructor(private readonly executeWithDatabase: DatabaseExecutor) {}

  async listByTribeRange({
    rangeEnd,
    rangeStart,
    tribeSlug,
  }: ListTribeEventsByRangeQuery): Promise<TribeEventRangeListing> {
    return this.executeWithDatabase(async (database) => {
      const eventsResult = await database.execute(
        buildEventsInRangeQuery({ rangeEnd, rangeStart, tribeSlug })
      );
      const eventRows = (eventsResult.rows ?? []) as EventListRow[];
      const events = mapEventRows(eventRows);
      const viewerPermissions = {
        canManageEvents: Boolean(eventRows[0]?.can_manage_events),
      };

      if (events.length === 0) {
        return { attendances: [], events, viewerPermissions };
      }

      const attendanceResult = await database.execute(
        buildAttendanceSummaryQuery({ rangeEnd, rangeStart, tribeSlug })
      );
      const attendanceRows = (attendanceResult.rows ?? []) as AttendanceSummaryRow[];

      return {
        attendances: attendanceRows.map(mapAttendanceSummary),
        events,
        viewerPermissions,
      };
    });
  }

  async listViewerAttendanceHistory({
    rangeEnd,
    rangeStart,
    tribeSlug,
  }: ListViewerAttendanceHistoryQuery): Promise<TribeEventViewerAttendanceHistory> {
    return this.executeWithDatabase(async (database) => {
      const eventsResult = await database.execute(
        buildEventsInRangeQuery({ rangeEnd, rangeStart, tribeSlug })
      );
      const events = mapEventRows((eventsResult.rows ?? []) as EventListRow[]);

      if (events.length === 0) {
        return { events, viewerAttendances: [] };
      }

      const attendanceResult = await database.execute(sql`
        select
          event_attendances.event_id,
          event_attendances.occurrence_starts_at,
          event_attendances.status
        from public.event_attendances
        inner join public.tribes
          on tribes.id = event_attendances.tribe_id
        where tribes.slug = ${tribeSlug}
          and public.can_read_tribe_content(tribes.id)
          and event_attendances.user_id = public.current_app_user_id()
          and event_attendances.occurrence_starts_at >= ${rangeStart}
          and event_attendances.occurrence_starts_at < ${rangeEnd}
      `);
      const attendanceRows = (attendanceResult.rows ?? []) as ViewerAttendanceRow[];

      return {
        events,
        viewerAttendances: attendanceRows.flatMap((row) => {
          const status = mapAttendanceStatus(row.status);

          return status
            ? [
                {
                  eventId: row.event_id,
                  occurrenceStartsAt: mapDateValue(row.occurrence_starts_at),
                  status,
                },
              ]
            : [];
        }),
      };
    });
  }

  async findById({ eventId, tribeSlug }: FindTribeEventQuery): Promise<TribeEvent | null> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        select ${EVENT_COLUMNS}
        from public.events
        inner join public.tribes
          on tribes.id = events.tribe_id
        where tribes.slug = ${tribeSlug}
          and events.id = ${eventId}
          and public.can_read_tribe_content(tribes.id)
        limit 1
      `);
      const row = (result.rows?.[0] ?? null) as EventRow | null;

      return row ? mapEvent(row) : null;
    });
  }

  async create(command: PersistTribeEventCommand): Promise<TribeEventCreationResult> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${command.tribeSlug}
          limit 1
        ),
        inserted_event as (
          insert into public.events as events (
            tribe_id,
            created_by,
            capacity,
            title,
            description,
            meeting_url,
            starts_at,
            ends_at,
            recurrence_frequency,
            recurrence_until,
            created_at,
            updated_at
          )
          select
            target_tribe.id,
            public.current_app_user_id(),
            ${command.capacity},
            ${command.title},
            ${command.description},
            ${command.meetingUrl},
            ${command.startsAt},
            ${command.endsAt},
            ${command.recurrenceFrequency},
            ${command.recurrenceUntil},
            timezone('utc', now()),
            timezone('utc', now())
          from target_tribe
          where public.can_manage_tribe_events(target_tribe.id)
          ${RETURNING_EVENT_COLUMNS}
        )
        select
          case
            when exists (select 1 from inserted_event) then ${TRIBE_EVENT_MUTATION_STATUS.created}
            when not exists (select 1 from target_tribe) then ${TRIBE_EVENT_MUTATION_STATUS.notFound}
            else ${TRIBE_EVENT_MUTATION_STATUS.forbidden}
          end as status,
          inserted_event.id,
          inserted_event.capacity,
          inserted_event.title,
          inserted_event.description,
          inserted_event.meeting_url,
          inserted_event.starts_at,
          inserted_event.ends_at,
          inserted_event.recurrence_frequency,
          inserted_event.recurrence_until
        from (select 1) result
        left join inserted_event
          on true
      `);

      return mapCreationResult((result.rows?.[0] ?? null) as EventMutationRow | null);
    });
  }

  async update(command: PersistTribeEventUpdateCommand): Promise<TribeEventUpdateResult> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${command.tribeSlug}
          limit 1
        ),
        target_event as (
          select events.id
          from public.events
          inner join target_tribe
            on target_tribe.id = events.tribe_id
          where events.id = ${command.eventId}
          limit 1
        ),
        updated_event as (
          update public.events
          set
            capacity = ${command.capacity},
            title = ${command.title},
            description = ${command.description},
            meeting_url = ${command.meetingUrl},
            starts_at = ${command.startsAt},
            ends_at = ${command.endsAt},
            recurrence_frequency = ${command.recurrenceFrequency},
            recurrence_until = ${command.recurrenceUntil},
            updated_at = timezone('utc', now())
          from target_tribe
          where events.id = ${command.eventId}
            and events.tribe_id = target_tribe.id
            and public.can_manage_tribe_events(target_tribe.id)
          ${RETURNING_EVENT_COLUMNS}
        )
        select
          case
            when exists (select 1 from updated_event) then ${TRIBE_EVENT_MUTATION_STATUS.updated}
            when not exists (select 1 from target_tribe) then ${TRIBE_EVENT_MUTATION_STATUS.notFound}
            when not exists (select 1 from target_event) then ${TRIBE_EVENT_MUTATION_STATUS.notFound}
            else ${TRIBE_EVENT_MUTATION_STATUS.forbidden}
          end as status,
          updated_event.id,
          updated_event.capacity,
          updated_event.title,
          updated_event.description,
          updated_event.meeting_url,
          updated_event.starts_at,
          updated_event.ends_at,
          updated_event.recurrence_frequency,
          updated_event.recurrence_until
        from (select 1) result
        left join updated_event
          on true
      `);
      const updateResult = mapUpdateResult(
        (result.rows?.[0] ?? null) as EventMutationRow | null
      );

      // A raised (or removed) capacity frees seats: promote the waitlists of
      // upcoming occurrences in the same transaction, which already holds the
      // event row lock taken by the UPDATE above.
      if (updateResult.status === TRIBE_EVENT_MUTATION_STATUS.updated) {
        await database.execute(
          sql`select public.refill_tribe_event_waitlists(${command.eventId}::uuid) as promoted_count`
        );
      }

      return updateResult;
    });
  }

  async delete(command: DeleteTribeEventRepositoryCommand): Promise<TribeEventDeletionResult> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${command.tribeSlug}
          limit 1
        ),
        target_event as (
          select events.id
          from public.events
          inner join target_tribe
            on target_tribe.id = events.tribe_id
          where events.id = ${command.eventId}
          limit 1
        ),
        deleted_event as (
          delete from public.events
          where events.id = ${command.eventId}
            and events.tribe_id = (select id from target_tribe)
            and public.can_manage_tribe_events(events.tribe_id)
          returning events.id
        )
        select
          case
            when exists (select 1 from deleted_event) then ${TRIBE_EVENT_MUTATION_STATUS.deleted}
            when not exists (select 1 from target_tribe) then ${TRIBE_EVENT_MUTATION_STATUS.notFound}
            when not exists (select 1 from target_event) then ${TRIBE_EVENT_MUTATION_STATUS.notFound}
            else ${TRIBE_EVENT_MUTATION_STATUS.forbidden}
          end as status
      `);

      return mapDeletionResult((result.rows?.[0] ?? null) as EventDeletionRow | null);
    });
  }

  async setAttendance(
    command: SetTribeEventAttendanceRepositoryCommand
  ): Promise<TribeEventAttendanceResult> {
    return this.respondToOccurrence(command, command.status);
  }

  async clearAttendance(command: TribeEventAttendanceKey): Promise<TribeEventAttendanceResult> {
    return this.respondToOccurrence(command, null);
  }

  async getOccurrenceAttendanceReport({
    eventId,
    occurrenceStartsAt,
    trendOccurrenceStartsAts,
    tribeSlug,
  }: GetTribeEventAttendanceReportQuery): Promise<TribeEventAttendanceReportLookup> {
    return this.executeWithDatabase(async (database) => {
      const accessResult = await database.execute(sql`
        select
          case
            when events.id is null then ${TRIBE_EVENT_MUTATION_STATUS.notFound}
            when public.can_manage_tribe_events(events.tribe_id) then ${TRIBE_EVENT_MUTATION_STATUS.found}
            else ${TRIBE_EVENT_MUTATION_STATUS.forbidden}
          end as status
        from (select 1) access_anchor
        left join public.events
          on events.id = ${eventId}
          and events.tribe_id = (
            select tribes.id from public.tribes where tribes.slug = ${tribeSlug} limit 1
          )
      `);
      const accessStatus =
        ((accessResult.rows?.[0] ?? null) as ReportAccessRow | null)?.status ?? null;

      if (accessStatus !== TRIBE_EVENT_MUTATION_STATUS.found) {
        return { status: mapFailureStatus(accessStatus) };
      }

      const statusOrder = sql.join(
        ATTENDEE_STATUS_ORDER.map((status) => sql`${status}`),
        sql`, `
      );
      const attendeesResult = await database.execute(sql`
        select
          attendee_users.name,
          event_attendances.status,
          event_attendances.responded_at
        from public.event_attendances
        inner join public."user" attendee_users
          on attendee_users.id = event_attendances.user_id
        where event_attendances.event_id = ${eventId}
          and event_attendances.occurrence_starts_at = ${occurrenceStartsAt}
          and public.can_manage_tribe_events(event_attendances.tribe_id)
        order by
          array_position(array[${statusOrder}]::text[], event_attendances.status) asc,
          event_attendances.responded_at asc,
          event_attendances.id asc
      `);
      const attendees = ((attendeesResult.rows ?? []) as AttendeeRow[]).flatMap((row) => {
        const attendee = mapAttendee(row);

        return attendee ? [attendee] : [];
      });

      if (trendOccurrenceStartsAts.length === 0) {
        return { attendees, status: TRIBE_EVENT_MUTATION_STATUS.found, trend: [] };
      }

      const trendStarts = sql.join(
        trendOccurrenceStartsAts.map((trendStart) => sql`${trendStart}::timestamptz`),
        sql`, `
      );
      const trendResult = await database.execute(sql`
        select
          event_attendances.occurrence_starts_at,
          count(*) filter (
            where event_attendances.status = ${TRIBE_EVENT_ATTENDANCE_STATUS.going}
          ) as going_count
        from public.event_attendances
        where event_attendances.event_id = ${eventId}
          and event_attendances.occurrence_starts_at in (${trendStarts})
          and public.can_manage_tribe_events(event_attendances.tribe_id)
        group by event_attendances.occurrence_starts_at
      `);

      return {
        attendees,
        status: TRIBE_EVENT_MUTATION_STATUS.found,
        trend: ((trendResult.rows ?? []) as TrendRow[]).map((row) => ({
          goingCount: mapCount(row.going_count),
          occurrenceStartsAt: mapDateValue(row.occurrence_starts_at),
        })),
      };
    });
  }

  /**
   * Stores (or clears, with `null`) the viewer answer through the SECURITY
   * DEFINER function that assigns going/waitlisted and promotes the waitlist
   * atomically, then reads the fresh summary of that occurrence in the same
   * transaction so the response already reflects the promotions it caused.
   */
  private async respondToOccurrence(
    key: TribeEventAttendanceKey,
    requestedStatus: TribeEventAttendanceOption | null
  ): Promise<TribeEventAttendanceResult> {
    return this.executeWithDatabase(async (database) => {
      const responseResult = await database.execute(sql`
        select outcome, attendance_status, promoted_count
        from public.respond_to_tribe_event_occurrence(
          ${key.tribeSlug},
          ${key.eventId}::uuid,
          ${key.occurrenceStartsAt}::timestamptz,
          ${requestedStatus}::text
        )
      `);
      const response = (responseResult.rows?.[0] ?? null) as AttendanceResponseRow | null;
      const outcome = response?.outcome ?? null;

      if (
        outcome !== ATTENDANCE_RESPONSE_OUTCOME.saved &&
        outcome !== ATTENDANCE_RESPONSE_OUTCOME.cleared
      ) {
        return { status: mapResponseFailureStatus(outcome) };
      }

      const summaryResult = await database.execute(
        buildAttendanceSummaryQuery({
          eventId: key.eventId,
          rangeEnd: new Date(
            Date.parse(key.occurrenceStartsAt) + SINGLE_OCCURRENCE_RANGE_MS
          ).toISOString(),
          rangeStart: key.occurrenceStartsAt,
          tribeSlug: key.tribeSlug,
        })
      );
      const summaryRow = (summaryResult.rows?.[0] ?? null) as AttendanceSummaryRow | null;

      return {
        attendance: summaryRow
          ? mapAttendanceSummaryFields(summaryRow)
          : createEmptyAttendanceSummary(),
        status:
          outcome === ATTENDANCE_RESPONSE_OUTCOME.saved
            ? TRIBE_EVENT_MUTATION_STATUS.attendanceSaved
            : TRIBE_EVENT_MUTATION_STATUS.attendanceCleared,
      };
    });
  }
}
