import { sql } from "drizzle-orm";

import type {
  CreateTribeEventCommand,
  DeleteTribeEventCommand,
  UpdateTribeEventCommand,
} from "@/src/modules/events/application/commands/tribe-event-command";
import type {
  TribeEventCreationResult,
  TribeEventDeletionResult,
  TribeEventResult,
  TribeEventUpdateResult,
} from "@/src/modules/events/application/results/tribe-event-result";
import { TRIBE_EVENT_MUTATION_STATUS } from "@/src/modules/events/constants/tribe-events";
import type {
  ListTribeEventsByMonthQuery,
  TribeEventRepository,
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
  starts_at: Date | string;
  title: string;
};

type EventListRow = {
  can_manage_events: boolean | null;
  description: string | null;
  ends_at: Date | string | null;
  id: string | null;
  meeting_url: string | null;
  starts_at: Date | string | null;
  title: string | null;
};

type EventMutationRow = EventRow & {
  status: string | null;
};

type EventDeletionRow = {
  status: string | null;
};

function mapDateValue(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapNullableDateValue(value: Date | string | null): string | null {
  return value ? mapDateValue(value) : null;
}

function mapEvent(row: EventRow): TribeEventResult {
  return {
    description: row.description,
    endsAt: mapNullableDateValue(row.ends_at),
    id: row.id,
    meetingUrl: row.meeting_url,
    startsAt: mapDateValue(row.starts_at),
    title: row.title,
  };
}

function isEventRow(row: EventListRow): row is EventListRow & EventRow {
  return row.id !== null && row.starts_at !== null && row.title !== null;
}

function mapCreationResult(row: EventMutationRow | null): TribeEventCreationResult {
  if (row?.status === TRIBE_EVENT_MUTATION_STATUS.created) {
    return {
      event: mapEvent(row),
      status: row.status,
    };
  }

  return {
    status:
      row?.status === TRIBE_EVENT_MUTATION_STATUS.notFound
        ? TRIBE_EVENT_MUTATION_STATUS.notFound
        : TRIBE_EVENT_MUTATION_STATUS.forbidden,
  };
}

function mapUpdateResult(row: EventMutationRow | null): TribeEventUpdateResult {
  if (row?.status === TRIBE_EVENT_MUTATION_STATUS.updated) {
    return {
      event: mapEvent(row),
      status: row.status,
    };
  }

  return {
    status:
      row?.status === TRIBE_EVENT_MUTATION_STATUS.notFound
        ? TRIBE_EVENT_MUTATION_STATUS.notFound
        : TRIBE_EVENT_MUTATION_STATUS.forbidden,
  };
}

function mapDeletionResult(row: EventDeletionRow | null): TribeEventDeletionResult {
  if (
    row?.status === TRIBE_EVENT_MUTATION_STATUS.deleted ||
    row?.status === TRIBE_EVENT_MUTATION_STATUS.notFound
  ) {
    return {
      status: row.status,
    };
  }

  return {
    status: TRIBE_EVENT_MUTATION_STATUS.forbidden,
  };
}

type NormalizedCreateCommand = Omit<
  CreateTribeEventCommand,
  "description" | "endsAt" | "meetingUrl"
> & {
  description: string | null;
  endsAt: string | null;
  meetingUrl: string | null;
};

type NormalizedUpdateCommand = Omit<
  UpdateTribeEventCommand,
  "description" | "endsAt" | "meetingUrl"
> & {
  description: string | null;
  endsAt: string | null;
  meetingUrl: string | null;
};

export class PostgresTribeEventRepository implements TribeEventRepository {
  constructor(private readonly executeWithDatabase: DatabaseExecutor) {}

  async listByTribeMonth({
    monthEnd,
    monthStart,
    tribeSlug,
  }: ListTribeEventsByMonthQuery) {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
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
          select
            events.id,
            events.title,
            events.description,
            events.meeting_url,
            events.starts_at,
            events.ends_at
          from public.events
          inner join target_tribe
            on target_tribe.id = events.tribe_id
          where events.starts_at >= ${monthStart}
            and events.starts_at < ${monthEnd}
        )
        select
          event_rows.id,
          event_rows.title,
          event_rows.description,
          event_rows.meeting_url,
          event_rows.starts_at,
          event_rows.ends_at,
          viewer_permissions.can_manage_events
        from viewer_permissions
        left join event_rows
          on true
        order by event_rows.starts_at asc, event_rows.title asc
      `);
      const rows = (result.rows ?? []) as EventListRow[];

      return {
        events: rows.filter(isEventRow).map(mapEvent),
        viewerPermissions: {
          canManageEvents: Boolean(rows[0]?.can_manage_events),
        },
      };
    });
  }

  async create(command: NormalizedCreateCommand): Promise<TribeEventCreationResult> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${command.tribeSlug}
          limit 1
        ),
        inserted_event as (
          insert into public.events (
            tribe_id,
            created_by,
            title,
            description,
            meeting_url,
            starts_at,
            ends_at,
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
            timezone('utc', now()),
            timezone('utc', now())
          from target_tribe
          where public.can_manage_tribe_events(target_tribe.id)
          returning id, title, description, meeting_url, starts_at, ends_at
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
          inserted_event.ends_at
        from (select 1) result
        left join inserted_event
          on true
      `);

      return mapCreationResult((result.rows?.[0] ?? null) as EventMutationRow | null);
    });
  }

  async update(command: NormalizedUpdateCommand): Promise<TribeEventUpdateResult> {
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
            updated_at = timezone('utc', now())
          from target_tribe
          where events.id = ${command.eventId}
            and events.tribe_id = target_tribe.id
            and public.can_manage_tribe_events(target_tribe.id)
          returning events.id, events.title, events.description, events.meeting_url, events.starts_at, events.ends_at
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
          updated_event.ends_at
        from (select 1) result
        left join updated_event
          on true
      `);

      return mapUpdateResult((result.rows?.[0] ?? null) as EventMutationRow | null);
    });
  }

  async delete(command: DeleteTribeEventCommand): Promise<TribeEventDeletionResult> {
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
}
