import { createMessageMediaFromRows } from "@/src/modules/messages/infrastructure/repositories/postgres-message-round-repository";

describe("createMessageMediaFromRows", () => {
  it("surfaces a persisted video thumbnail and the resolved flag", () => {
    const media = createMessageMediaFromRows(null, [
      {
        external_video_id: "123456789",
        external_video_provider: "vimeo",
        id: "video-1",
        sort_order: 0,
        thumbnail_resolved: true,
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
        thumbnailResolved: true,
        thumbnailUrl: "https://i.vimeocdn.com/video/123456789.jpg",
      },
    ]);
  });

  it("marks an attempted video with no thumbnail as resolved so it is not re-scheduled", () => {
    const media = createMessageMediaFromRows(null, [
      {
        external_video_id: "123456789",
        external_video_provider: "vimeo",
        id: "video-1",
        sort_order: 0,
        thumbnail_resolved: true,
        thumbnail_url: null,
      },
    ]);

    expect(media).toEqual([
      {
        externalId: "123456789",
        id: "video-1",
        kind: "video",
        provider: "vimeo",
        sortOrder: 0,
        thumbnailResolved: true,
        thumbnailUrl: null,
      },
    ]);
  });

  it("defaults the thumbnail and resolved flag when nothing was attempted", () => {
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
        thumbnailResolved: false,
        thumbnailUrl: null,
      },
    ]);
  });
});
