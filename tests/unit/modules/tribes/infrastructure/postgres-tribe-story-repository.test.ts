import { PostgresTribeStoryRepository } from "@/src/modules/tribes/infrastructure/repositories/postgres-tribe-story-repository";
import {
  TRIBE_STORY_MEDIA_TYPE,
  TRIBE_STORY_SAVE_STATUS,
} from "@/src/modules/tribes/constants/tribe-story";

type DrizzleQueryWithChunks = {
  queryChunks?: unknown[];
};

function readQueryText(query: unknown): string {
  if (!query || typeof query !== "object" || !("queryChunks" in query)) {
    return "";
  }

  const { queryChunks } = query as DrizzleQueryWithChunks;

  return (queryChunks ?? [])
    .map((chunk) => {
      if (typeof chunk === "string") {
        return chunk;
      }

      if (
        chunk &&
        typeof chunk === "object" &&
        "value" in chunk &&
        Array.isArray((chunk as { value?: unknown }).value)
      ) {
        return (chunk as { value: unknown[] }).value.join("");
      }

      return "";
    })
    .join(" ");
}

describe("PostgresTribeStoryRepository", () => {
  it("maps the story and its media through the about definer functions", async () => {
    const execute = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            content: "Nacimos en 2020 para acompañarnos a invertir mejor.",
            website_url: "https://tribu.example.com",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            external_video_id: "dQw4w9WgXcQ",
            id: "media-1",
            media_type: TRIBE_STORY_MEDIA_TYPE.video,
            sort_order: 0,
            url: null,
            video_provider: "youtube",
          },
          {
            external_video_id: null,
            id: "media-2",
            media_type: TRIBE_STORY_MEDIA_TYPE.image,
            sort_order: 1,
            url: "https://images.example.com/tribu.jpg",
            video_provider: null,
          },
        ],
      });
    const repository = new PostgresTribeStoryRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.getByTribeSlug({ tribeSlug: "matematica-pro" })
    ).resolves.toEqual({
      content: "Nacimos en 2020 para acompañarnos a invertir mejor.",
      media: [
        {
          externalVideoId: "dQw4w9WgXcQ",
          id: "media-1",
          mediaType: TRIBE_STORY_MEDIA_TYPE.video,
          sortOrder: 0,
          url: null,
          videoProvider: "youtube",
        },
        {
          externalVideoId: null,
          id: "media-2",
          mediaType: TRIBE_STORY_MEDIA_TYPE.image,
          sortOrder: 1,
          url: "https://images.example.com/tribu.jpg",
          videoProvider: null,
        },
      ],
      websiteUrl: "https://tribu.example.com",
    });
    expect(readQueryText(execute.mock.calls[0][0])).toContain(
      "tribe_story_about"
    );
    expect(readQueryText(execute.mock.calls[1][0])).toContain(
      "tribe_story_about_media"
    );
  });

  it("returns null when the tribe has no stored story", async () => {
    const execute = jest.fn().mockResolvedValueOnce({ rows: [] });
    const repository = new PostgresTribeStoryRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.getByTribeSlug({ tribeSlug: "matematica-pro" })
    ).resolves.toBeNull();
  });

  it("returns null when the story storage does not exist yet", async () => {
    const missingTableError = Object.assign(new Error("missing relation"), {
      code: "42P01",
    });
    const execute = jest.fn().mockRejectedValueOnce(missingTableError);
    const repository = new PostgresTribeStoryRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.getByTribeSlug({ tribeSlug: "matematica-pro" })
    ).resolves.toBeNull();
  });

  it("maps the tribe stats through the stats definer function", async () => {
    const execute = jest.fn().mockResolvedValueOnce({
      rows: [
        {
          admin_count: "2",
          created_at: "2026-01-10T00:00:00.000Z",
          member_count: "128",
          name: "Matematica Pro",
        },
      ],
    });
    const repository = new PostgresTribeStoryRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.getStatsByTribeSlug({ tribeSlug: "matematica-pro" })
    ).resolves.toEqual({
      adminCount: 2,
      createdAt: "2026-01-10T00:00:00.000Z",
      memberCount: 128,
      name: "Matematica Pro",
    });
    expect(readQueryText(execute.mock.calls[0][0])).toContain(
      "tribe_story_about_stats"
    );
  });

  it("returns null stats when the viewer cannot read the tribe about", async () => {
    const execute = jest.fn().mockResolvedValueOnce({ rows: [] });
    const repository = new PostgresTribeStoryRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.getStatsByTribeSlug({ tribeSlug: "matematica-pro" })
    ).resolves.toBeNull();
  });

  it("guards the save behind the leader management function and maps saved media", async () => {
    const execute = jest.fn().mockResolvedValueOnce({
      rows: [
        {
          content: "Historia actualizada.",
          media: [
            {
              external_video_id: null,
              id: "media-1",
              media_type: TRIBE_STORY_MEDIA_TYPE.image,
              sort_order: 0,
              url: "https://images.example.com/tribu.jpg",
              video_provider: null,
            },
          ],
          status: TRIBE_STORY_SAVE_STATUS.updated,
          website_url: "https://tribu.example.com",
        },
      ],
    });
    const repository = new PostgresTribeStoryRepository(async (callback) =>
      callback({ execute } as never)
    );

    const result = await repository.save({
      content: "Historia actualizada.",
      media: [
        {
          externalVideoId: null,
          mediaType: TRIBE_STORY_MEDIA_TYPE.image,
          sortOrder: 0,
          url: "https://images.example.com/tribu.jpg",
          videoProvider: null,
        },
      ],
      tribeSlug: "matematica-pro",
      websiteUrl: "https://tribu.example.com",
    });

    expect(result).toEqual({
      status: TRIBE_STORY_SAVE_STATUS.updated,
      story: {
        content: "Historia actualizada.",
        media: [
          {
            externalVideoId: null,
            id: "media-1",
            mediaType: TRIBE_STORY_MEDIA_TYPE.image,
            sortOrder: 0,
            url: "https://images.example.com/tribu.jpg",
            videoProvider: null,
          },
        ],
        websiteUrl: "https://tribu.example.com",
      },
    });
    expect(readQueryText(execute.mock.calls[0][0])).toContain(
      "can_manage_tribe_story"
    );
    expect(readQueryText(execute.mock.calls[0][0])).toContain(
      "tribe_story_media"
    );
  });

  it("returns notFound when the tribe does not exist", async () => {
    const execute = jest.fn().mockResolvedValueOnce({
      rows: [
        {
          content: null,
          media: [],
          status: TRIBE_STORY_SAVE_STATUS.notFound,
          website_url: null,
        },
      ],
    });
    const repository = new PostgresTribeStoryRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.save({
        content: "Historia nueva.",
        media: [],
        tribeSlug: "tribu-inexistente",
        websiteUrl: null,
      })
    ).resolves.toEqual({
      status: TRIBE_STORY_SAVE_STATUS.notFound,
      story: null,
    });
  });

  it("returns forbidden when the viewer cannot manage the story", async () => {
    const execute = jest.fn().mockResolvedValueOnce({
      rows: [
        {
          content: null,
          media: [],
          status: TRIBE_STORY_SAVE_STATUS.forbidden,
          website_url: null,
        },
      ],
    });
    const repository = new PostgresTribeStoryRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.save({
        content: "Historia nueva.",
        media: [],
        tribeSlug: "matematica-pro",
        websiteUrl: null,
      })
    ).resolves.toEqual({
      status: TRIBE_STORY_SAVE_STATUS.forbidden,
      story: null,
    });
  });
});
