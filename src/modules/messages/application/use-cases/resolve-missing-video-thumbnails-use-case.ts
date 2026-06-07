import type { MessageMediaResult } from "@/src/modules/messages/application/results/tribe-round-result";
import {
  MESSAGE_MEDIA_KIND,
  MESSAGE_VIDEO_THUMBNAIL_BACKFILL,
} from "@/src/modules/messages/constants/message-round";
import type { MessageVideoThumbnailRepository } from "@/src/modules/messages/domain/repositories/message-video-thumbnail-repository";
import type { VideoThumbnailResolver } from "@/src/modules/messages/domain/repositories/video-thumbnail-resolver";
import { VIDEO_PROVIDER } from "@/src/modules/shared/domain/value-objects/video-provider";

/**
 * Minimal logger surface used to report capped backfill batches.
 */
type ResolveMissingVideoThumbnailsLogger = {
  info(input: { message: string; metadata?: Record<string, unknown> }): void;
};

type ResolveMissingVideoThumbnailsDependencies = {
  logger?: ResolveMissingVideoThumbnailsLogger;
  messageVideoThumbnailRepository: MessageVideoThumbnailRepository;
  videoThumbnailResolver: VideoThumbnailResolver;
};

/**
 * Query for the lazy thumbnail backfill: the messages currently visible whose
 * videos may still need a thumbnail.
 */
export type ResolveMissingVideoThumbnailsQuery = {
  messageIds: string[];
};

/**
 * Outcome of a backfill pass.
 */
export type ResolveMissingVideoThumbnailsResult = {
  /**
   * Number of videos whose first resolution attempt was recorded in this pass,
   * whether or not a thumbnail was found. Drives cache revalidation so the
   * attempted flag propagates and the video is not re-scheduled next render.
   */
  attemptedCount: number;
  /** Number of videos that gained a usable thumbnail in this pass. */
  resolvedCount: number;
};

const THUMBNAIL_BACKFILL_LOG_MESSAGE = {
  batchCapped:
    "Capped external video thumbnail backfill batch; remainder deferred to later renders",
} as const;

/**
 * Whether a media item is an external video that still needs an oEmbed-resolved
 * thumbnail (not YouTube, which is derived deterministically, and not already
 * carrying a persisted thumbnail).
 *
 * @param mediaItem - A single media attachment from a round message.
 * @returns Whether the item is a thumbnail-less non-YouTube video.
 */
function isVideoNeedingThumbnail(mediaItem: MessageMediaResult): boolean {
  return (
    mediaItem.kind === MESSAGE_MEDIA_KIND.video &&
    mediaItem.provider !== VIDEO_PROVIDER.youtube &&
    !mediaItem.thumbnailUrl &&
    !mediaItem.thumbnailResolved
  );
}

/**
 * Selects the ids of messages whose attached videos still need a thumbnail,
 * letting the caller skip the lazy backfill entirely when nothing is pending.
 *
 * @param messages - Round messages with their unified media list.
 * @returns Ids of messages that have at least one thumbnail-less external video.
 */
export function selectMessageIdsNeedingVideoThumbnail(
  messages: ReadonlyArray<{ id: string; media?: MessageMediaResult[] }>
): string[] {
  return messages
    .filter((message) => (message.media ?? []).some(isVideoNeedingThumbnail))
    .map((message) => message.id);
}

/**
 * Resolves and persists thumbnails for the visible messages' external videos
 * that do not have one yet.
 *
 * The candidate query already excludes videos resolved deterministically
 * (YouTube) and those that were attempted before, so a video without an
 * available thumbnail is not re-fetched on every render. Each attempt is
 * persisted (even when no thumbnail is found) to record that it ran.
 *
 * @param dependencies - The candidate repository, the oEmbed resolver, and an
 *   optional logger.
 * @returns A runner that resolves missing thumbnails for the given messages.
 */
export function resolveMissingVideoThumbnails({
  logger,
  messageVideoThumbnailRepository,
  videoThumbnailResolver,
}: ResolveMissingVideoThumbnailsDependencies) {
  return async (
    query: ResolveMissingVideoThumbnailsQuery
  ): Promise<ResolveMissingVideoThumbnailsResult> => {
    const messageIds = Array.from(new Set(query.messageIds)).filter(
      (messageId) => messageId.length > 0
    );

    if (messageIds.length === 0) {
      return { attemptedCount: 0, resolvedCount: 0 };
    }

    const candidates =
      await messageVideoThumbnailRepository.listUnresolvedVideos({ messageIds });

    if (candidates.length === 0) {
      return { attemptedCount: 0, resolvedCount: 0 };
    }

    const batch = candidates.slice(
      0,
      MESSAGE_VIDEO_THUMBNAIL_BACKFILL.maxPerRequest
    );

    if (candidates.length > batch.length) {
      logger?.info({
        message: THUMBNAIL_BACKFILL_LOG_MESSAGE.batchCapped,
        metadata: {
          deferred: candidates.length - batch.length,
          processed: batch.length,
        },
      });
    }

    const outcomes = await Promise.all(
      batch.map(async (candidate) => {
        const thumbnailUrl = await videoThumbnailResolver.resolveThumbnailUrl(
          candidate.provider,
          candidate.externalId
        );
        const persisted = await messageVideoThumbnailRepository.persistThumbnail({
          thumbnailUrl,
          videoId: candidate.id,
        });

        return { hasThumbnail: persisted && thumbnailUrl !== null, persisted };
      })
    );

    return {
      attemptedCount: outcomes.filter((outcome) => outcome.persisted).length,
      resolvedCount: outcomes.filter((outcome) => outcome.hasThumbnail).length,
    };
  };
}
