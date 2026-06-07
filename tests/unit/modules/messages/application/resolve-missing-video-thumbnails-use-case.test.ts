import {
  resolveMissingVideoThumbnails,
  selectMessageIdsNeedingVideoThumbnail,
} from "@/src/modules/messages/application/use-cases/resolve-missing-video-thumbnails-use-case";
import { MESSAGE_VIDEO_THUMBNAIL_BACKFILL } from "@/src/modules/messages/constants/message-round";
import type { MessageVideoThumbnailRepository } from "@/src/modules/messages/domain/repositories/message-video-thumbnail-repository";
import type { VideoThumbnailResolver } from "@/src/modules/messages/domain/repositories/video-thumbnail-resolver";

function createRepository(
  overrides: Partial<MessageVideoThumbnailRepository> = {}
): MessageVideoThumbnailRepository {
  return {
    listUnresolvedVideos: jest.fn().mockResolvedValue([]),
    persistThumbnail: jest.fn().mockResolvedValue(true),
    ...overrides,
  };
}

function createResolver(
  resolve: VideoThumbnailResolver["resolveThumbnailUrl"]
): VideoThumbnailResolver {
  return { resolveThumbnailUrl: jest.fn(resolve) };
}

describe("resolveMissingVideoThumbnails", () => {
  it("resolves and persists a thumbnail for each candidate", async () => {
    const repository = createRepository({
      listUnresolvedVideos: jest.fn().mockResolvedValue([
        { externalId: "123456789", id: "video-1", provider: "vimeo" },
        { externalId: "0123456789abcdef0123456789abcdef", id: "video-2", provider: "loom" },
      ]),
    });
    const resolver = createResolver(async (_provider, externalId) =>
      `https://thumb.example/${externalId}.jpg`
    );

    const result = await resolveMissingVideoThumbnails({
      messageVideoThumbnailRepository: repository,
      videoThumbnailResolver: resolver,
    })({ messageIds: ["message-1"] });

    expect(result).toEqual({ resolvedCount: 2 });
    expect(repository.persistThumbnail).toHaveBeenCalledWith({
      thumbnailUrl: "https://thumb.example/123456789.jpg",
      videoId: "video-1",
    });
    expect(repository.persistThumbnail).toHaveBeenCalledWith({
      thumbnailUrl: "https://thumb.example/0123456789abcdef0123456789abcdef.jpg",
      videoId: "video-2",
    });
  });

  it("records the attempt but does not count videos without an available thumbnail", async () => {
    const repository = createRepository({
      listUnresolvedVideos: jest.fn().mockResolvedValue([
        { externalId: "123456789", id: "video-1", provider: "vimeo" },
      ]),
    });
    const resolver = createResolver(async () => null);

    const result = await resolveMissingVideoThumbnails({
      messageVideoThumbnailRepository: repository,
      videoThumbnailResolver: resolver,
    })({ messageIds: ["message-1"] });

    expect(result).toEqual({ resolvedCount: 0 });
    expect(repository.persistThumbnail).toHaveBeenCalledWith({
      thumbnailUrl: null,
      videoId: "video-1",
    });
  });

  it("returns zero without touching the repository when there are no message ids", async () => {
    const repository = createRepository();
    const resolver = createResolver(async () => "https://thumb.example/x.jpg");

    const result = await resolveMissingVideoThumbnails({
      messageVideoThumbnailRepository: repository,
      videoThumbnailResolver: resolver,
    })({ messageIds: [] });

    expect(result).toEqual({ resolvedCount: 0 });
    expect(repository.listUnresolvedVideos).not.toHaveBeenCalled();
  });

  it("deduplicates message ids before querying candidates", async () => {
    const repository = createRepository();
    const resolver = createResolver(async () => null);

    await resolveMissingVideoThumbnails({
      messageVideoThumbnailRepository: repository,
      videoThumbnailResolver: resolver,
    })({ messageIds: ["message-1", "message-1", ""] });

    expect(repository.listUnresolvedVideos).toHaveBeenCalledWith({
      messageIds: ["message-1"],
    });
  });

  it("caps the batch and logs the deferred remainder", async () => {
    const overLimit = MESSAGE_VIDEO_THUMBNAIL_BACKFILL.maxPerRequest + 3;
    const candidates = Array.from({ length: overLimit }, (_unused, index) => ({
      externalId: `id-${String(index)}`,
      id: `video-${String(index)}`,
      provider: "vimeo" as const,
    }));
    const repository = createRepository({
      listUnresolvedVideos: jest.fn().mockResolvedValue(candidates),
    });
    const resolver = createResolver(async () => "https://thumb.example/x.jpg");
    const logger = { info: jest.fn() };

    const result = await resolveMissingVideoThumbnails({
      logger,
      messageVideoThumbnailRepository: repository,
      videoThumbnailResolver: resolver,
    })({ messageIds: ["message-1"] });

    expect(result.resolvedCount).toBe(
      MESSAGE_VIDEO_THUMBNAIL_BACKFILL.maxPerRequest
    );
    expect(repository.persistThumbnail).toHaveBeenCalledTimes(
      MESSAGE_VIDEO_THUMBNAIL_BACKFILL.maxPerRequest
    );
    expect(logger.info).toHaveBeenCalledTimes(1);
  });
});

describe("selectMessageIdsNeedingVideoThumbnail", () => {
  it("selects only messages with a thumbnail-less non-youtube video", () => {
    const messages = [
      {
        id: "needs-vimeo",
        media: [
          {
            externalId: "123",
            id: "v1",
            kind: "video" as const,
            provider: "vimeo" as const,
            sortOrder: 0,
            thumbnailUrl: null,
          },
        ],
      },
      {
        id: "already-resolved",
        media: [
          {
            externalId: "456",
            id: "v2",
            kind: "video" as const,
            provider: "wistia" as const,
            sortOrder: 0,
            thumbnailUrl: "https://thumb.example/wistia.jpg",
          },
        ],
      },
      {
        id: "youtube-only",
        media: [
          {
            externalId: "dQw4w9WgXcQ",
            id: "v3",
            kind: "video" as const,
            provider: "youtube" as const,
            sortOrder: 0,
            thumbnailUrl: null,
          },
        ],
      },
      {
        id: "image-only",
        media: [
          {
            altText: "",
            id: "img1",
            kind: "image" as const,
            sortOrder: 0,
            url: "https://img.example/1.jpg",
          },
        ],
      },
      { id: "no-media" },
    ];

    expect(selectMessageIdsNeedingVideoThumbnail(messages)).toEqual([
      "needs-vimeo",
    ]);
  });
});
