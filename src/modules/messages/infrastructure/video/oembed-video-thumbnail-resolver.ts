import "server-only";

import type { VideoThumbnailResolver } from "@/src/modules/messages/domain/repositories/video-thumbnail-resolver";
import { buildVideoOEmbedRequestUrl } from "@/src/modules/shared/application/video/build-video-oembed-request";
import type { VideoProvider } from "@/src/modules/shared/domain/value-objects/video-provider";
import {
  fetchWithResilience,
  type FetchResilienceOptions,
  type HttpFetcher,
  type HttpResponse,
} from "@/src/modules/shared/infrastructure/http/fetch-with-resilience";

/**
 * Minimal logger surface used to report unexpected oEmbed failures without
 * coupling the adapter to the full server logger implementation.
 */
type ThumbnailResolverLogger = {
  warn(input: { message: string; metadata?: Record<string, unknown>; error?: unknown }): void;
};

type OEmbedVideoThumbnailResolverDependencies = {
  /** HTTP client used to call the oEmbed endpoints. Defaults to global fetch. */
  httpFetcher?: HttpFetcher;
  /** Optional logger for unexpected oEmbed failures. */
  logger?: ThumbnailResolverLogger;
};

/**
 * Field carrying the thumbnail URL in every supported provider's oEmbed payload.
 */
const OEMBED_THUMBNAIL_FIELD = "thumbnail_url";

/**
 * Header asking the oEmbed endpoint for its JSON representation.
 */
const OEMBED_ACCEPT_HEADER = { accept: "application/json" } as const;

/**
 * Resilience profile for oEmbed requests. Thumbnail resolution is a best-effort
 * background concern, so it uses a short timeout and a single retry to avoid
 * holding the render's `after()` callback open.
 */
const OEMBED_FETCH_OPTIONS: Partial<FetchResilienceOptions> = {
  maxRetries: 1,
  retryDelayMs: 200,
  timeoutMs: 4000,
};

const OEMBED_LOG_MESSAGE = {
  requestFailed: "External video oEmbed thumbnail request failed",
  unexpectedStatus: "External video oEmbed thumbnail request returned a non-ok status",
} as const;

/**
 * Wraps the global `fetch` so it satisfies the {@link HttpFetcher} contract.
 *
 * @param input - Request URL.
 * @param init - Request init forwarded to `fetch`.
 * @returns The fetch response, structurally compatible with {@link HttpResponse}.
 */
function defaultHttpFetcher(input: string, init?: RequestInit): Promise<HttpResponse> {
  return fetch(input, init);
}

/**
 * Reads the `thumbnail_url` field from an oEmbed JSON payload.
 *
 * @param payload - Parsed oEmbed response body.
 * @returns The thumbnail URL when present and non-empty, otherwise `null`.
 */
function readThumbnailUrl(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const thumbnailUrl = (payload as Record<string, unknown>)[OEMBED_THUMBNAIL_FIELD];

  return typeof thumbnailUrl === "string" && thumbnailUrl.length > 0
    ? thumbnailUrl
    : null;
}

/**
 * Resolves external video thumbnails through each provider's oEmbed endpoint.
 *
 * Failures (timeouts, non-ok statuses, malformed payloads, unsupported
 * providers) map to `null` so the caller can mark the attempt as done without
 * a thumbnail rather than failing the surrounding flow.
 */
export class OEmbedVideoThumbnailResolver implements VideoThumbnailResolver {
  private readonly httpFetcher: HttpFetcher;
  private readonly logger?: ThumbnailResolverLogger;

  constructor({
    httpFetcher = defaultHttpFetcher,
    logger,
  }: OEmbedVideoThumbnailResolverDependencies = {}) {
    this.httpFetcher = httpFetcher;
    this.logger = logger;
  }

  /**
   * Resolves the thumbnail URL for a single external video through oEmbed.
   *
   * @param provider - Provider that owns the external identifier.
   * @param externalId - Provider-specific identifier already validated upstream.
   * @returns The resolved thumbnail URL, or `null` when none is available.
   */
  async resolveThumbnailUrl(
    provider: VideoProvider,
    externalId: string
  ): Promise<string | null> {
    const requestUrl = buildVideoOEmbedRequestUrl(provider, externalId);

    if (!requestUrl) {
      return null;
    }

    try {
      const response = await fetchWithResilience(
        this.httpFetcher,
        requestUrl,
        { headers: { ...OEMBED_ACCEPT_HEADER } },
        OEMBED_FETCH_OPTIONS
      );

      if (!response.ok) {
        this.logger?.warn({
          message: OEMBED_LOG_MESSAGE.unexpectedStatus,
          metadata: { provider, status: response.status ?? null },
        });
        return null;
      }

      return readThumbnailUrl(await response.json());
    } catch (error) {
      this.logger?.warn({
        error,
        message: OEMBED_LOG_MESSAGE.requestFailed,
        metadata: { provider },
      });
      return null;
    }
  }
}
