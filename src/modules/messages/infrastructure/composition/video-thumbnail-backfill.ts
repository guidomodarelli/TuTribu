import "server-only";

import { sql } from "drizzle-orm";
import { after } from "next/server";
import { Pool } from "pg";

import {
  resolveMissingVideoThumbnails,
  type ResolveMissingVideoThumbnailsResult,
} from "@/src/modules/messages/application/use-cases/resolve-missing-video-thumbnails-use-case";
import { revalidateTribeRoundCache } from "@/src/modules/messages/infrastructure/cache/tribe-round-cache-revalidation";
import { PostgresMessageVideoThumbnailRepository } from "@/src/modules/messages/infrastructure/repositories/postgres-message-video-thumbnail-repository";
import { OEmbedVideoThumbnailResolver } from "@/src/modules/messages/infrastructure/video/oembed-video-thumbnail-resolver";
import { createPostgresPool } from "@/src/modules/shared/infrastructure/database/postgres-pool";
import {
  runWithGuardedTransaction,
  type RequestDatabase,
} from "@/src/modules/shared/infrastructure/database/server-database-client";
import { getServerDatabaseEnvironment } from "@/src/modules/shared/infrastructure/database/server-environment";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

/**
 * Session GUC that carries the viewer id for row-level-security policies and the
 * `set_message_video_thumbnail` SECURITY DEFINER function.
 */
const CURRENT_USER_ID_SETTING = "app.current_user_id";

const THUMBNAIL_BACKFILL_POOL_OPERATION =
  "message_video_thumbnail_backfill_pool_idle_error";

const THUMBNAIL_BACKFILL_LOGGER_CONTEXT = {
  feature: "messages",
  operation: "resolve_missing_video_thumbnails",
  requestId: "background",
} as const;

const THUMBNAIL_BACKFILL_LOG_MESSAGE = {
  unexpectedFailure:
    "Background external video thumbnail backfill failed unexpectedly",
} as const;

type GlobalThumbnailBackfillDatabase = typeof globalThis & {
  __tuTribuThumbnailBackfillPool?: Pool;
};

/**
 * Returns the dedicated pool for the post-response thumbnail backfill, created
 * lazily so the background `after()` flow never competes for the request pool.
 *
 * @returns The shared thumbnail-backfill pool.
 */
function getThumbnailBackfillPool(): Pool {
  const globalDatabase = globalThis as GlobalThumbnailBackfillDatabase;

  if (!globalDatabase.__tuTribuThumbnailBackfillPool) {
    const { connectionString } = getServerDatabaseEnvironment();
    globalDatabase.__tuTribuThumbnailBackfillPool = createPostgresPool({
      connectionString,
      operation: THUMBNAIL_BACKFILL_POOL_OPERATION,
    });
  }

  return globalDatabase.__tuTribuThumbnailBackfillPool;
}

/**
 * Runs a callback inside a guarded transaction scoped to the viewer's RLS
 * context, so candidate reads and the SECURITY DEFINER persist honor the
 * viewer's tribe membership. The guarded transaction releases the client even
 * when the background `after()` flow is abandoned.
 *
 * @param viewerId - Identifier of the viewer whose context scopes the work.
 * @param callback - Work to run against the request-scoped database.
 * @returns The value returned by the callback.
 */
function executeWithViewerContext<T>(
  viewerId: string,
  callback: (database: RequestDatabase) => Promise<T>
): Promise<T> {
  return runWithGuardedTransaction(
    getThumbnailBackfillPool(),
    callback,
    async (database) => {
      await database.execute(
        sql`select set_config(${CURRENT_USER_ID_SETTING}, ${viewerId}, true)`
      );
    }
  );
}

/**
 * Schedules a post-response lazy backfill of missing external video thumbnails
 * for the given visible messages, then revalidates the tribe round cache when at
 * least one thumbnail became available so the next render shows it.
 *
 * No work is scheduled when there are no candidate messages, so the common
 * render (no pending thumbnails) stays free of background work.
 *
 * @param input - The tribe slug, viewer id, and ids of messages with pending
 *   video thumbnails.
 */
export function scheduleMissingVideoThumbnailBackfill({
  messageIds,
  tribeSlug,
  viewerId,
}: {
  messageIds: string[];
  tribeSlug: string;
  viewerId: string;
}): void {
  if (messageIds.length === 0) {
    return;
  }

  const logger = createServerLogger(THUMBNAIL_BACKFILL_LOGGER_CONTEXT);
  const resolveBackfill = resolveMissingVideoThumbnails({
    logger,
    messageVideoThumbnailRepository: new PostgresMessageVideoThumbnailRepository(
      (callback) => executeWithViewerContext(viewerId, callback)
    ),
    videoThumbnailResolver: new OEmbedVideoThumbnailResolver({ logger }),
  });

  after(async () => {
    try {
      const { attemptedCount }: ResolveMissingVideoThumbnailsResult =
        await resolveBackfill({ messageIds });

      // Revalidate on any first attempt, not only when a thumbnail was found:
      // a recorded attempt without a thumbnail must still propagate so the
      // round view model carries `thumbnailResolved` and the video is not
      // re-scheduled on every subsequent render.
      if (attemptedCount > 0) {
        revalidateTribeRoundCache(tribeSlug);
      }
    } catch (error) {
      logger.error({
        error,
        message: THUMBNAIL_BACKFILL_LOG_MESSAGE.unexpectedFailure,
        metadata: { tribeSlug },
      });
    }
  });
}
