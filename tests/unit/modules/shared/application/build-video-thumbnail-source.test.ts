import { buildVideoThumbnailSource } from "@/src/modules/shared/application/video/build-video-thumbnail-source";
import { VIDEO_PROVIDER } from "@/src/modules/shared/domain/value-objects/video-provider";

describe("buildVideoThumbnailSource", () => {
  it("derives a deterministic YouTube thumbnail from the video id", () => {
    expect(
      buildVideoThumbnailSource(VIDEO_PROVIDER.youtube, "dQw4w9WgXcQ")
    ).toBe("https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
  });

  it("returns null for providers without a deterministic thumbnail", () => {
    expect(buildVideoThumbnailSource(VIDEO_PROVIDER.vimeo, "123456789")).toBeNull();
    expect(
      buildVideoThumbnailSource(VIDEO_PROVIDER.wistia, "abc123def456")
    ).toBeNull();
    expect(
      buildVideoThumbnailSource(
        VIDEO_PROVIDER.loom,
        "0123456789abcdef0123456789abcdef"
      )
    ).toBeNull();
  });
});
