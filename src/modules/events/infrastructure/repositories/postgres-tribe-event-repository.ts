import { sql } from "drizzle-orm";

import {
  TRIBE_EVENT_ATTENDANCE_STATUS,
  TRIBE_EVENT_MUTATION_STATUS,
  TRIBE_EVENT_RECURRENCE_FREQUENCY,
} from "@/src/modules/events/constants/tribe-events";
import type {
  TribeEvent,
  TribeEventAttendanceStatus,
  TribeEventRecurrenceFrequency,
} from "@/src/modules/events/domain/entities/tribe-event";
import type {
  DeleteTribeEventRepositoryCommand,
  FindTribeEventQuery,
  ListTribeEventsByRangeQuery,
  PersistTribeEventCommand,
  PersistTribeEventUpdateCommand,
  SetTribeEventAttendanceRepositoryCommand,
  TribeEventAttendanceKey,
  TribeEventAttendanceResult,
  TribeEventCreationResult,
  TribeEventDeletionResult,
  TribeEventOccurrenceAttendance,
  TribeEventRangeListing,
  TribeEventRepository,
  TribeEventUpdateResult,
} from "@/src/modules/events/domain/repositories/tribe-event-repository";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

type DatabaseExecutor = <T>(
  callback: (database: RequestDatabase) => Promise<T>
) => Promise<T>;

type EventRow = {
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
  occurrence_starts_at: Date | string;
  viewer_status: string | null;
};

type EventMutationRow = EventRow & {
  status: string | null;
};

type EventDeletionRow = {
  status: string | null;
};

type AttendanceMutationRow = {
  other_going_count: number | string | null;
  status: string | null;
};

const EVENT_COLUMNS = sql`
  events.id,
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
    events.title,
    events.description,
    events.meeting_url,
    events.starts_at,
    events.ends_at,
    events.recurrence_frequency,
    events.recurrence_until
`;
const COUNT_BASE = 10;
const SELF_GOING_INCREMENT = 1;

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

