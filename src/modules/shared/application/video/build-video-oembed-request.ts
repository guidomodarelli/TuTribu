/**
 * Builds the oEmbed request URL used to resolve a thumbnail for the external
 * video providers that do not expose a deterministic thumbnail URL (Vimeo,
 * Wistia, Loom).
 *
 * YouTube thumbnails are derived locally (see `build-video-thumbnail-source`),
 * so this builder returns `null` for YouTube to keep it out of the network path.
 *
 * @module shared/application/video/build-video-oembed-request
 */

import {
  VIDEO_PROVIDER,
  type VideoProvider,
} from "@/src/modules/shared/domain/value-objects/video-provider";

/**
 * oEmbed discovery endpoints per provider. Each provider accepts a public video
 * URL through the `url` query parameter and returns a `thumbnail_url` field.
 */
const OEMBED_ENDPOINT = {
  loom: "https://www.loom.com/v1/oembed",
  vimeo: "https://vimeo.com/api/oembed.json",
  wistia: "https://fast.wistia.com/oembed.json",
} as const;

/**
 * Public video URL prefixes used to reconstruct the canonical URL each oEmbed
 * endpoint expects from the stored external identifier.
 */
const VIDEO_PAGE_URL = {
  loomShare: "https://www.loom.com/share/",
  vimeo: "https://vimeo.com/",
  wistiaEmbedIframe: "https://fast.wistia.net/embed/iframe/",
} as const;

/**
 * Separates the Vimeo numeric ID from its unlisted hash in the stored external
 * identifier (`<id>:<hash>`).
 */
const VIMEO_UNLISTED_HASH_SEPARATOR = ":";

/**
 * Names the query parameter every oEmbed endpoint reads the target video URL
 * from.
 */
const OEMBED_URL_QUERY_PARAM = "url";

/**
 * Reconstructs the canonical public Vimeo URL, preserving the unlisted hash as
 * a path segment so private videos resolve through oEmbed.
 *
 * @param externalId - Vimeo numeric ID, optionally suffixed with `:<hash>`.
 * @returns Canonical Vimeo video URL.
 */
function buildVimeoVideoUrl(externalId: string): string {
  const [id, hash] = externalId.split(VIMEO_UNLISTED_HASH_SEPARATOR);

  if (hash) {
    return `${VIDEO_PAGE_URL.vimeo}${id}/${hash}`;
  }

  return `${VIDEO_PAGE_URL.vimeo}${id}`;
}

/**
 * Resolves the canonical public video URL the oEmbed endpoint expects for a
 * given provider and identifier.
 *
 * @param provider - Provider that owns the external identifier.
 * @param externalId - Provider-specific identifier already validated upstream.
 * @returns Canonical public video URL, or `null` when the provider has no
 *   oEmbed-based resolution.
 */
function buildVideoPageUrl(
  provider: VideoProvider,
  externalId: string
): string | null {
  switch (provider) {
    case VIDEO_PROVIDER.vimeo:
      return buildVimeoVideoUrl(externalId);
    case VIDEO_PROVIDER.wistia:
      return `${VIDEO_PAGE_URL.wistiaEmbedIframe}${externalId}`;
    case VIDEO_PROVIDER.loom:
      return `${VIDEO_PAGE_URL.loomShare}${externalId}`;
    default:
      return null;
  }
}

/**
 * Builds the oEmbed request URL whose response carries the video's
 * `thumbnail_url` for providers without a deterministic thumbnail.
 *
 * @param provider - Supported video provider associated with the external ID.
 * @param externalId - Provider-specific identifier already validated by the
 *   domain parser.
 * @returns The oEmbed request URL, or `null` when the provider resolves its
 *   thumbnail deterministically (YouTube) or is unknown.
 */
export function buildVideoOEmbedRequestUrl(
  provider: VideoProvider,
  externalId: string
): string | null {
  const videoPageUrl = buildVideoPageUrl(provider, externalId);

  if (!videoPageUrl) {
    return null;
  }

  const endpoint =
    provider === VIDEO_PROVIDER.vimeo
      ? OEMBED_ENDPOINT.vimeo
      : provider === VIDEO_PROVIDER.wistia
        ? OEMBED_ENDPOINT.wistia
        : OEMBED_ENDPOINT.loom;

  const requestUrl = new URL(endpoint);
  requestUrl.searchParams.set(OEMBED_URL_QUERY_PARAM, videoPageUrl);

  return requestUrl.toString();
}
