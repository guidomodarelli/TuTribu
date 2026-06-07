/**
 * Builds deterministic preview/thumbnail sources for external video providers
 * whose thumbnail can be derived from the video identifier alone, with no
 * network round trip.
 *
 * Only YouTube exposes a stable, identifier-derivable thumbnail URL. Vimeo,
 * Wistia, and Loom require an oEmbed lookup (see
 * `build-video-oembed-request`), so this builder returns `null` for them and
 * callers fall back to the persisted `thumbnailUrl`.
 *
 * @module shared/application/video/build-video-thumbnail-source
 */

import {
  VIDEO_PROVIDER,
  type VideoProvider,
} from "@/src/modules/shared/domain/value-objects/video-provider";

/**
 * Host that serves YouTube video thumbnails without requiring the Data API.
 */
const YOUTUBE_THUMBNAIL_HOST = "https://i.ytimg.com/vi";

/**
 * Thumbnail variant requested from YouTube. `hqdefault` (480x360) is always
 * generated for every public video, unlike `maxresdefault`, which only exists
 * for high-resolution uploads.
 */
const YOUTUBE_THUMBNAIL_VARIANT = "hqdefault.jpg";

/**
 * Builds a deterministic thumbnail URL for the providers that expose one.
 *
 * @param provider - Supported video provider associated with the external ID.
 * @param externalId - Provider-specific identifier already validated by the
 *   domain parser. For YouTube this is the 11-character video ID.
 * @returns A thumbnail URL when the provider exposes a deterministic one, or
 *   `null` when the thumbnail must be resolved through oEmbed instead.
 */
export function buildVideoThumbnailSource(
  provider: VideoProvider,
  externalId: string
): string | null {
  if (provider === VIDEO_PROVIDER.youtube) {
    return `${YOUTUBE_THUMBNAIL_HOST}/${externalId}/${YOUTUBE_THUMBNAIL_VARIANT}`;
  }

  return null;
}
