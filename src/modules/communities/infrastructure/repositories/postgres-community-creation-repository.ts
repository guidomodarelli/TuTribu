import { sql } from "drizzle-orm";

import type { Community } from "@/src/modules/communities/domain/entities/community";
import { CommunitySlugConflictError } from "@/src/modules/communities/domain/errors/community-slug-conflict-error";
import { DEFAULT_COMMUNITY_POST_CATEGORIES } from "@/src/modules/posts/constants/post-feed";
import type { CommunityCreationRepository } from "@/src/modules/communities/domain/repositories/community-creation-repository";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

type RecoverableDatabaseError = {
  code?: string;
  message: string;
};

type PostgresCommunityRow = {
  id: string;
  name: string;
  slug: string;
  visibility: "private";
};

type DatabaseExecutor = <T>(
  callback: (database: RequestDatabase) => Promise<T>
) => Promise<T>;

const COMMUNITY_CREATION_ERROR = {
  slugConflictCode: "23505",
  slugConstraintName: "communities_slug_key",
  unavailableCreateMessage: "Unable to create community.",
} as const;

function mapCommunityRowToEntity(row: PostgresCommunityRow): Community {
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
    error.code === COMMUNITY_CREATION_ERROR.slugConflictCode &&
    normalizedMessage.includes(COMMUNITY_CREATION_ERROR.slugConstraintName)
  );
}

export class PostgresCommunityCreationRepository
  implements CommunityCreationRepository
{
  constructor(private readonly executeWithDatabase: DatabaseExecutor) {}

  async createCommunityWithOwnerMembership(input: {
    name: string;
    ownerId: string;
    slug: string;
    visibility: "private";
  }): Promise<Community> {
    try {
      return await this.executeWithDatabase(async (database) => {
        const result = await database.execute(sql`
          with inserted_community as (
            insert into public.communities (
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
            insert into public.community_members (
              community_id,
              user_id,
              role,
              status
            )
            select
              inserted_community.id,
              ${input.ownerId},
              'owner',
              'active'
            from inserted_community
          ), inserted_categories as (
            insert into public.community_post_categories (
              community_id,
              name,
              slug,
              emoji,
              sort_order,
              access_scope,
              created_at,
              updated_at
            )
            select
              inserted_community.id,
              category_seed.name,
              category_seed.slug,
              category_seed.emoji,
              category_seed.sort_order,
              'members',
              timezone('utc', now()),
              timezone('utc', now())
            from inserted_community
            cross join (
              values
                (${DEFAULT_COMMUNITY_POST_CATEGORIES[0].name}, ${DEFAULT_COMMUNITY_POST_CATEGORIES[0].slug}, ${DEFAULT_COMMUNITY_POST_CATEGORIES[0].emoji}, ${DEFAULT_COMMUNITY_POST_CATEGORIES[0].sortOrder})
            ) as category_seed(name, slug, emoji, sort_order)
          )
          select id, name, slug, visibility
          from inserted_community
        `);
        const data = (result.rows?.[0] ?? null) as PostgresCommunityRow | null;

        if (!data) {
          throw new Error(COMMUNITY_CREATION_ERROR.unavailableCreateMessage);
        }

        return mapCommunityRowToEntity(data);
      });
    } catch (error) {
      const recoverableError = error as RecoverableDatabaseError;

      if (isSlugConflictError(recoverableError)) {
        throw new CommunitySlugConflictError();
      }

      throw error;
    }
  }

  async isSlugTaken(slug: string): Promise<boolean> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        select public.is_community_slug_taken(${slug}) as slug_taken
      `);

      return result.rows?.[0]?.slug_taken === true;
    });
  }
}
