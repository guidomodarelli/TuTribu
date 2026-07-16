import { sql } from "drizzle-orm";

import { TRIBE_STORY_SAVE_STATUS } from "@/src/modules/tribes/constants/tribe-story";
import type {
  GetTribeStoryQuery,
  SaveTribeStoryCommand,
  TribeStoryRepository,
  TribeStorySaveResult,
  TribeStorySettings,
} from "@/src/modules/tribes/domain/repositories/tribe-story-repository";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

type DatabaseExecutor = <T>(
  callback: (database: RequestDatabase) => Promise<T>
) => Promise<T>;

type StoryRow = {
  content: string;
};

type StorySaveRow = {
  content: string | null;
  status: string | null;
};

const POSTGRES_ERROR_CODE = {
  undefinedFunction: "42883",
  undefinedTable: "42P01",
} as const;

function isMissingStoryStorageError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const postgresError = error as { cause?: unknown; code?: string };
  const causeCode =
    postgresError.cause &&
    typeof postgresError.cause === "object" &&
    "code" in postgresError.cause
      ? (postgresError.cause as { code?: string }).code
      : undefined;

  return (
    postgresError.code === POSTGRES_ERROR_CODE.undefinedTable ||
    postgresError.code === POSTGRES_ERROR_CODE.undefinedFunction ||
    causeCode === POSTGRES_ERROR_CODE.undefinedTable ||
    causeCode === POSTGRES_ERROR_CODE.undefinedFunction
  );
}

export class PostgresTribeStoryRepository implements TribeStoryRepository {
  constructor(private readonly executeWithDatabase: DatabaseExecutor) {}

  async getByTribeSlug({
    tribeSlug,
  }: GetTribeStoryQuery): Promise<TribeStorySettings | null> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${tribeSlug}
          limit 1
        )
        select tribe_story_settings.content
        from public.tribe_story_settings
        inner join target_tribe
          on target_tribe.id = tribe_story_settings.tribe_id
        limit 1
      `);

      const row = (result.rows?.[0] ?? null) as StoryRow | null;

      return row ? { content: row.content } : null;
    }).catch((error: unknown) => {
      if (isMissingStoryStorageError(error)) {
        return null;
      }

      throw error;
    });
  }

  async save(command: SaveTribeStoryCommand): Promise<TribeStorySaveResult> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${command.tribeSlug}
          limit 1
        ),
        editable_tribe as (
          select target_tribe.id
          from target_tribe
          where public.can_manage_tribe_story(target_tribe.id)
        ),
        upserted_story as (
          insert into public.tribe_story_settings (
            tribe_id,
            content,
            updated_by,
            created_at,
            updated_at
          )
          select
            editable_tribe.id,
            ${command.content},
            public.current_app_user_id(),
            timezone('utc', now()),
            timezone('utc', now())
          from editable_tribe
          on conflict (tribe_id) do update
          set
            content = excluded.content,
            updated_by = excluded.updated_by,
            updated_at = excluded.updated_at
          returning content
        )
        select
          case
            when exists (select 1 from upserted_story) then ${TRIBE_STORY_SAVE_STATUS.updated}
            when not exists (select 1 from target_tribe) then ${TRIBE_STORY_SAVE_STATUS.notFound}
            else ${TRIBE_STORY_SAVE_STATUS.forbidden}
          end as status,
          (select content from upserted_story) as content
      `);

      const row = (result.rows?.[0] ?? null) as StorySaveRow | null;

      if (row?.status === TRIBE_STORY_SAVE_STATUS.updated) {
        if (!row.content) {
          return { status: TRIBE_STORY_SAVE_STATUS.forbidden, story: null };
        }

        return {
          status: TRIBE_STORY_SAVE_STATUS.updated,
          story: { content: row.content },
        };
      }

      if (row?.status === TRIBE_STORY_SAVE_STATUS.notFound) {
        return { status: TRIBE_STORY_SAVE_STATUS.notFound, story: null };
      }

      return { status: TRIBE_STORY_SAVE_STATUS.forbidden, story: null };
    });
  }
}
