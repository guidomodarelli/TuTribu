/**
 * Provides presentation-safe embed source builders for supported external video providers.
 *
 * @module shared/application/video/build-player-embed-source
 */

import {
  VIDEO_PROVIDER,
  type VideoProvider,
} from "@/src/modules/shared/domain/value-objects/video-provider";

/**
 * Identifies the player endpoint used to embed Vimeo videos.
 */
const VIMEO_PLAYER_URL_PREFIX = "https://player.vimeo.com/video/";

/**
 * Identifies the player endpoint used to embed Wistia videos.
 */
const WISTIA_PLAYER_URL_PREFIX = "https://fast.wistia.net/embed/iframe/";

/**
 * Identifies the player endpoint used to embed Loom videos.
 */
const LOOM_PLAYER_URL_PREFIX = "https://www.loom.com/embed/";

/**
 * Identifies the player endpoint used to embed YouTube videos.
 */
const YOUTUBE_PLAYER_URL_PREFIX = "https://www.youtube.com/embed/";

/**
 * Separates Vimeo video IDs from unlisted hashes in stored external IDs.
 */
const VIMEO_UNLISTED_HASH_SEPARATOR = ":";

/**
 * Names the Vimeo query parameter used for unlisted video hashes.
 */
const VIMEO_HASH_QUERY_PARAM = "h";

/**
 * Lists the browser permissions required by supported embedded video players.
 */
export const PLAYER_IFRAME_ALLOW =
  "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen";

/**
 * Builds the Vimeo player source URL, preserving private-video hashes when present.
 *
 * @param externalId - Vimeo numeric ID, optionally suffixed with `:<hash>`.
 * @returns Embed URL for the Vimeo iframe player.
 */
function buildVimeoEmbedSource(externalId: string): string {
  const [id, hash] = externalId.split(VIMEO_UNLISTED_HASH_SEPARATOR);
  if (hash) {
    const playerUrl = new URL(`${VIMEO_PLAYER_URL_PREFIX}${id}`);
    playerUrl.searchParams.set(VIMEO_HASH_QUERY_PARAM, hash);
    return playerUrl.toString();
  }

  return `${VIMEO_PLAYER_URL_PREFIX}${id}`;
}

/**
 * Builds an iframe player source URL for a supported external video provider.
 *
 * @param provider - Supported video provider associated with the external ID.
 * @param externalId - Provider-specific video identifier already validated by the domain parser.
 * @returns Embed URL for the provider, or an empty string when the provider is unknown.
 */
export function buildPlayerEmbedSource(
  provider: VideoProvider,
  externalId: string
): string {
  switch (provider) {
    case VIDEO_PROVIDER.vimeo:
      return buildVimeoEmbedSource(externalId);
    case VIDEO_PROVIDER.wistia:
      return `${WISTIA_PLAYER_URL_PREFIX}${externalId}`;
    case VIDEO_PROVIDER.loom:
      return `${LOOM_PLAYER_URL_PREFIX}${externalId}`;
    case VIDEO_PROVIDER.youtube:
      return `${YOUTUBE_PLAYER_URL_PREFIX}${externalId}`;
    default:
      return "";
  }
}
