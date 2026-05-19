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

type TargetTribeRow = {
  id: string;
};

type TargetChannelRow = {
  id: string;
  tribe_id: string;
};

type PostgresError = {
  code?: string;
  constraint?: string;
};

const CHANNEL_SLUG = {
  duplicateSeparator: "-",
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
    .replace(CHANNEL_SLUG.nonAlphanumericPattern, CHANNEL_SLUG.duplicateSeparator)
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

function mapCount(value: number | string | bigint | null | undefined): number {
  return Number(value ?? 0);
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
      const rows = await database.kysely
        .selectFrom("tribes")
        .innerJoin("tribe_channels", "tribe_channels.tribe_id", "tribes.id")
        .select([
          "tribe_channels.id",
          "tribe_channels.name",
          "tribe_channels.slug",
          "tribe_channels.emoji",
          "tribe_channels.sort_order",
          "tribe_channels.access_scope",
        ])
        .where("tribes.slug", "=", tribeSlug)
        .orderBy("tribe_channels.sort_order", "asc")
        .orderBy("tribe_channels.name", "asc")
        .execute();

      return rows.map(mapChannel);
    });
  }

  async create(
    command: CreateTribeChannelCommand
  ): Promise<TribeChannelCreationResult> {
    return this.executeWithDatabase(async (database) => {
      try {
        return await database.kysely.transaction().execute(async (transaction) => {
          const targetTribe = await this.findTargetTribe(
            transaction,
            command.tribeSlug
          );

          if (!targetTribe) {
            return { status: TRIBE_CHANNEL_MUTATION_STATUS.notFound };
          }

          const canManage = await this.canManageTribeChannels(
            transaction,
            targetTribe.id
          );

          if (!canManage) {
            return { status: TRIBE_CHANNEL_MUTATION_STATUS.forbidden };
          }

          const channelSlug = createChannelSlug(command.name);
          const existingChannel = await transaction
            .selectFrom("tribe_channels")
            .select("id")
            .where("tribe_id", "=", targetTribe.id)
            .where("slug", "=", channelSlug)
            .executeTakeFirst();

          if (existingChannel) {
            return { status: TRIBE_CHANNEL_MUTATION_STATUS.duplicateSlug };
          }

          const lastChannel = await transaction
            .selectFrom("tribe_channels")
            .select("sort_order")
            .where("tribe_id", "=", targetTribe.id)
            .orderBy("sort_order", "desc")
            .limit(1)
            .executeTakeFirst();
          const nextSortOrder = mapCount(lastChannel?.sort_order) + 10;

          const insertedChannel = await transaction
            .insertInto("tribe_channels")
            .columns([
              "access_scope",
              "created_at",
              "emoji",
              "name",
              "slug",
              "sort_order",
              "tribe_id",
              "updated_at",
            ])
            .expression((expressionBuilder) =>
              expressionBuilder
                .selectFrom("tribes")
                .select([
                  expressionBuilder.val("tribemates").as("access_scope"),
                  expressionBuilder.fn<Date>("timezone", [
                    expressionBuilder.val("utc"),
                    expressionBuilder.fn<Date>("now"),
                  ]).as("created_at"),
                  expressionBuilder.val(command.emoji).as("emoji"),
                  expressionBuilder.val(command.name).as("name"),
                  expressionBuilder.val(channelSlug).as("slug"),
                  expressionBuilder.val(nextSortOrder).as("sort_order"),
                  "tribes.id as tribe_id",
                  expressionBuilder.fn<Date>("timezone", [
                    expressionBuilder.val("utc"),
                    expressionBuilder.fn<Date>("now"),
                  ]).as("updated_at"),
                ])
                .where("tribes.id", "=", targetTribe.id)
                .where((permissionExpressionBuilder) =>
                  permissionExpressionBuilder.fn<boolean>(
                    "public.can_manage_tribe_channels",
                    ["tribes.id"]
                  )
                )
            )
            .returning(["id", "name", "slug", "emoji", "sort_order", "access_scope"])
            .executeTakeFirst();

          return mapChannelCreation(
            insertedChannel
              ? {
                  ...insertedChannel,
                  status: TRIBE_CHANNEL_MUTATION_STATUS.created,
                }
              : null
          );
        });
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
        return await database.kysely.transaction().execute(async (transaction) => {
          const targetTribe = await this.findTargetTribe(
            transaction,
            command.tribeSlug
          );

          if (!targetTribe) {
            return { status: TRIBE_CHANNEL_MUTATION_STATUS.notFound };
          }

          const canManage = await this.canManageTribeChannels(
            transaction,
            targetTribe.id
          );

          if (!canManage) {
            return { status: TRIBE_CHANNEL_MUTATION_STATUS.forbidden };
          }

          const targetChannel = await transaction
            .selectFrom("tribe_channels")
            .select("id")
            .where("id", "=", command.channelId)
            .where("tribe_id", "=", targetTribe.id)
            .executeTakeFirst();

          if (!targetChannel) {
            return { status: TRIBE_CHANNEL_MUTATION_STATUS.notFound };
          }

          const channelSlug = createChannelSlug(command.name);
          const existingChannel = await transaction
            .selectFrom("tribe_channels")
            .select("id")
            .where("tribe_id", "=", targetTribe.id)
            .where("slug", "=", channelSlug)
            .where("id", "<>", command.channelId)
            .executeTakeFirst();

          if (existingChannel) {
            return { status: TRIBE_CHANNEL_MUTATION_STATUS.duplicateSlug };
          }

          const updatedChannel = await transaction
            .updateTable("tribe_channels")
            .set((expressionBuilder) => ({
              emoji: command.emoji,
              name: command.name,
              slug: channelSlug,
              sort_order: command.sortOrder,
              updated_at: expressionBuilder.fn<Date>("timezone", [
                expressionBuilder.val("utc"),
                expressionBuilder.fn<Date>("now"),
              ]),
            }))
            .where("id", "=", command.channelId)
            .where("tribe_id", "=", targetTribe.id)
            .where((expressionBuilder) =>
              expressionBuilder.fn<boolean>("public.can_manage_tribe_channels", [
                "tribe_channels.tribe_id",
              ])
            )
            .returning(["id", "name", "slug", "emoji", "sort_order", "access_scope"])
            .executeTakeFirst();

          return mapChannelUpdate(
            updatedChannel
              ? {
                  ...updatedChannel,
                  status: TRIBE_CHANNEL_MUTATION_STATUS.updated,
                }
              : null
          );
        });
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
      return database.kysely.transaction().execute(async (transaction) => {
        const targetTribe = await this.findTargetTribe(
          transaction,
          command.tribeSlug
        );

        if (!targetTribe) {
          return { status: TRIBE_CHANNEL_MUTATION_STATUS.notFound };
        }

        const targetChannel = await transaction
          .selectFrom("tribe_channels")
          .select(["id", "tribe_id"])
          .where("id", "=", command.channelId)
          .where("tribe_id", "=", targetTribe.id)
          .executeTakeFirst();

        if (!targetChannel) {
          return { status: TRIBE_CHANNEL_MUTATION_STATUS.notFound };
        }

        const canManage = await this.canManageTribeChannels(
          transaction,
          targetTribe.id
        );

        if (!canManage) {
          return { status: TRIBE_CHANNEL_MUTATION_STATUS.forbidden };
        }

        const channelCount = await this.countTribeChannels(
          transaction,
          targetTribe.id
        );

        if (channelCount <= 1) {
          return { status: TRIBE_CHANNEL_MUTATION_STATUS.lastChannel };
        }

        const messageCount = await this.countChannelMessages(
          transaction,
          targetChannel.id
        );
        const targetReplacement = command.targetChannelId
          ? await this.findTargetReplacement(
              transaction,
              targetTribe.id,
              command.channelId,
              command.targetChannelId
            )
          : null;

        if (messageCount > 0 && !targetReplacement) {
          return { status: TRIBE_CHANNEL_MUTATION_STATUS.channelHasMessages };
        }

        const movedMessages = messageCount > 0 && targetReplacement
          ? await transaction
              .updateTable("messages")
              .set((expressionBuilder) => ({
                channel_id: targetReplacement.id,
                updated_at: expressionBuilder.fn<Date>("timezone", [
                  expressionBuilder.val("utc"),
                  expressionBuilder.fn<Date>("now"),
                ]),
              }))
              .where("channel_id", "=", targetChannel.id)
              .where((expressionBuilder) =>
                expressionBuilder.fn<boolean>("public.can_manage_tribe_channels", [
                  "messages.tribe_id",
                ])
              )
              .returning("id")
              .execute()
          : [];

        const deletedChannel = await transaction
          .deleteFrom("tribe_channels")
          .where("id", "=", targetChannel.id)
          .where((expressionBuilder) =>
            expressionBuilder.fn<boolean>("public.can_manage_tribe_channels", [
              "tribe_channels.tribe_id",
            ])
          )
          .returning("id")
          .executeTakeFirst();

        if (!deletedChannel) {
          return { status: TRIBE_CHANNEL_MUTATION_STATUS.invalidChannel };
        }

        return {
          status:
            movedMessages.length > 0
              ? TRIBE_CHANNEL_MUTATION_STATUS.movedAndDeleted
              : TRIBE_CHANNEL_MUTATION_STATUS.deleted,
        };
      });
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
        .executeTakeFirst()) ?? null
    );
  }

  private async canManageTribeChannels(
    database: RequestDatabase["kysely"],
    tribeId: string
  ): Promise<boolean> {
    const permission = await database
      .selectNoFrom((expressionBuilder) => [
        expressionBuilder.fn<boolean>("public.can_manage_tribe_channels", [
          expressionBuilder.val(tribeId),
        ]).as("can_manage"),
      ])
      .executeTakeFirst();

    return permission?.can_manage === true;
  }

  private async countTribeChannels(
    database: RequestDatabase["kysely"],
    tribeId: string
  ): Promise<number> {
    const result = await database
      .selectFrom("tribe_channels")
      .select((expressionBuilder) =>
        expressionBuilder.fn.count("id").as("channel_count")
      )
      .where("tribe_id", "=", tribeId)
      .executeTakeFirst();

    return mapCount(result?.channel_count);
  }

  private async countChannelMessages(
    database: RequestDatabase["kysely"],
    channelId: string
  ): Promise<number> {
    const result = await database
      .selectFrom("messages")
      .select((expressionBuilder) =>
        expressionBuilder.fn.count("id").as("message_count")
      )
      .where("channel_id", "=", channelId)
      .executeTakeFirst();

    return mapCount(result?.message_count);
  }

  private async findTargetReplacement(
    database: RequestDatabase["kysely"],
    tribeId: string,
    channelId: string,
    targetChannelId: string
  ): Promise<TargetChannelRow | null> {
    return (
      (await database
        .selectFrom("tribe_channels")
        .select(["id", "tribe_id"])
        .where("tribe_id", "=", tribeId)
        .where("id", "=", targetChannelId)
        .where("id", "<>", channelId)
        .executeTakeFirst()) ?? null
    );
  }

}
