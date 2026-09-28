import { sql } from "drizzle-orm";

import type {
  CreateTribeChannelCommand,
  DeleteTribeChannelCommand,
  UpdateTribeChannelCommand,
} from "@/src/modules/messages/application/commands/tribe-message-command";
import type { TribeChannelResult } from "@/src/modules/messages/application/results/tribe-round-result";
import type {
  TribeChannelCreationResult,
  TribeChannelDeletionResult,
  TribeChannelUpdateResult,
} from "@/src/modules/messages/application/results/tribe-channel-result";
import { TRIBE_CHANNEL_MUTATION_STATUS } from "@/src/modules/messages/constants/message-round";
import type {
  ListTribeChannelsQuery,
  TribeChannelRepository,
} from "@/src/modules/messages/domain/repositories/tribe-channel-repository";
import { createTribeChannel } from "@/src/modules/messages/infrastructure/mappers/tribe-round-view-model-mapper";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

type DatabaseExecutor = <T>(
  callback: (database: RequestDatabase) => Promise<T>
) => Promise<T>;

type ChannelRow = {
  access_scope: string | null;
  emoji: string | null;
  id: string;
  name: string | null;
  slug: string | null;
  sort_order: number | string | null;
};

type ChannelMutationRow = ChannelRow & {
  status: string | null;
};

type DeletionStatusRow = {
  status: string | null;
};

type PostgresError = {
  code?: string;
  constraint?: string;
};

const CHANNEL_SLUG = {
  emptyFallback: "channel",
  nonAlphanumericPattern: /[^a-z0-9]+/g,
  trimSeparatorPattern: /^-+|-+$/g,
} as const;

const POSTGRES_ERROR = {
  uniqueViolation: "23505",
} as const;

const TRIBE_CHANNEL_CONSTRAINT = {
  tribeSlugKey: "tribe_channels_tribe_id_slug_key",
} as const;

function createChannelSlug(name: string): string {
  const normalizedSlug = name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(CHANNEL_SLUG.nonAlphanumericPattern, "-")
    .replace(CHANNEL_SLUG.trimSeparatorPattern, "");

  return normalizedSlug || CHANNEL_SLUG.emptyFallback;
}

function mapChannel(row: ChannelRow): TribeChannelResult {
  return createTribeChannel({
    accessScope: row.access_scope,
    emoji: row.emoji,
    id: row.id,
    name: row.name,
    slug: row.slug,
    sortOrder: row.sort_order,
  });
}

function mapFallbackCreationStatus(
  status: string | null | undefined
): TribeChannelCreationResult {
  if (
    status === TRIBE_CHANNEL_MUTATION_STATUS.duplicateSlug ||
    status === TRIBE_CHANNEL_MUTATION_STATUS.invalidName ||
    status === TRIBE_CHANNEL_MUTATION_STATUS.notFound
  ) {
    return {
      status,
    };
  }

  return {
    status: TRIBE_CHANNEL_MUTATION_STATUS.forbidden,
  };
}

function mapChannelCreation(row: ChannelMutationRow | null): TribeChannelCreationResult {
  if (row?.status === TRIBE_CHANNEL_MUTATION_STATUS.created) {
    return {
      channel: mapChannel(row),
      status: row.status,
    };
  }

  return mapFallbackCreationStatus(row?.status);
}

function mapFallbackUpdateStatus(
  status: string | null | undefined
): TribeChannelUpdateResult {
  if (
    status === TRIBE_CHANNEL_MUTATION_STATUS.duplicateSlug ||
    status === TRIBE_CHANNEL_MUTATION_STATUS.invalidName ||
    status === TRIBE_CHANNEL_MUTATION_STATUS.notFound
  ) {
    return {
      status,
    };
  }

  return {
    status: TRIBE_CHANNEL_MUTATION_STATUS.forbidden,
  };
}

function mapChannelUpdate(row: ChannelMutationRow | null): TribeChannelUpdateResult {
  if (row?.status === TRIBE_CHANNEL_MUTATION_STATUS.updated) {
    return {
      channel: mapChannel(row),
      status: row.status,
    };
  }

  return mapFallbackUpdateStatus(row?.status);
}

function mapDeletionStatus(row: DeletionStatusRow | null): TribeChannelDeletionResult {
  const status = row?.status;

  if (
    status === TRIBE_CHANNEL_MUTATION_STATUS.deleted ||
    status === TRIBE_CHANNEL_MUTATION_STATUS.movedAndDeleted ||
    status === TRIBE_CHANNEL_MUTATION_STATUS.lastChannel ||
    status === TRIBE_CHANNEL_MUTATION_STATUS.channelHasMessages ||
    status === TRIBE_CHANNEL_MUTATION_STATUS.invalidChannel ||
    status === TRIBE_CHANNEL_MUTATION_STATUS.notFound
  ) {
    return {
      status,
    };
  }

  return {
    status: TRIBE_CHANNEL_MUTATION_STATUS.forbidden,
  };
}

