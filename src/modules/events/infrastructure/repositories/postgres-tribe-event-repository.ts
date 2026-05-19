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

type EventMutationRow = EventRow & {
  status: string | null;
};

type TargetTribeRow = {
  id: string;
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
      const monthStartDate = new Date(monthStart);
      const monthEndDate = new Date(monthEnd);
      const targetTribe = await this.findTargetTribe(database.kysely, tribeSlug);
      const canManageEvents = targetTribe
        ? await this.canManageTribeEvents(database.kysely, targetTribe.id)
        : false;
      const rows = targetTribe
        ? await database.kysely
            .selectFrom("events")
            .select(["id", "title", "description", "meeting_url", "starts_at", "ends_at"])
            .where("tribe_id", "=", targetTribe.id)
            .where("starts_at", ">=", monthStartDate)
            .where("starts_at", "<", monthEndDate)
            .orderBy("starts_at", "asc")
            .orderBy("title", "asc")
            .execute()
        : [];

      return {
        events: rows.map(mapEvent),
        viewerPermissions: {
          canManageEvents,
        },
      };
    });
  }

  async create(command: NormalizedCreateCommand): Promise<TribeEventCreationResult> {
    return this.executeWithDatabase(async (database) => {
      const targetTribe = await this.findTargetTribe(
        database.kysely,
        command.tribeSlug
      );

      if (!targetTribe) {
        return { status: TRIBE_EVENT_MUTATION_STATUS.notFound };
      }

      const canManageEvents = await this.canManageTribeEvents(
        database.kysely,
        targetTribe.id
      );

      if (!canManageEvents) {
        return { status: TRIBE_EVENT_MUTATION_STATUS.forbidden };
      }

      const insertedEvent = await database.kysely
        .insertInto("events")
        .columns([
          "created_at",
          "created_by",
          "description",
          "ends_at",
          "meeting_url",
          "starts_at",
          "title",
          "tribe_id",
          "updated_at",
        ])
        .expression((expressionBuilder) =>
          expressionBuilder
            .selectFrom("tribes")
            .select([
              expressionBuilder.fn<Date>("timezone", [
                expressionBuilder.val("utc"),
                expressionBuilder.fn<Date>("now"),
              ]).as("created_at"),
              expressionBuilder.fn<string>("public.current_app_user_id").as("created_by"),
              expressionBuilder.val(command.description).as("description"),
              expressionBuilder.val(command.endsAt).as("ends_at"),
              expressionBuilder.val(command.meetingUrl).as("meeting_url"),
              expressionBuilder.val(command.startsAt).as("starts_at"),
              expressionBuilder.val(command.title).as("title"),
              expressionBuilder.val(targetTribe.id).as("tribe_id"),
              expressionBuilder.fn<Date>("timezone", [
                expressionBuilder.val("utc"),
                expressionBuilder.fn<Date>("now"),
              ]).as("updated_at"),
            ])
            .where("tribes.id", "=", targetTribe.id)
            .where(
              expressionBuilder.fn<boolean>("public.can_manage_tribe_events", [
                expressionBuilder.val(targetTribe.id),
              ]),
              "=",
              true
            )
        )
        .returning(["id", "title", "description", "meeting_url", "starts_at", "ends_at"])
        .executeTakeFirst();

      return mapCreationResult(
        insertedEvent
          ? {
              ...insertedEvent,
              status: TRIBE_EVENT_MUTATION_STATUS.created,
            }
          : null
      );
    });
  }

  async update(command: NormalizedUpdateCommand): Promise<TribeEventUpdateResult> {
    return this.executeWithDatabase(async (database) => {
      const targetTribe = await this.findTargetTribe(
        database.kysely,
        command.tribeSlug
      );

      if (!targetTribe) {
        return { status: TRIBE_EVENT_MUTATION_STATUS.notFound };
      }

      const targetEvent = await this.findTargetEvent(
        database.kysely,
        targetTribe.id,
        command.eventId
      );

      if (!targetEvent) {
        return { status: TRIBE_EVENT_MUTATION_STATUS.notFound };
      }

      const canManageEvents = await this.canManageTribeEvents(
        database.kysely,
        targetTribe.id
      );

      if (!canManageEvents) {
        return { status: TRIBE_EVENT_MUTATION_STATUS.forbidden };
      }

      const updatedEvent = await database.kysely
        .updateTable("events")
        .set((expressionBuilder) => ({
          description: command.description,
          ends_at: command.endsAt,
          meeting_url: command.meetingUrl,
          starts_at: command.startsAt,
          title: command.title,
          updated_at: expressionBuilder.fn<Date>("timezone", [
            expressionBuilder.val("utc"),
            expressionBuilder.fn<Date>("now"),
          ]),
        }))
        .where("id", "=", targetEvent.id)
        .where("tribe_id", "=", targetTribe.id)
        .where(
          (expressionBuilder) =>
            expressionBuilder.fn<boolean>("public.can_manage_tribe_events", [
              expressionBuilder.val(targetTribe.id),
            ]),
          "=",
          true
        )
        .returning(["id", "title", "description", "meeting_url", "starts_at", "ends_at"])
        .executeTakeFirst();

      if (!updatedEvent) {
        const eventStillExists = await this.findTargetEvent(
          database.kysely,
          targetTribe.id,
          targetEvent.id
        );

        return {
          status: eventStillExists
            ? TRIBE_EVENT_MUTATION_STATUS.forbidden
            : TRIBE_EVENT_MUTATION_STATUS.notFound,
        };
      }

      return mapUpdateResult({
        ...updatedEvent,
        status: TRIBE_EVENT_MUTATION_STATUS.updated,
      });
    });
  }

  async delete(command: DeleteTribeEventCommand): Promise<TribeEventDeletionResult> {
    return this.executeWithDatabase(async (database) => {
      const targetTribe = await this.findTargetTribe(
        database.kysely,
        command.tribeSlug
      );

      if (!targetTribe) {
        return { status: TRIBE_EVENT_MUTATION_STATUS.notFound };
      }

      const targetEvent = await this.findTargetEvent(
        database.kysely,
        targetTribe.id,
        command.eventId
      );

      if (!targetEvent) {
        return { status: TRIBE_EVENT_MUTATION_STATUS.notFound };
      }

      const canManageEvents = await this.canManageTribeEvents(
        database.kysely,
        targetTribe.id
      );

      if (!canManageEvents) {
        return { status: TRIBE_EVENT_MUTATION_STATUS.forbidden };
      }

      const deletedEvent = await database.kysely
        .deleteFrom("events")
        .where("id", "=", targetEvent.id)
        .where("tribe_id", "=", targetTribe.id)
        .where(
          (expressionBuilder) =>
            expressionBuilder.fn<boolean>("public.can_manage_tribe_events", [
              expressionBuilder.val(targetTribe.id),
            ]),
          "=",
          true
        )
        .returning("id")
        .executeTakeFirst();

      if (!deletedEvent) {
        const eventStillExists = await this.findTargetEvent(
          database.kysely,
          targetTribe.id,
          targetEvent.id
        );

        return {
          status: eventStillExists
            ? TRIBE_EVENT_MUTATION_STATUS.forbidden
            : TRIBE_EVENT_MUTATION_STATUS.notFound,
        };
      }

      return {
        status: TRIBE_EVENT_MUTATION_STATUS.deleted,
      };
    });
  }

  private async findTargetTribe(
    database: RequestDatabase["kysely"],
    tribeSlug: string
  ): Promise<TargetTribeRow | null> {
    return (
      (await database
        .selectFrom("tribes")
        .select("id")
        .where("slug", "=", tribeSlug)
        .limit(1)
        .executeTakeFirst()) ?? null
    );
  }

  private async findTargetEvent(
    database: RequestDatabase["kysely"],
    tribeId: string,
    eventId: string
  ): Promise<{ id: string } | null> {
    return (
      (await database
        .selectFrom("events")
        .select("id")
        .where("id", "=", eventId)
        .where("tribe_id", "=", tribeId)
        .limit(1)
        .executeTakeFirst()) ?? null
    );
  }

  private async canManageTribeEvents(
    database: RequestDatabase["kysely"],
    tribeId: string
  ): Promise<boolean> {
    const permission = await database
      .selectNoFrom((expressionBuilder) => [
        expressionBuilder.fn<boolean>("public.can_manage_tribe_events", [
          expressionBuilder.val(tribeId),
        ]).as("canManageEvents"),
      ])
      .executeTakeFirst();

    return permission?.canManageEvents === true;
  }
}