function mapEvent(row: EventRow): TribeEvent {
  return {
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

function mapAttendanceSummary(row: AttendanceSummaryRow): TribeEventOccurrenceAttendance {
  return {
    eventId: row.event_id,
    goingCount: mapCount(row.going_count),
    occurrenceStartsAt: mapDateValue(row.occurrence_starts_at),
    viewerStatus: mapAttendanceStatus(row.viewer_status),
  };
}

function mapFailureStatus(
  status: string | null
): typeof TRIBE_EVENT_MUTATION_STATUS.forbidden | typeof TRIBE_EVENT_MUTATION_STATUS.notFound {
  return status === TRIBE_EVENT_MUTATION_STATUS.notFound
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
 * A data-modifying CTE is invisible to the rest of its own statement, so the
 * query counts the other members and this mapper adds the viewer's own vote.
 */
function mapAttendanceMutationResult(
  row: AttendanceMutationRow | null,
  viewerStatus: TribeEventAttendanceStatus | null
): TribeEventAttendanceResult {
  if (
    row?.status === TRIBE_EVENT_MUTATION_STATUS.attendanceSaved ||
    row?.status === TRIBE_EVENT_MUTATION_STATUS.attendanceCleared
  ) {
    const selfGoing =
      viewerStatus === TRIBE_EVENT_ATTENDANCE_STATUS.going ? SELF_GOING_INCREMENT : 0;

    return {
      attendance: {
        goingCount: mapCount(row.other_going_count) + selfGoing,
        viewerStatus,
      },
      status: row.status,
    };
  }

  return { status: mapFailureStatus(row?.status ?? null) };
}

export class PostgresTribeEventRepository implements TribeEventRepository {
  constructor(private readonly executeWithDatabase: DatabaseExecutor) {}

  async listByTribeRange({
    rangeEnd,
    rangeStart,
    tribeSlug,
  }: ListTribeEventsByRangeQuery): Promise<TribeEventRangeListing> {
    return this.executeWithDatabase(async (database) => {
      const eventsResult = await database.execute(sql`
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
      `);
      const eventRows = (eventsResult.rows ?? []) as EventListRow[];
      const events = eventRows.reduce<TribeEvent[]>((mappedEvents, row) => {
        if (isEventRow(row)) {
          mappedEvents.push(mapEvent(row));
        }

        return mappedEvents;
      }, []);

      if (events.length === 0) {
        return {
          attendances: [],
          events,
          viewerPermissions: {
            canManageEvents: Boolean(eventRows[0]?.can_manage_events),
          },
        };
      }

      const attendanceResult = await database.execute(sql`
        select
          event_attendances.event_id,
          event_attendances.occurrence_starts_at,
          count(*) filter (
            where event_attendances.status = ${TRIBE_EVENT_ATTENDANCE_STATUS.going}
          ) as going_count,
          max(event_attendances.status) filter (
            where event_attendances.user_id = public.current_app_user_id()
          ) as viewer_status
        from public.event_attendances
        inner join public.tribes
          on tribes.id = event_attendances.tribe_id
        where tribes.slug = ${tribeSlug}
          and public.can_read_tribe_content(tribes.id)
          and event_attendances.occurrence_starts_at >= ${rangeStart}
          and event_attendances.occurrence_starts_at < ${rangeEnd}
        group by event_attendances.event_id, event_attendances.occurrence_starts_at
      `);
      const attendanceRows = (attendanceResult.rows ?? []) as AttendanceSummaryRow[];

      return {
        attendances: attendanceRows.map(mapAttendanceSummary),
        events,
        viewerPermissions: {
          canManageEvents: Boolean(eventRows[0]?.can_manage_events),
        },
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

      return mapUpdateResult((result.rows?.[0] ?? null) as EventMutationRow | null);
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
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_event as (
          select events.id, events.tribe_id
          from public.events
          inner join public.tribes
            on tribes.id = events.tribe_id
          where tribes.slug = ${command.tribeSlug}
            and events.id = ${command.eventId}
          limit 1
        ),
        upserted_attendance as (
          insert into public.event_attendances (
            event_id,
            tribe_id,
            occurrence_starts_at,
            user_id,
            status,
            created_at,
            updated_at
          )
          select
            target_event.id,
            target_event.tribe_id,
            ${command.occurrenceStartsAt},
            public.current_app_user_id(),
            ${command.status},
            timezone('utc', now()),
            timezone('utc', now())
          from target_event
          where public.current_app_user_id() is not null
            and public.is_active_tribe_member(target_event.tribe_id)
          on conflict (event_id, occurrence_starts_at, user_id)
          do update set
            status = excluded.status,
            updated_at = timezone('utc', now())
          returning event_attendances.id
        ),
        other_attendances as (
          select count(*) as other_going_count
          from public.event_attendances
          where event_attendances.event_id = (select id from target_event)
            and event_attendances.occurrence_starts_at = ${command.occurrenceStartsAt}
            and event_attendances.status = ${TRIBE_EVENT_ATTENDANCE_STATUS.going}
            and event_attendances.user_id is distinct from public.current_app_user_id()
        )
        select
          case
            when exists (select 1 from upserted_attendance) then ${TRIBE_EVENT_MUTATION_STATUS.attendanceSaved}
            when not exists (select 1 from target_event) then ${TRIBE_EVENT_MUTATION_STATUS.notFound}
            else ${TRIBE_EVENT_MUTATION_STATUS.forbidden}
          end as status,
          (select other_going_count from other_attendances) as other_going_count
      `);

      return mapAttendanceMutationResult(
        (result.rows?.[0] ?? null) as AttendanceMutationRow | null,
        command.status
      );
    });
  }

  async clearAttendance(command: TribeEventAttendanceKey): Promise<TribeEventAttendanceResult> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_event as (
          select events.id, events.tribe_id
          from public.events
          inner join public.tribes
            on tribes.id = events.tribe_id
          where tribes.slug = ${command.tribeSlug}
            and events.id = ${command.eventId}
          limit 1
        ),
        deleted_attendance as (
          delete from public.event_attendances
          where event_attendances.event_id = (select id from target_event)
            and event_attendances.occurrence_starts_at = ${command.occurrenceStartsAt}
            and event_attendances.user_id = public.current_app_user_id()
            and public.is_active_tribe_member(event_attendances.tribe_id)
          returning event_attendances.id
        ),
        other_attendances as (
          select count(*) as other_going_count
          from public.event_attendances
          where event_attendances.event_id = (select id from target_event)
            and event_attendances.occurrence_starts_at = ${command.occurrenceStartsAt}
            and event_attendances.status = ${TRIBE_EVENT_ATTENDANCE_STATUS.going}
            and event_attendances.user_id is distinct from public.current_app_user_id()
        )
        select
          case
            when not exists (select 1 from target_event) then ${TRIBE_EVENT_MUTATION_STATUS.notFound}
            when not public.is_active_tribe_member((select tribe_id from target_event)) then ${TRIBE_EVENT_MUTATION_STATUS.forbidden}
            else ${TRIBE_EVENT_MUTATION_STATUS.attendanceCleared}
          end as status,
          (select other_going_count from other_attendances) as other_going_count
      `);

      return mapAttendanceMutationResult(
        (result.rows?.[0] ?? null) as AttendanceMutationRow | null,
        null
      );
    });
  }
}
