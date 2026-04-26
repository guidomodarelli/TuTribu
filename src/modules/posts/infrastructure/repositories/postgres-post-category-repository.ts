/* eslint-disable local/no-magic-strings -- SQL repositories keep query text inline for reviewable data access. */
import { sql } from "drizzle-orm";

import type {
  CreateCommunityPostCategoryCommand,
  DeleteCommunityPostCategoryCommand,
  UpdateCommunityPostCategoryCommand,
} from "@/src/modules/posts/application/commands/community-post-command";
import type { CommunityPostCategoryResult } from "@/src/modules/posts/application/results/community-feed-result";
import type {
  PostCategoryCreationResult,
  PostCategoryDeletionResult,
  PostCategoryUpdateResult,
} from "@/src/modules/posts/application/results/post-category-result";
import { POST_CATEGORY_MUTATION_STATUS } from "@/src/modules/posts/constants/post-feed";
import type {
  ListCommunityPostCategoriesQuery,
  PostCategoryRepository,
} from "@/src/modules/posts/domain/repositories/post-category-repository";
import { createCommunityPostCategory } from "@/src/modules/posts/infrastructure/mappers/community-feed-view-model-mapper";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

type DatabaseExecutor = <T>(
  callback: (database: RequestDatabase) => Promise<T>
) => Promise<T>;

type CategoryRow = {
  access_scope: string | null;
  emoji: string | null;
  id: string;
  name: string | null;
  slug: string | null;
  sort_order: number | string | null;
};

type CategoryMutationRow = CategoryRow & {
  status: string | null;
};

type DeletionStatusRow = {
  status: string | null;
};

type PostgresError = {
  code?: string;
  constraint?: string;
};

const CATEGORY_SLUG = {
  duplicateSeparator: "-",
  emptyFallback: "categoria",
  nonAlphanumericPattern: /[^a-z0-9]+/g,
  trimSeparatorPattern: /^-+|-+$/g,
} as const;

const POSTGRES_ERROR = {
  uniqueViolation: "23505",
} as const;

const POST_CATEGORY_CONSTRAINT = {
  communitySlugKey: "community_post_categories_community_id_slug_key",
} as const;

function createCategorySlug(name: string): string {
  const normalizedSlug = name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(CATEGORY_SLUG.nonAlphanumericPattern, CATEGORY_SLUG.duplicateSeparator)
    .replace(CATEGORY_SLUG.trimSeparatorPattern, "");

  return normalizedSlug || CATEGORY_SLUG.emptyFallback;
}

