import { sql } from "drizzle-orm";

import type { Tribe } from "@/src/modules/tribes/domain/entities/tribe";
import { TribeSlugConflictError } from "@/src/modules/tribes/domain/errors/tribe-slug-conflict-error";
import { DEFAULT_TRIBE_POST_CATEGORIES } from "@/src/modules/posts/constants/post-feed";
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
  visibility: "private";
};

type DatabaseExecutor = <T>(
  callback: (database: RequestDatabase) => Promise<T>
) => Promise<T>;

const TRIBE_CREATION_ERROR = {
  slugConflictCode: "23505",
  slugConstraintName: "tribes_slug_key",
  unavailableCreateMessage: "Unable to create tribe.",
} as const;

function mapTribeRowToEntity(row: PostgresTribeRow): Tribe {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    visibility: row.visibility,
  };
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

  async createTribeWithOwnerMembership(input: {
    name: string;
    ownerId: string;
    slug: string;
    visibility: "private";
  }): Promise<Tribe> {
    try {
      return await this.executeWithDatabase(async (database) => {
        const result = await database.execute(sql`
          with inserted_tribe as (
            insert into public.tribes (
              name,
              slug,
              visibility,
              created_by
            )
            values (
              ${input.name},
              ${input.slug},
              ${input.visibility},
              ${input.ownerId}
            )
            returning id, name, slug, visibility
          ), inserted_membership as (
            insert into public.tribe_members (
              tribe_id,
              user_id,
              role,
              status
            )
            select
              inserted_tribe.id,
              ${input.ownerId},
              'owner',
              'active'
            from inserted_tribe
          ), inserted_categories as (
            insert into public.tribe_post_categories (
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
              inserted_tribe.id,
              category_seed.name,
              category_seed.slug,
              category_seed.emoji,
              category_seed.sort_order,
              'members',
              timezone('utc', now()),
              timezone('utc', now())
            from inserted_tribe
            cross join (
              values
                (${DEFAULT_TRIBE_POST_CATEGORIES[0].name}, ${DEFAULT_TRIBE_POST_CATEGORIES[0].slug}, ${DEFAULT_TRIBE_POST_CATEGORIES[0].emoji}, ${DEFAULT_TRIBE_POST_CATEGORIES[0].sortOrder})
            ) as category_seed(name, slug, emoji, sort_order)
          )
          select id, name, slug, visibility
          from inserted_tribe
        `);
        const data = (result.rows?.[0] ?? null) as PostgresTribeRow | null;

        if (!data) {
          throw new Error(TRIBE_CREATION_ERROR.unavailableCreateMessage);
        }

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
      const result = await database.execute(sql`
        select public.is_tribe_slug_taken(${slug}) as slug_taken
      `);

      return result.rows?.[0]?.slug_taken === true;
    });
  }
}