function isDuplicateChannelSlugError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const postgresError = error as PostgresError;

  return (
    postgresError.code === POSTGRES_ERROR.uniqueViolation &&
    postgresError.constraint === TRIBE_CHANNEL_CONSTRAINT.tribeSlugKey
  );
}

export class PostgresTribeChannelRepository implements TribeChannelRepository {
  constructor(private readonly executeWithDatabase: DatabaseExecutor) {}

  async listByTribeSlug({
    tribeSlug,
  }: ListTribeChannelsQuery): Promise<TribeChannelResult[]> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${tribeSlug}
            -- The runtime role bypasses RLS: repeat the read rule here.
            and public.can_read_tribe_content(tribes.id)
          limit 1
        )
        select
          tribe_channels.id,
          tribe_channels.name,
          tribe_channels.slug,
          tribe_channels.emoji,
          tribe_channels.sort_order,
          tribe_channels.access_scope
        from public.tribe_channels
        inner join target_tribe
          on target_tribe.id = tribe_channels.tribe_id
        order by tribe_channels.sort_order asc, tribe_channels.name asc
      `);

      return ((result.rows ?? []) as ChannelRow[]).map(mapChannel);
    });
  }

  async create(
    command: CreateTribeChannelCommand
  ): Promise<TribeChannelCreationResult> {
    return this.executeWithDatabase(async (database) => {
      try {
        const result = await database.execute(sql`
          with target_tribe as (
            select tribes.id
            from public.tribes
            where tribes.slug = ${command.tribeSlug}
            limit 1
          ),
          next_sort_order as (
            select coalesce(max(sort_order), 0) + 10 as value
            from public.tribe_channels
            inner join target_tribe
              on target_tribe.id = tribe_channels.tribe_id
          ),
          channel_input as (
            select ${createChannelSlug(command.name)} as slug
          ),
          existing_channel as (
            select tribe_channels.id
            from public.tribe_channels
            inner join target_tribe
              on target_tribe.id = tribe_channels.tribe_id
            inner join channel_input
              on channel_input.slug = tribe_channels.slug
            limit 1
          ),
          inserted_channel as (
            insert into public.tribe_channels (
              tribe_id,
              name,
              slug,
              emoji,
              sort_order,
              access_scope,
              created_at,
              updated_at
            )
            select
              target_tribe.id,
              ${command.name},
              channel_input.slug,
              ${command.emoji},
              next_sort_order.value,
              'tribemates',
              timezone('utc', now()),
              timezone('utc', now())
            from target_tribe
            cross join channel_input
            cross join next_sort_order
            where public.can_manage_tribe_channels(target_tribe.id)
              and not exists (select 1 from existing_channel)
            returning id, name, slug, emoji, sort_order, access_scope
          )
          select
            case
              when exists (select 1 from inserted_channel) then ${TRIBE_CHANNEL_MUTATION_STATUS.created}
              when not exists (select 1 from target_tribe) then ${TRIBE_CHANNEL_MUTATION_STATUS.notFound}
              when not public.can_manage_tribe_channels((select id from target_tribe)) then ${TRIBE_CHANNEL_MUTATION_STATUS.forbidden}
              when exists (select 1 from existing_channel) then ${TRIBE_CHANNEL_MUTATION_STATUS.duplicateSlug}
              else ${TRIBE_CHANNEL_MUTATION_STATUS.forbidden}
            end as status,
            inserted_channel.id,
            inserted_channel.name,
            inserted_channel.slug,
            inserted_channel.emoji,
            inserted_channel.sort_order,
            inserted_channel.access_scope
          from (select 1) result
          left join inserted_channel
            on true
        `);

        return mapChannelCreation(
          (result.rows?.[0] ?? null) as ChannelMutationRow | null
        );
      } catch (error) {
        if (isDuplicateChannelSlugError(error)) {
          return {
            status: TRIBE_CHANNEL_MUTATION_STATUS.duplicateSlug,
          };
        }

        throw error;
      }
    });
  }

  async update(
    command: UpdateTribeChannelCommand
  ): Promise<TribeChannelUpdateResult> {
    return this.executeWithDatabase(async (database) => {
      try {
        const result = await database.execute(sql`
          with target_tribe as (
            select tribes.id
            from public.tribes
            where tribes.slug = ${command.tribeSlug}
            limit 1
          ),
          target_channel as (
            select tribe_channels.id
            from public.tribe_channels
            inner join target_tribe
              on target_tribe.id = tribe_channels.tribe_id
            where tribe_channels.id = ${command.channelId}
            limit 1
          ),
          channel_input as (
            select ${createChannelSlug(command.name)} as slug
          ),
          existing_channel as (
            select tribe_channels.id
            from public.tribe_channels
            inner join target_tribe
              on target_tribe.id = tribe_channels.tribe_id
            inner join channel_input
              on channel_input.slug = tribe_channels.slug
            where tribe_channels.id <> ${command.channelId}
            limit 1
          ),
          updated_channel as (
            update public.tribe_channels
            set
              name = ${command.name},
              slug = (select slug from channel_input),
              emoji = ${command.emoji},
              sort_order = ${command.sortOrder},
              updated_at = timezone('utc', now())
            from target_tribe
            where tribe_channels.id = ${command.channelId}
              and tribe_channels.tribe_id = target_tribe.id
              and public.can_manage_tribe_channels(target_tribe.id)
              and exists (select 1 from target_channel)
              and not exists (select 1 from existing_channel)
            returning
              tribe_channels.id,
              tribe_channels.name,
              tribe_channels.slug,
              tribe_channels.emoji,
              tribe_channels.sort_order,
              tribe_channels.access_scope
          )
          select
            case
              when exists (select 1 from updated_channel) then ${TRIBE_CHANNEL_MUTATION_STATUS.updated}
              when not exists (select 1 from target_tribe) then ${TRIBE_CHANNEL_MUTATION_STATUS.notFound}
              when not public.can_manage_tribe_channels((select id from target_tribe)) then ${TRIBE_CHANNEL_MUTATION_STATUS.forbidden}
              when not exists (select 1 from target_channel) then ${TRIBE_CHANNEL_MUTATION_STATUS.notFound}
              when exists (select 1 from existing_channel) then ${TRIBE_CHANNEL_MUTATION_STATUS.duplicateSlug}
              else ${TRIBE_CHANNEL_MUTATION_STATUS.forbidden}
            end as status,
            updated_channel.id,
            updated_channel.name,
            updated_channel.slug,
            updated_channel.emoji,
            updated_channel.sort_order,
            updated_channel.access_scope
          from (select 1) result
          left join updated_channel
            on true
        `);

        return mapChannelUpdate(
          (result.rows?.[0] ?? null) as ChannelMutationRow | null
        );
      } catch (error) {
        if (isDuplicateChannelSlugError(error)) {
          return {
            status: TRIBE_CHANNEL_MUTATION_STATUS.duplicateSlug,
          };
        }

        throw error;
      }
    });
  }

  async delete(
    command: DeleteTribeChannelCommand
  ): Promise<TribeChannelDeletionResult> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${command.tribeSlug}
          limit 1
        ),
        target_channel as (
          select tribe_channels.id, tribe_channels.tribe_id
          from public.tribe_channels
          inner join target_tribe
            on target_tribe.id = tribe_channels.tribe_id
          where tribe_channels.id = ${command.channelId}
          limit 1
        ),
        target_replacement as (
          select tribe_channels.id
          from public.tribe_channels
          inner join target_tribe
            on target_tribe.id = tribe_channels.tribe_id
          where tribe_channels.id = ${command.targetChannelId || null}
            and tribe_channels.id <> ${command.channelId}
          limit 1
        ),
        channel_counts as (
          select
            count(*) as channel_count,
            (
              select count(*)
              from public.messages
              inner join target_channel
                on target_channel.id = messages.channel_id
            ) as message_count
          from public.tribe_channels
          inner join target_tribe
            on target_tribe.id = tribe_channels.tribe_id
        ),
        moved_messages as (
          update public.messages
          set
            channel_id = (select id from target_replacement),
            updated_at = timezone('utc', now())
          where messages.channel_id = (select id from target_channel)
            and public.can_manage_tribe_channels(messages.tribe_id)
            and (select message_count from channel_counts) > 0
            and exists (select 1 from target_replacement)
          returning messages.id
        ),
        deleted_channel as (
          delete from public.tribe_channels
          where tribe_channels.id = (select id from target_channel)
            and public.can_manage_tribe_channels(tribe_channels.tribe_id)
            and (select channel_count from channel_counts) > 1
            and (
              (select message_count from channel_counts) = 0
              or exists (select 1 from target_replacement)
            )
          returning tribe_channels.id
        )
        select
          case
            when not exists (select 1 from target_tribe) then ${TRIBE_CHANNEL_MUTATION_STATUS.notFound}
            when not exists (select 1 from target_channel) then ${TRIBE_CHANNEL_MUTATION_STATUS.notFound}
            when not public.can_manage_tribe_channels((select id from target_tribe)) then ${TRIBE_CHANNEL_MUTATION_STATUS.forbidden}
            when (select channel_count from channel_counts) <= 1 then ${TRIBE_CHANNEL_MUTATION_STATUS.lastChannel}
            when (select message_count from channel_counts) > 0
              and not exists (select 1 from target_replacement) then ${TRIBE_CHANNEL_MUTATION_STATUS.channelHasMessages}
            when exists (select 1 from deleted_channel)
              and exists (select 1 from moved_messages) then ${TRIBE_CHANNEL_MUTATION_STATUS.movedAndDeleted}
            when exists (select 1 from deleted_channel) then ${TRIBE_CHANNEL_MUTATION_STATUS.deleted}
            else ${TRIBE_CHANNEL_MUTATION_STATUS.invalidChannel}
          end as status
      `);

      return mapDeletionStatus((result.rows?.[0] ?? null) as DeletionStatusRow | null);
    });
  }
}
