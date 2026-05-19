import type { Tribe } from "@/src/modules/tribes/domain/entities/tribe";
import { TribeSlugConflictError } from "@/src/modules/tribes/domain/errors/tribe-slug-conflict-error";
import { DEFAULT_TRIBE_CHANNELS } from "@/src/modules/messages/constants/message-round";
import type { TribeCreationRepository } from "@/src/modules/tribes/domain/repositories/tribe-creation-repository";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

type RecoverableDatabaseError = {
  code?: string;
  message: string;
};

type PostgresTribeRow = {
  id: string;
  name: string;
  slug: string;
  visibility: string;
};

type DatabaseExecutor = <T>(
  callback: (database: RequestDatabase) => Promise<T>
) => Promise<T>;

const TRIBE_CREATION_ERROR = {
  missingDefaultChannelMessage: "Unable to create tribe without a default channel.",
  slugConflictCode: "23505",
  slugConstraintName: "tribes_slug_key",
  unsupportedVisibilityMessage: "Created tribe has an unsupported visibility.",
  unavailableCreateMessage: "Unable to create tribe.",
} as const;

function mapTribeRowToEntity(row: PostgresTribeRow): Tribe {
  const visibility = normalizeTribeVisibility(row.visibility);

  if (!visibility) {
    throw new Error(TRIBE_CREATION_ERROR.unsupportedVisibilityMessage);
  }

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    visibility,
  };
}

function normalizeTribeVisibility(visibility: string): Tribe["visibility"] | null {
  return visibility === "private" ? visibility : null;
}

function isSlugConflictError(error: RecoverableDatabaseError | null): boolean {
  if (!error) {
    return false;
  }

  const normalizedMessage = error.message.toLowerCase();

  return (
    error.code === TRIBE_CREATION_ERROR.slugConflictCode &&
    normalizedMessage.includes(TRIBE_CREATION_ERROR.slugConstraintName)
  );
}

export class PostgresTribeCreationRepository
  implements TribeCreationRepository
{
  constructor(private readonly executeWithDatabase: DatabaseExecutor) {}

  async createTribeWithLeaderMembership(input: {
    name: string;
    leaderId: string;
    slug: string;
    visibility: "private";
  }): Promise<Tribe> {
    try {
      return await this.executeWithDatabase(async (database) => {
        const data = await database.kysely.transaction().execute(async (transaction) => {
          const createdTribe = await transaction
            .insertInto("tribes")
            .values({
              created_by: input.leaderId,
              name: input.name,
              slug: input.slug,
              visibility: input.visibility,
            })
            .returning(["id", "name", "slug", "visibility"])
            .executeTakeFirst();

          if (!createdTribe) {
            throw new Error(TRIBE_CREATION_ERROR.unavailableCreateMessage);
          }

          await transaction
            .insertInto("tribe_members")
            .values({
              role: "leader",
              status: "active",
              tribe_id: createdTribe.id,
              user_id: input.leaderId,
            })
            .execute();

          const defaultChannel = DEFAULT_TRIBE_CHANNELS[0];

          if (!defaultChannel) {
            throw new Error(TRIBE_CREATION_ERROR.missingDefaultChannelMessage);
          }

          await transaction
            .insertInto("tribe_channels")
            .values((expressionBuilder) => ({
              access_scope: "tribemates",
              created_at: expressionBuilder.fn<Date>("timezone", [
                expressionBuilder.val("utc"),
                expressionBuilder.fn<Date>("now"),
              ]),
              emoji: defaultChannel.emoji,
              name: defaultChannel.name,
              slug: defaultChannel.slug,
              sort_order: defaultChannel.sortOrder,
              tribe_id: createdTribe.id,
              updated_at: expressionBuilder.fn<Date>("timezone", [
                expressionBuilder.val("utc"),
                expressionBuilder.fn<Date>("now"),
              ]),
            }))
            .execute();

          return createdTribe;
        });

        return mapTribeRowToEntity(data);
      });
    } catch (error) {
      const recoverableError = error as RecoverableDatabaseError;

      if (isSlugConflictError(recoverableError)) {
        throw new TribeSlugConflictError();
      }

      throw error;
    }
  }

  async isSlugTaken(slug: string): Promise<boolean> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.kysely
        .selectNoFrom((expressionBuilder) =>
          expressionBuilder.fn<boolean>("public.is_tribe_slug_taken", [
            expressionBuilder.val(slug),
          ]).as("slugTaken")
        )
        .executeTakeFirst();

      return result?.slugTaken === true;
    });
  }
}
