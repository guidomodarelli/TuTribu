import { OEmbedVideoThumbnailResolver } from "@/src/modules/messages/infrastructure/video/oembed-video-thumbnail-resolver";
import type { HttpResponse } from "@/src/modules/shared/infrastructure/http/fetch-with-resilience";
import { VIDEO_PROVIDER } from "@/src/modules/shared/domain/value-objects/video-provider";

const HTTP_STATUS_OK = 200;
const HTTP_STATUS_NOT_FOUND = 404;

/**
 * Builds an oEmbed HTTP response double for the resolver under test.
 *
 * @param body - JSON payload returned by the fake response.
 * @param ok - Whether the response should be treated as successful.
 * @param status - HTTP status code exposed by the fake response.
 * @returns A response-shaped test double.
 */
function createJsonResponse(
  body: unknown,
  ok = true,
  status = HTTP_STATUS_OK
): HttpResponse {
  return {
    json: jest.fn().mockResolvedValue(body),
    ok,
    status,
  };
}

describe("OEmbedVideoThumbnailResolver", () => {
  it("requests the provider oEmbed endpoint and returns the thumbnail_url", async () => {
    const httpFetcher = jest
      .fn()
      .mockResolvedValue(
        createJsonResponse({
          thumbnail_url: "https://i.vimeocdn.com/video/123456789.jpg",
        })
      );
    const resolver = new OEmbedVideoThumbnailResolver({ httpFetcher });

    const result = await resolver.resolveThumbnailUrl(
      VIDEO_PROVIDER.vimeo,
      "123456789"
    );

    expect(result).toBe("https://i.vimeocdn.com/video/123456789.jpg");
    expect(httpFetcher).toHaveBeenCalledWith(
      "https://vimeo.com/api/oembed.json?url=https%3A%2F%2Fvimeo.com%2F123456789",
      expect.objectContaining({ headers: { accept: "application/json" } })
    );
  });

  it("skips the network entirely for YouTube", async () => {
    const httpFetcher = jest.fn();
    const resolver = new OEmbedVideoThumbnailResolver({ httpFetcher });

    const result = await resolver.resolveThumbnailUrl(
      VIDEO_PROVIDER.youtube,
      "dQw4w9WgXcQ"
    );

    expect(result).toBeNull();
    expect(httpFetcher).not.toHaveBeenCalled();
  });

  it("returns null and logs when the oEmbed endpoint responds with a non-ok status", async () => {
    const httpFetcher = jest
      .fn()
      .mockResolvedValue(createJsonResponse({}, false, HTTP_STATUS_NOT_FOUND));
    const logger = { warn: jest.fn() };
    const resolver = new OEmbedVideoThumbnailResolver({ httpFetcher, logger });

    const result = await resolver.resolveThumbnailUrl(
      VIDEO_PROVIDER.loom,
      "0123456789abcdef0123456789abcdef"
    );

    expect(result).toBeNull();
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it("returns null and logs when the request throws", async () => {
    const httpFetcher = jest.fn().mockRejectedValue(new Error("network down"));
    const logger = { warn: jest.fn() };
    const resolver = new OEmbedVideoThumbnailResolver({ httpFetcher, logger });

    const result = await resolver.resolveThumbnailUrl(
      VIDEO_PROVIDER.wistia,
      "abc123def456"
    );

    expect(result).toBeNull();
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it("returns null when the payload has no usable thumbnail_url", async () => {
    const httpFetcher = jest
      .fn()
      .mockResolvedValue(createJsonResponse({ thumbnail_url: "" }));
    const resolver = new OEmbedVideoThumbnailResolver({ httpFetcher });

    const result = await resolver.resolveThumbnailUrl(
      VIDEO_PROVIDER.vimeo,
      "123456789"
    );

    expect(result).toBeNull();
  });
});