function mapCategory(row: CategoryRow): CommunityPostCategoryResult {
  return createCommunityPostCategory({
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
): PostCategoryCreationResult {
  if (
    status === POST_CATEGORY_MUTATION_STATUS.duplicateSlug ||
    status === POST_CATEGORY_MUTATION_STATUS.invalidName ||
    status === POST_CATEGORY_MUTATION_STATUS.notFound
  ) {
    return {
      status,
    };
  }

  return {
    status: POST_CATEGORY_MUTATION_STATUS.forbidden,
  };
}

function mapCategoryCreation(row: CategoryMutationRow | null): PostCategoryCreationResult {
  if (row?.status === POST_CATEGORY_MUTATION_STATUS.created) {
    return {
      category: mapCategory(row),
      status: row.status,
    };
  }

  return mapFallbackCreationStatus(row?.status);
}

function mapFallbackUpdateStatus(
  status: string | null | undefined
): PostCategoryUpdateResult {
  if (
    status === POST_CATEGORY_MUTATION_STATUS.duplicateSlug ||
    status === POST_CATEGORY_MUTATION_STATUS.invalidName ||
    status === POST_CATEGORY_MUTATION_STATUS.notFound
  ) {
    return {
      status,
    };
  }

  return {
    status: POST_CATEGORY_MUTATION_STATUS.forbidden,
  };
}

function mapCategoryUpdate(row: CategoryMutationRow | null): PostCategoryUpdateResult {
  if (row?.status === POST_CATEGORY_MUTATION_STATUS.updated) {
    return {
      category: mapCategory(row),
      status: row.status,
    };
  }

  return mapFallbackUpdateStatus(row?.status);
}

function mapDeletionStatus(row: DeletionStatusRow | null): PostCategoryDeletionResult {
  const status = row?.status;

  if (
    status === POST_CATEGORY_MUTATION_STATUS.deleted ||
    status === POST_CATEGORY_MUTATION_STATUS.movedAndDeleted ||
    status === POST_CATEGORY_MUTATION_STATUS.lastCategory ||
    status === POST_CATEGORY_MUTATION_STATUS.categoryHasPosts ||
    status === POST_CATEGORY_MUTATION_STATUS.invalidCategory ||
    status === POST_CATEGORY_MUTATION_STATUS.notFound
  ) {
    return {
      status,
    };
  }

  return {
    status: POST_CATEGORY_MUTATION_STATUS.forbidden,
  };
}

function isDuplicateCategorySlugError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const postgresError = error as PostgresError;

  return (
    postgresError.code === POSTGRES_ERROR.uniqueViolation &&
    postgresError.constraint === POST_CATEGORY_CONSTRAINT.communitySlugKey
  );
}

export class PostgresPostCategoryRepository implements PostCategoryRepository {
  constructor(private readonly executeWithDatabase: DatabaseExecutor) {}

  async listByCommunitySlug({
    communitySlug,
  }: ListCommunityPostCategoriesQuery): Promise<CommunityPostCategoryResult[]> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_community as (
          select communities.id
          from public.communities
          where communities.slug = ${communitySlug}
          limit 1
        )
        select
          community_post_categories.id,
          community_post_categories.name,
          community_post_categories.slug,
          community_post_categories.emoji,
          community_post_categories.sort_order,
          community_post_categories.access_scope
        from public.community_post_categories
        inner join target_community
          on target_community.id = community_post_categories.community_id
        order by community_post_categories.sort_order asc, community_post_categories.name asc
      `);

      return ((result.rows ?? []) as CategoryRow[]).map(mapCategory);
    });
  }

  async create(
    command: CreateCommunityPostCategoryCommand
  ): Promise<PostCategoryCreationResult> {
    return this.executeWithDatabase(async (database) => {
      try {
        const result = await database.execute(sql`
          with target_community as (
            select communities.id
            from public.communities
            where communities.slug = ${command.communitySlug}
            limit 1
          ),
          next_sort_order as (
            select coalesce(max(sort_order), 0) + 10 as value
            from public.community_post_categories
            inner join target_community
              on target_community.id = community_post_categories.community_id
          ),
          category_input as (
            select ${createCategorySlug(command.name)} as slug
          ),
          existing_category as (
            select community_post_categories.id
            from public.community_post_categories
            inner join target_community
              on target_community.id = community_post_categories.community_id
            inner join category_input
              on category_input.slug = community_post_categories.slug
            limit 1
          ),
          inserted_category as (
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
              target_community.id,
              ${command.name},
              category_input.slug,
              ${command.emoji},
              next_sort_order.value,
              'members',
              timezone('utc', now()),
              timezone('utc', now())
            from target_community
            cross join category_input
            cross join next_sort_order
            where public.can_manage_community_categories(target_community.id)
              and not exists (select 1 from existing_category)
            returning id, name, slug, emoji, sort_order, access_scope
          )
          select
            case
              when exists (select 1 from inserted_category) then ${POST_CATEGORY_MUTATION_STATUS.created}
              when not exists (select 1 from target_community) then ${POST_CATEGORY_MUTATION_STATUS.notFound}
              when not public.can_manage_community_categories((select id from target_community)) then ${POST_CATEGORY_MUTATION_STATUS.forbidden}
              when exists (select 1 from existing_category) then ${POST_CATEGORY_MUTATION_STATUS.duplicateSlug}
              else ${POST_CATEGORY_MUTATION_STATUS.forbidden}
            end as status,
            inserted_category.id,
            inserted_category.name,
            inserted_category.slug,
            inserted_category.emoji,
            inserted_category.sort_order,
            inserted_category.access_scope
          from (select 1) result
          left join inserted_category
            on true
        `);

        return mapCategoryCreation(
          (result.rows?.[0] ?? null) as CategoryMutationRow | null
        );
      } catch (error) {
        if (isDuplicateCategorySlugError(error)) {
          return {
            status: POST_CATEGORY_MUTATION_STATUS.duplicateSlug,
          };
        }

        throw error;
      }
    });
  }

  async update(
    command: UpdateCommunityPostCategoryCommand
  ): Promise<PostCategoryUpdateResult> {
    return this.executeWithDatabase(async (database) => {
      try {
        const result = await database.execute(sql`
          with target_community as (
            select communities.id
            from public.communities
            where communities.slug = ${command.communitySlug}
            limit 1
          ),
          target_category as (
            select community_post_categories.id
            from public.community_post_categories
            inner join target_community
              on target_community.id = community_post_categories.community_id
            where community_post_categories.id = ${command.categoryId}
            limit 1
          ),
          category_input as (
            select ${createCategorySlug(command.name)} as slug
          ),
          existing_category as (
            select community_post_categories.id
            from public.community_post_categories
            inner join target_community
              on target_community.id = community_post_categories.community_id
            inner join category_input
              on category_input.slug = community_post_categories.slug
            where community_post_categories.id <> ${command.categoryId}
            limit 1
          ),
          updated_category as (
            update public.community_post_categories
            set
              name = ${command.name},
              slug = (select slug from category_input),
              emoji = ${command.emoji},
              sort_order = ${command.sortOrder},
              updated_at = timezone('utc', now())
            from target_community
            where community_post_categories.id = ${command.categoryId}
              and community_post_categories.community_id = target_community.id
              and public.can_manage_community_categories(target_community.id)
              and exists (select 1 from target_category)
              and not exists (select 1 from existing_category)
            returning
              community_post_categories.id,
              community_post_categories.name,
              community_post_categories.slug,
              community_post_categories.emoji,
              community_post_categories.sort_order,
              community_post_categories.access_scope
          )
          select
            case
              when exists (select 1 from updated_category) then ${POST_CATEGORY_MUTATION_STATUS.updated}
              when not exists (select 1 from target_community) then ${POST_CATEGORY_MUTATION_STATUS.notFound}
              when not public.can_manage_community_categories((select id from target_community)) then ${POST_CATEGORY_MUTATION_STATUS.forbidden}
              when not exists (select 1 from target_category) then ${POST_CATEGORY_MUTATION_STATUS.notFound}
              when exists (select 1 from existing_category) then ${POST_CATEGORY_MUTATION_STATUS.duplicateSlug}
              else ${POST_CATEGORY_MUTATION_STATUS.forbidden}
            end as status,
            updated_category.id,
            updated_category.name,
            updated_category.slug,
            updated_category.emoji,
            updated_category.sort_order,
            updated_category.access_scope
          from (select 1) result
          left join updated_category
            on true
        `);

        return mapCategoryUpdate(
          (result.rows?.[0] ?? null) as CategoryMutationRow | null
        );
      } catch (error) {
        if (isDuplicateCategorySlugError(error)) {
          return {
            status: POST_CATEGORY_MUTATION_STATUS.duplicateSlug,
          };
        }

        throw error;
      }
    });
  }

  async delete(
    command: DeleteCommunityPostCategoryCommand
  ): Promise<PostCategoryDeletionResult> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_community as (
          select communities.id
          from public.communities
          where communities.slug = ${command.communitySlug}
          limit 1
        ),
        target_category as (
          select community_post_categories.id, community_post_categories.community_id
          from public.community_post_categories
          inner join target_community
            on target_community.id = community_post_categories.community_id
          where community_post_categories.id = ${command.categoryId}
          limit 1
        ),
        target_replacement as (
          select community_post_categories.id
          from public.community_post_categories
          inner join target_community
            on target_community.id = community_post_categories.community_id
          where community_post_categories.id = ${command.targetCategoryId || null}
            and community_post_categories.id <> ${command.categoryId}
          limit 1
        ),
        category_counts as (
          select
            count(*) as category_count,
            (
              select count(*)
              from public.posts
              inner join target_category
                on target_category.id = posts.category_id
            ) as post_count
          from public.community_post_categories
          inner join target_community
            on target_community.id = community_post_categories.community_id
        ),
        moved_posts as (
          update public.posts
          set
            category_id = (select id from target_replacement),
            updated_at = timezone('utc', now())
          where posts.category_id = (select id from target_category)
            and public.can_manage_community_categories(posts.community_id)
            and (select post_count from category_counts) > 0
            and exists (select 1 from target_replacement)
          returning posts.id
        ),
        deleted_category as (
          delete from public.community_post_categories
          where community_post_categories.id = (select id from target_category)
            and public.can_manage_community_categories(community_post_categories.community_id)
            and (select category_count from category_counts) > 1
            and (
              (select post_count from category_counts) = 0
              or exists (select 1 from target_replacement)
            )
          returning community_post_categories.id
        )
        select
          case
            when not exists (select 1 from target_community) then ${POST_CATEGORY_MUTATION_STATUS.notFound}
            when not exists (select 1 from target_category) then ${POST_CATEGORY_MUTATION_STATUS.notFound}
            when not public.can_manage_community_categories((select id from target_community)) then ${POST_CATEGORY_MUTATION_STATUS.forbidden}
            when (select category_count from category_counts) <= 1 then ${POST_CATEGORY_MUTATION_STATUS.lastCategory}
            when (select post_count from category_counts) > 0
              and not exists (select 1 from target_replacement) then ${POST_CATEGORY_MUTATION_STATUS.categoryHasPosts}
            when exists (select 1 from deleted_category)
              and exists (select 1 from moved_posts) then ${POST_CATEGORY_MUTATION_STATUS.movedAndDeleted}
            when exists (select 1 from deleted_category) then ${POST_CATEGORY_MUTATION_STATUS.deleted}
            else ${POST_CATEGORY_MUTATION_STATUS.invalidCategory}
          end as status
      `);

      return mapDeletionStatus((result.rows?.[0] ?? null) as DeletionStatusRow | null);
    });
  }
}
