import { describe, it, expect } from "vitest";
import { normalizeMessageMediaDrafts } from "@/src/modules/messages/application/use-cases/normalize-message-media-use-cases";
import { MESSAGE_MEDIA } from "@/src/modules/messages/constants/message-round";

describe("normalizeMessageMediaDrafts", () => {
  const firstImageAssetId = "7a7850d3-8d4a-4ae9-ac94-6589c6a4d1e2";
  const secondImageAssetId = "8b9fda6e-6ef2-4a4d-bd8d-00b0e04b6b55";
  const youtubeUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
  const vimeoUrl = "https://vimeo.com/123456789";

  it("returns empty media for an empty or missing list", () => {
    expect(normalizeMessageMediaDrafts(undefined)).toEqual({
      images: [],
      status: "valid" as const,
      videos: [],
    });
    expect(normalizeMessageMediaDrafts([])).toEqual({
      images: [],
      status: "valid" as const,
      videos: [],
    });
  });

  it("assigns a shared global sortOrder across images and videos in list order", () => {
    const result = normalizeMessageMediaDrafts([
      { assetId: firstImageAssetId, kind: "image" },
      { kind: "video", url: youtubeUrl },
      { assetId: secondImageAssetId, kind: "image" },
      { kind: "video", url: vimeoUrl },
    ]);

    expect(result).toEqual({
      images: [
        { altText: "", assetId: firstImageAssetId, sortOrder: 0 },
        { altText: "", assetId: secondImageAssetId, sortOrder: 2 },
      ],
      status: "valid" as const,
      videos: [
        { externalId: "dQw4w9WgXcQ", provider: "youtube", sortOrder: 1 },
        { externalId: "123456789", provider: "vimeo", sortOrder: 3 },
      ],
    });
  });

  it("trims image asset ids and alt text", () => {
    const result = normalizeMessageMediaDrafts([
      { altText: "  Una captura  ", assetId: ` ${firstImageAssetId} `, kind: "image" },
    ]);

    expect(result).toEqual({
      images: [{ altText: "Una captura", assetId: firstImageAssetId, sortOrder: 0 }],
      status: "valid" as const,
      videos: [],
    });
  });

  it("rejects more than the combined media limit", () => {
    const media = Array.from({ length: MESSAGE_MEDIA.maxCount + 1 }, () => ({
      kind: "video" as const,
      url: youtubeUrl,
    }));

    expect(normalizeMessageMediaDrafts(media)).toEqual({ status: "invalid_media" as const });
  });

  it("accepts exactly the combined media limit", () => {
    const media = Array.from({ length: MESSAGE_MEDIA.maxCount }, () => ({
      kind: "video" as const,
      url: youtubeUrl,
    }));

    expect(normalizeMessageMediaDrafts(media)).toMatchObject({ status: "valid" as const });
  });

  it("rejects duplicated image asset ids", () => {
    const result = normalizeMessageMediaDrafts([
      { assetId: firstImageAssetId, kind: "image" },
      { assetId: ` ${firstImageAssetId} `, kind: "image" },
    ]);

    expect(result).toEqual({ status: "invalid_image" as const });
  });

  it("rejects non UUID image asset ids", () => {
    expect(
      normalizeMessageMediaDrafts([{ assetId: "asset-1", kind: "image" }])
    ).toEqual({ status: "invalid_image" as const });
  });

  it("rejects an unrecognized video url", () => {
    expect(
      normalizeMessageMediaDrafts([{ kind: "video", url: "not-a-video-url" }])
    ).toEqual({ status: "invalid_video_url" as const });
  });
});
