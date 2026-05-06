import { sql } from "drizzle-orm";

import type {
  CreateTribePostCategoryCommand,
  DeleteTribePostCategoryCommand,
  UpdateTribePostCategoryCommand,
} from "@/src/modules/posts/application/commands/tribe-post-command";
import type { TribePostCategoryResult } from "@/src/modules/posts/application/results/tribe-feed-result";
import type {
  PostCategoryCreationResult,
  PostCategoryDeletionResult,
  PostCategoryUpdateResult,
} from "@/src/modules/posts/application/results/post-category-result";
import { POST_CATEGORY_MUTATION_STATUS } from "@/src/modules/posts/constants/post-feed";
import type {
  ListTribePostCategoriesQuery,
  PostCategoryRepository,
} from "@/src/modules/posts/domain/repositories/post-category-repository";
import { createTribePostCategory } from "@/src/modules/posts/infrastructure/mappers/tribe-feed-view-model-mapper";
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
  tribeSlugKey: "tribe_post_categories_tribe_id_slug_key",
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

function mapCategory(row: CategoryRow): TribePostCategoryResult {
  return createTribePostCategory({
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
    postgresError.constraint === POST_CATEGORY_CONSTRAINT.tribeSlugKey
  );
}

export class PostgresPostCategoryRepository implements PostCategoryRepository {
  constructor(private readonly executeWithDatabase: DatabaseExecutor) {}

  async listByTribeSlug({
    tribeSlug,
  }: ListTribePostCategoriesQuery): Promise<TribePostCategoryResult[]> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${tribeSlug}
          limit 1
        )
        select
          tribe_post_categories.id,
          tribe_post_categories.name,
          tribe_post_categories.slug,
          tribe_post_categories.emoji,
          tribe_post_categories.sort_order,
          tribe_post_categories.access_scope
        from public.tribe_post_categories
        inner join target_tribe
          on target_tribe.id = tribe_post_categories.tribe_id
        order by tribe_post_categories.sort_order asc, tribe_post_categories.name asc
      `);

      return ((result.rows ?? []) as CategoryRow[]).map(mapCategory);
    });
  }

  async create(
    command: CreateTribePostCategoryCommand
  ): Promise<PostCategoryCreationResult> {
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
            from public.tribe_post_categories
            inner join target_tribe
              on target_tribe.id = tribe_post_categories.tribe_id
          ),
          category_input as (
            select ${createCategorySlug(command.name)} as slug
          ),
          existing_category as (
            select tribe_post_categories.id
            from public.tribe_post_categories
            inner join target_tribe
              on target_tribe.id = tribe_post_categories.tribe_id
            inner join category_input
              on category_input.slug = tribe_post_categories.slug
            limit 1
          ),
          inserted_category as (
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
              target_tribe.id,
              ${command.name},
              category_input.slug,
              ${command.emoji},
              next_sort_order.value,
              'members',
              timezone('utc', now()),
              timezone('utc', now())
            from target_tribe
            cross join category_input
            cross join next_sort_order
            where public.can_manage_tribe_categories(target_tribe.id)
              and not exists (select 1 from existing_category)
            returning id, name, slug, emoji, sort_order, access_scope
          )
          select
            case
              when exists (select 1 from inserted_category) then ${POST_CATEGORY_MUTATION_STATUS.created}
              when not exists (select 1 from target_tribe) then ${POST_CATEGORY_MUTATION_STATUS.notFound}
              when not public.can_manage_tribe_categories((select id from target_tribe)) then ${POST_CATEGORY_MUTATION_STATUS.forbidden}
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
    command: UpdateTribePostCategoryCommand
  ): Promise<PostCategoryUpdateResult> {
    return this.executeWithDatabase(async (database) => {
      try {
        const result = await database.execute(sql`
          with target_tribe as (
            select tribes.id
            from public.tribes
            where tribes.slug = ${command.tribeSlug}
            limit 1
          ),
          target_category as (
            select tribe_post_categories.id
            from public.tribe_post_categories
            inner join target_tribe
              on target_tribe.id = tribe_post_categories.tribe_id
            where tribe_post_categories.id = ${command.categoryId}
            limit 1
          ),
          category_input as (
            select ${createCategorySlug(command.name)} as slug
          ),
          existing_category as (
            select tribe_post_categories.id
            from public.tribe_post_categories
            inner join target_tribe
              on target_tribe.id = tribe_post_categories.tribe_id
            inner join category_input
              on category_input.slug = tribe_post_categories.slug
            where tribe_post_categories.id <> ${command.categoryId}
            limit 1
          ),
          updated_category as (
            update public.tribe_post_categories
            set
              name = ${command.name},
              slug = (select slug from category_input),
              emoji = ${command.emoji},
              sort_order = ${command.sortOrder},
              updated_at = timezone('utc', now())
            from target_tribe
            where tribe_post_categories.id = ${command.categoryId}
              and tribe_post_categories.tribe_id = target_tribe.id
              and public.can_manage_tribe_categories(target_tribe.id)
              and exists (select 1 from target_category)
              and not exists (select 1 from existing_category)
            returning
              tribe_post_categories.id,
              tribe_post_categories.name,
              tribe_post_categories.slug,
              tribe_post_categories.emoji,
              tribe_post_categories.sort_order,
              tribe_post_categories.access_scope
          )
          select
            case
              when exists (select 1 from updated_category) then ${POST_CATEGORY_MUTATION_STATUS.updated}
              when not exists (select 1 from target_tribe) then ${POST_CATEGORY_MUTATION_STATUS.notFound}
              when not public.can_manage_tribe_categories((select id from target_tribe)) then ${POST_CATEGORY_MUTATION_STATUS.forbidden}
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
    command: DeleteTribePostCategoryCommand
  ): Promise<PostCategoryDeletionResult> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${command.tribeSlug}
          limit 1
        ),
        target_category as (
          select tribe_post_categories.id, tribe_post_categories.tribe_id
          from public.tribe_post_categories
          inner join target_tribe
            on target_tribe.id = tribe_post_categories.tribe_id
          where tribe_post_categories.id = ${command.categoryId}
          limit 1
        ),
        target_replacement as (
          select tribe_post_categories.id
          from public.tribe_post_categories
          inner join target_tribe
            on target_tribe.id = tribe_post_categories.tribe_id
          where tribe_post_categories.id = ${command.targetCategoryId || null}
            and tribe_post_categories.id <> ${command.categoryId}
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
          from public.tribe_post_categories
          inner join target_tribe
            on target_tribe.id = tribe_post_categories.tribe_id
        ),
        moved_posts as (
          update public.posts
          set
            category_id = (select id from target_replacement),
            updated_at = timezone('utc', now())
          where posts.category_id = (select id from target_category)
            and public.can_manage_tribe_categories(posts.tribe_id)
            and (select post_count from category_counts) > 0
            and exists (select 1 from target_replacement)
          returning posts.id
        ),
        deleted_category as (
          delete from public.tribe_post_categories
          where tribe_post_categories.id = (select id from target_category)
            and public.can_manage_tribe_categories(tribe_post_categories.tribe_id)
            and (select category_count from category_counts) > 1
            and (
              (select post_count from category_counts) = 0
              or exists (select 1 from target_replacement)
            )
          returning tribe_post_categories.id
        )
        select
          case
            when not exists (select 1 from target_tribe) then ${POST_CATEGORY_MUTATION_STATUS.notFound}
            when not exists (select 1 from target_category) then ${POST_CATEGORY_MUTATION_STATUS.notFound}
            when not public.can_manage_tribe_categories((select id from target_tribe)) then ${POST_CATEGORY_MUTATION_STATUS.forbidden}
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
