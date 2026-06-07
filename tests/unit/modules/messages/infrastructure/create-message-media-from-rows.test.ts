import { createMessageMediaFromRows } from "@/src/modules/messages/infrastructure/repositories/postgres-message-round-repository";

describe("createMessageMediaFromRows", () => {
  it("surfaces a persisted video thumbnail as thumbnailUrl", () => {
    const media = createMessageMediaFromRows(null, [
      {
        external_video_id: "123456789",
        external_video_provider: "vimeo",
        id: "video-1",
        sort_order: 0,
        thumbnail_url: "https://i.vimeocdn.com/video/123456789.jpg",
      },
    ]);

    expect(media).toEqual([
      {
        externalId: "123456789",
        id: "video-1",
        kind: "video",
        provider: "vimeo",
        sortOrder: 0,
        thumbnailUrl: "https://i.vimeocdn.com/video/123456789.jpg",
      },
    ]);
  });

  it("defaults the video thumbnail to null when it has not been resolved", () => {
    const media = createMessageMediaFromRows(null, [
      {
        external_video_id: "dQw4w9WgXcQ",
        external_video_provider: "youtube",
        id: "video-1",
        sort_order: 0,
      },
    ]);

    expect(media).toEqual([
      {
        externalId: "dQw4w9WgXcQ",
        id: "video-1",
        kind: "video",
        provider: "youtube",
        sortOrder: 0,
        thumbnailUrl: null,
      },
    ]);
  });
});
