import type { VideoProvider } from "@/src/modules/shared/domain/value-objects/video-provider";

/**
 * An attached external video whose thumbnail has not been resolved yet and is a
 * candidate for lazy oEmbed backfill.
 */
export type UnresolvedMessageVideo = {
  externalId: string;
  id: string;
  provider: VideoProvider;
};

/**
 * Port for reading thumbnail-less external videos and persisting their resolved
 * thumbnails. Persistence goes through a SECURITY DEFINER function so any member
 * who can read the tribe content (not only the message author) can backfill a
 * thumbnail while viewing the round.
 */
export type MessageVideoThumbnailRepository = {
  /**
   * Lists attached videos in the given messages that still need a thumbnail
   * resolution attempt (no thumbnail and no prior attempt), excluding providers
   * resolved deterministically in the application layer.
   *
   * @param query - Messages whose videos should be inspected.
   * @returns The videos pending a thumbnail resolution.
   */
  listUnresolvedVideos(query: {
    messageIds: string[];
  }): Promise<UnresolvedMessageVideo[]>;

  /**
   * Persists a resolved thumbnail (or marks the attempt when none was found)
   * for a single video, idempotently.
   *
   * @param command - The video and the thumbnail URL to persist (`null` when no
   *   thumbnail is available; the attempt is still recorded).
   * @returns Whether a row was updated (false when it was already resolved).
   */
  persistThumbnail(command: {
    thumbnailUrl: string | null;
    videoId: string;
  }): Promise<boolean>;
};
