import { sql } from "drizzle-orm";

import { MESSAGE_VIDEO_THUMBNAIL_BACKFILL } from "@/src/modules/messages/constants/message-round";
import type {
  MessageVideoThumbnailRepository,
  UnresolvedMessageVideo,
} from "@/src/modules/messages/domain/repositories/message-video-thumbnail-repository";
import {
  VIDEO_PROVIDER,
  type VideoProvider,
} from "@/src/modules/shared/domain/value-objects/video-provider";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

type DatabaseExecutor = <T>(
  callback: (database: RequestDatabase) => Promise<T>
) => Promise<T>;

type UnresolvedVideoRow = {
  external_video_id: string | null;
  external_video_provider: string | null;
  id: string;
};

type PersistThumbnailRow = {
  persisted: boolean | null;
};

/**
 * Narrows a raw provider string from the database to a {@link VideoProvider}.
 *
 * @param value - Provider value read from the row.
 * @returns Whether the value is a supported video provider.
 */
function isVideoProvider(value: string | null): value is VideoProvider {
  return (
    value === VIDEO_PROVIDER.youtube ||
    value === VIDEO_PROVIDER.vimeo ||
    value === VIDEO_PROVIDER.wistia ||
    value === VIDEO_PROVIDER.loom
  );
}

/**
 * Postgres adapter for reading thumbnail-less external videos and persisting
 * their resolved thumbnails through the `set_message_video_thumbnail` SECURITY
 * DEFINER function, so a non-author tribemate can backfill while viewing.
 */
export class PostgresMessageVideoThumbnailRepository
  implements MessageVideoThumbnailRepository
{
  private readonly execute: DatabaseExecutor;

  constructor(execute: DatabaseExecutor) {
    this.execute = execute;
  }

  /**
   * Lists attached videos pending a thumbnail resolution attempt for the given
   * messages, excluding YouTube (resolved deterministically in the app). A video
   * whose previous attempt found no thumbnail is included again once the retry
   * cooldown has elapsed and it has not become terminal.
   *
   * @param query - Messages whose videos should be inspected.
   * @returns The videos pending a thumbnail resolution.
   */
  async listUnresolvedVideos(query: {
    messageIds: string[];
  }): Promise<UnresolvedMessageVideo[]> {
    if (query.messageIds.length === 0) {
      return [];
    }

    return this.execute(async (database) => {
      const result = await database.execute(sql`
        select
          message_videos.id,
          message_videos.external_video_provider,
          message_videos.external_video_id
        from public.message_videos
        where message_videos.message_id = any(${sql.param(query.messageIds)}::uuid[])
          and message_videos.thumbnail_url is null
          and message_videos.thumbnail_resolved_at is null
          and message_videos.external_video_provider <> ${VIDEO_PROVIDER.youtube}
          and (
            message_videos.thumbnail_last_attempt_at is null
            or message_videos.thumbnail_last_attempt_at
              < timezone('utc', now())
                - make_interval(mins => ${sql.param(MESSAGE_VIDEO_THUMBNAIL_BACKFILL.retryCooldownMinutes)}::integer)
          )
      `);

      const rows = (result.rows ?? []) as UnresolvedVideoRow[];

      return rows.flatMap((row) => {
        if (!isVideoProvider(row.external_video_provider) || !row.external_video_id) {
          return [];
        }

        return [
          {
            externalId: row.external_video_id,
            id: row.id,
            provider: row.external_video_provider,
          },
        ];
      });
    });
  }

  /**
   * Records a resolution attempt for a single video through the SECURITY DEFINER
   * function, passing the attempt cap so a miss below the cap stays retryable and
   * the retry cooldown so concurrent misses within one window collapse to a
   * single counted attempt instead of burning the cap on a transient outage.
   *
   * @param command - The video and the thumbnail URL to persist.
   * @returns Whether the function updated a row.
   */
  async persistThumbnail(command: {
    thumbnailUrl: string | null;
    videoId: string;
  }): Promise<boolean> {
    return this.execute(async (database) => {
      const result = await database.execute(sql`
        select public.set_message_video_thumbnail(
          ${command.videoId}::uuid,
          ${command.thumbnailUrl}::text,
          ${sql.param(MESSAGE_VIDEO_THUMBNAIL_BACKFILL.maxAttempts)}::integer,
          ${sql.param(MESSAGE_VIDEO_THUMBNAIL_BACKFILL.retryCooldownMinutes)}::integer
        ) as persisted
      `);

      const row = (result.rows?.[0] ?? null) as PersistThumbnailRow | null;

      return Boolean(row?.persisted);
    });
  }
}
