import { buildVideoOEmbedRequestUrl } from "@/src/modules/shared/application/video/build-video-oembed-request";
import { VIDEO_PROVIDER } from "@/src/modules/shared/domain/value-objects/video-provider";

describe("buildVideoOEmbedRequestUrl", () => {
  it("returns null for YouTube because its thumbnail is deterministic", () => {
    expect(
      buildVideoOEmbedRequestUrl(VIDEO_PROVIDER.youtube, "dQw4w9WgXcQ")
    ).toBeNull();
  });

  it("builds the Vimeo oEmbed request from the numeric id", () => {
    expect(
      buildVideoOEmbedRequestUrl(VIDEO_PROVIDER.vimeo, "123456789")
    ).toBe(
      "https://vimeo.com/api/oembed.json?url=https%3A%2F%2Fvimeo.com%2F123456789"
    );
  });

  it("preserves the Vimeo unlisted hash as a path segment", () => {
    expect(
      buildVideoOEmbedRequestUrl(VIDEO_PROVIDER.vimeo, "123456789:abcdef0123")
    ).toBe(
      "https://vimeo.com/api/oembed.json?url=https%3A%2F%2Fvimeo.com%2F123456789%2Fabcdef0123"
    );
  });

  it("builds the Wistia oEmbed request from a wistia.com embed iframe URL the endpoint accepts", () => {
    expect(
      buildVideoOEmbedRequestUrl(VIDEO_PROVIDER.wistia, "abc123def456")
    ).toBe(
      "https://fast.wistia.com/oembed.json?url=https%3A%2F%2Ffast.wistia.com%2Fembed%2Fiframe%2Fabc123def456"
    );
  });

  it("builds the Loom oEmbed request from the share URL", () => {
    expect(
      buildVideoOEmbedRequestUrl(
        VIDEO_PROVIDER.loom,
        "0123456789abcdef0123456789abcdef"
      )
    ).toBe(
      "https://www.loom.com/v1/oembed?url=https%3A%2F%2Fwww.loom.com%2Fshare%2F0123456789abcdef0123456789abcdef"
    );
  });
});
