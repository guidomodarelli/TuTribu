import { sql } from "drizzle-orm";

import {
  TRIBE_STORY_SAVE_STATUS,
} from "@/src/modules/tribes/constants/tribe-story";
import type {
  GetTribeStoryQuery,
  SaveTribeStoryCommand,
  TribeStoryMediaItem,
  TribeStoryMediaType,
  TribeStoryOnlineMember,
  TribeStoryRepository,
  TribeStorySaveResult,
  TribeStorySettings,
  TribeStoryStats,
} from "@/src/modules/tribes/domain/repositories/tribe-story-repository";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

type DatabaseExecutor = <T>(
  callback: (database: RequestDatabase) => Promise<T>
) => Promise<T>;

type StoryRow = {
  content: string;
  website_url: string | null;
};

type StoryMediaRow = {
  external_video_id: string | null;
  id: string;
  media_type: string;
  sort_order: number;
  url: string | null;
  video_provider: string | null;
};

type StoryStatsRow = {
  admin_count: number | string;
  cover_url: string | null;
  created_at: string | Date;
  logo_url: string | null;
  member_count: number | string;
  name: string;
  online_count: number | string;
  open_free_join_available: boolean;
  open_free_join_enabled: boolean;
};

type StorySaveRow = {
  content: string | null;
  media: StoryMediaRow[] | null;
  status: string | null;
  website_url: string | null;
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

function mapMediaRow(row: StoryMediaRow): TribeStoryMediaItem {
  return {
    externalVideoId: row.external_video_id,
    id: row.id,
    mediaType: row.media_type as TribeStoryMediaType,
    sortOrder: row.sort_order,
    url: row.url,
    videoProvider: row.video_provider,
  };
}

function mapStats(row: StoryStatsRow): TribeStoryStats {
  return {
    adminCount: Number(row.admin_count),
    coverUrl: row.cover_url,
    createdAt: new Date(row.created_at).toISOString(),
    logoUrl: row.logo_url,
    memberCount: Number(row.member_count),
    name: row.name,
    onlineCount: Number(row.online_count),
    openFreeJoinAvailable: Boolean(row.open_free_join_available),
    openFreeJoinEnabled: Boolean(row.open_free_join_enabled),
  };
}

export class PostgresTribeStoryRepository implements TribeStoryRepository {
  constructor(private readonly executeWithDatabase: DatabaseExecutor) {}

  async getByTribeSlug({
    tribeSlug,
  }: GetTribeStoryQuery): Promise<TribeStorySettings | null> {
    return this.executeWithDatabase(async (database) => {
      const storyResult = await database.execute(sql`
        select
          story_about.content,
          story_about.website_url
        from public.tribe_story_about(${tribeSlug}) as story_about
      `);
      const storyRow = (storyResult.rows?.[0] ?? null) as StoryRow | null;

      if (!storyRow) {
        return null;
      }

      const mediaResult = await database.execute(sql`
        select
          story_media.id,
          story_media.media_type,
          story_media.url,
          story_media.video_provider,
          story_media.external_video_id,
          story_media.sort_order
        from public.tribe_story_about_media(${tribeSlug}) as story_media
      `);
      const mediaRows = (mediaResult.rows ?? []) as StoryMediaRow[];

      return {
        content: storyRow.content,
        media: mediaRows.map(mapMediaRow),
        websiteUrl: storyRow.website_url,
      };
    }).catch((error: unknown) => {
      if (isMissingStoryStorageError(error)) {
        return null;
      }

      throw error;
    });
  }

  async getStatsByTribeSlug({
    tribeSlug,
  }: GetTribeStoryQuery): Promise<TribeStoryStats | null> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        select
          story_stats.name,
          story_stats.logo_url,
          story_stats.cover_url,
          story_stats.member_count,
          story_stats.admin_count,
          story_stats.online_count,
          story_stats.created_at,
          story_stats.open_free_join_available,
          story_stats.open_free_join_enabled
        from public.tribe_story_about_stats(${tribeSlug}) as story_stats
      `);
      const row = (result.rows?.[0] ?? null) as StoryStatsRow | null;

      return row ? mapStats(row) : null;
    }).catch((error: unknown) => {
      if (isMissingStoryStorageError(error)) {
        return null;
      }

      throw error;
    });
  }

  async listOnlineMembersByTribeSlug({
    tribeSlug,
  }: GetTribeStoryQuery): Promise<TribeStoryOnlineMember[]> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        select
          online_members.name,
          online_members.image
        from public.tribe_story_about_online_members(${tribeSlug}) as online_members
      `);

      return ((result.rows ?? []) as Array<{
        image: string | null;
        name: string | null;
      }>).flatMap((row) =>
        row.name ? [{ image: row.image, name: row.name }] : []
      );
    }).catch((error: unknown) => {
      if (isMissingStoryStorageError(error)) {
        return [];
      }

      throw error;
    });
  }

  async listPublicStorySlugs(): Promise<string[]> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        select public_story.slug
        from public.list_public_tribe_story_slugs() as public_story
      `);

      return ((result.rows ?? []) as Array<{ slug: string | null }>).flatMap(
        (row) => (row.slug ? [row.slug] : [])
      );
    }).catch((error: unknown) => {
      if (isMissingStoryStorageError(error)) {
        return [];
      }

      throw error;
    });
  }

  async save(command: SaveTribeStoryCommand): Promise<TribeStorySaveResult> {
    return this.executeWithDatabase(async (database) => {
      const serializedMedia = JSON.stringify(
        command.media.map((mediaItem) => ({
          external_video_id: mediaItem.externalVideoId,
          media_type: mediaItem.mediaType,
          sort_order: mediaItem.sortOrder,
          url: mediaItem.url,
          video_provider: mediaItem.videoProvider,
        }))
      );
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
            website_url,
            updated_by,
            created_at,
            updated_at
          )
          select
            editable_tribe.id,
            ${command.content},
            ${command.websiteUrl},
            public.current_app_user_id(),
            timezone('utc', now()),
            timezone('utc', now())
          from editable_tribe
          on conflict (tribe_id) do update
          set
            content = excluded.content,
            website_url = excluded.website_url,
            updated_by = excluded.updated_by,
            updated_at = excluded.updated_at
          returning content, website_url
        ),
        removed_media as (
          delete from public.tribe_story_media
          where tribe_story_media.tribe_id in (select editable_tribe.id from editable_tribe)
          returning tribe_story_media.id
        ),
        inserted_media as (
          insert into public.tribe_story_media (
            tribe_id,
            media_type,
            url,
            video_provider,
            external_video_id,
            sort_order,
            created_at,
            updated_at
          )
          select
            editable_tribe.id,
            media_item.media_type,
            media_item.url,
            media_item.video_provider,
            media_item.external_video_id,
            media_item.sort_order,
            timezone('utc', now()),
            timezone('utc', now())
          from editable_tribe
          cross join jsonb_to_recordset(${serializedMedia}::jsonb) as media_item(
            media_type text,
            url text,
            video_provider text,
            external_video_id text,
            sort_order integer
          )
          returning
            tribe_story_media.id,
            tribe_story_media.media_type,
            tribe_story_media.url,
            tribe_story_media.video_provider,
            tribe_story_media.external_video_id,
            tribe_story_media.sort_order
        )
        select
          case
            when exists (select 1 from upserted_story) then ${TRIBE_STORY_SAVE_STATUS.updated}
            when not exists (select 1 from target_tribe) then ${TRIBE_STORY_SAVE_STATUS.notFound}
            else ${TRIBE_STORY_SAVE_STATUS.forbidden}
          end as status,
          (select content from upserted_story) as content,
          (select website_url from upserted_story) as website_url,
          (
            select coalesce(
              jsonb_agg(
                jsonb_build_object(
                  'id', inserted_media.id,
                  'media_type', inserted_media.media_type,
                  'url', inserted_media.url,
                  'video_provider', inserted_media.video_provider,
                  'external_video_id', inserted_media.external_video_id,
                  'sort_order', inserted_media.sort_order
                )
                order by inserted_media.sort_order
              ),
              '[]'::jsonb
            )
            from inserted_media
          ) as media
      `);

      const row = (result.rows?.[0] ?? null) as StorySaveRow | null;

      if (row?.status === TRIBE_STORY_SAVE_STATUS.updated) {
        if (!row.content) {
          return { status: TRIBE_STORY_SAVE_STATUS.forbidden, story: null };
        }

        // The tribe identity references the same reserved uploads, so the
        // attachment state is refreshed from both sources in one place.
        await database.execute(sql`
          select public.refresh_tribe_image_attachments(target_tribe.id)
          from public.tribes as target_tribe
          where target_tribe.slug = ${command.tribeSlug}
        `);

        return {
          status: TRIBE_STORY_SAVE_STATUS.updated,
          story: {
            content: row.content,
            media: (row.media ?? []).map(mapMediaRow),
            websiteUrl: row.website_url,
          },
        };
      }

      if (row?.status === TRIBE_STORY_SAVE_STATUS.notFound) {
        return { status: TRIBE_STORY_SAVE_STATUS.notFound, story: null };
      }

      return { status: TRIBE_STORY_SAVE_STATUS.forbidden, story: null };
    });
  }
}
