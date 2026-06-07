import type { VideoProvider } from "@/src/modules/shared/domain/value-objects/video-provider";

/**
 * Outbound port that resolves an external video's preview/thumbnail URL.
 *
 * Implementations talk to each provider's oEmbed endpoint. YouTube thumbnails
 * are derived deterministically in the application layer, so a resolver returns
 * `null` for providers it cannot or should not resolve.
 */
export type VideoThumbnailResolver = {
  /**
   * Resolves the thumbnail URL for a single external video.
   *
   * @param provider - Provider that owns the external identifier.
   * @param externalId - Provider-specific identifier already validated by the
   *   domain parser.
   * @returns The resolved thumbnail URL, or `null` when none is available.
   */
  resolveThumbnailUrl(
    provider: VideoProvider,
    externalId: string
  ): Promise<string | null>;
};
