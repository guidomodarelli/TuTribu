import {
  getTribeStory,
  getTribeStoryStats,
  saveTribeStory,
} from "@/src/modules/tribes/application/use-cases/manage-tribe-story-use-cases";
import {
  TRIBE_STORY_MEDIA_TYPE,
  TRIBE_STORY_SAVE_STATUS,
} from "@/src/modules/tribes/constants/tribe-story";
import type {
  TribeStoryRepository,
  TribeStorySettings,
  TribeStoryStats,
} from "@/src/modules/tribes/domain/repositories/tribe-story-repository";

function buildStory(
  overrides: Partial<TribeStorySettings> = {}
): TribeStorySettings {
  return {
    content: "Nacimos en 2020 para acompañarnos a invertir mejor.",
    media: [],
    websiteUrl: null,
    ...overrides,
  };
}

function buildStats(
  overrides: Partial<TribeStoryStats> = {}
): TribeStoryStats {
  return {
    adminCount: 2,
    createdAt: "2026-01-10T00:00:00.000Z",
    memberCount: 128,
    name: "Matematica Pro",
    ...overrides,
  };
}

function buildRepository(
  overrides: Partial<TribeStoryRepository> = {}
): TribeStoryRepository {
  return {
    getByTribeSlug: jest.fn(async () => null),
    getStatsByTribeSlug: jest.fn(async () => null),
    save: jest.fn(async () => ({
      status: TRIBE_STORY_SAVE_STATUS.updated,
      story: buildStory(),
    })),
    ...overrides,
  };
}

describe("manage tribe story use cases", () => {
  it("returns null when the tribe has no story yet", async () => {
    const repository = buildRepository();
    const useCase = getTribeStory({
      tribeStoryRepository: repository,
    });

    const result = await useCase({ tribeSlug: " matematica-pro " });

    expect(result).toBeNull();
    expect(repository.getByTribeSlug).toHaveBeenCalledWith({
      tribeSlug: "matematica-pro",
    });
  });

  it("returns the stored story when present", async () => {
    const story = buildStory({
      media: [
        {
          externalVideoId: "dQw4w9WgXcQ",
          id: "media-1",
          mediaType: TRIBE_STORY_MEDIA_TYPE.video,
          sortOrder: 0,
          url: null,
          videoProvider: "youtube",
        },
      ],
      websiteUrl: "https://tribu.example.com",
    });
    const repository = buildRepository({
      getByTribeSlug: jest.fn(async () => story),
    });
    const useCase = getTribeStory({
      tribeStoryRepository: repository,
    });

    const result = await useCase({ tribeSlug: "matematica-pro" });

    expect(result).toEqual(story);
  });

  it("returns the tribe story stats normalizing the slug", async () => {
    const stats = buildStats();
    const repository = buildRepository({
      getStatsByTribeSlug: jest.fn(async () => stats),
    });
    const useCase = getTribeStoryStats({
      tribeStoryRepository: repository,
    });

    const result = await useCase({ tribeSlug: " matematica-pro " });

    expect(result).toEqual(stats);
    expect(repository.getStatsByTribeSlug).toHaveBeenCalledWith({
      tribeSlug: "matematica-pro",
    });
  });

  it("normalizes input before saving and forwards forbidden status", async () => {
    const repository = buildRepository({
      save: jest.fn(async () => ({
        status: TRIBE_STORY_SAVE_STATUS.forbidden,
        story: null,
      })),
    });
    const useCase = saveTribeStory({
      tribeStoryRepository: repository,
    });

    const result = await useCase({
      content: "  Nuestra historia arranca acá.  ",
      media: [
        {
          externalVideoId: null,
          mediaType: TRIBE_STORY_MEDIA_TYPE.image,
          sortOrder: 4,
          url: " https://images.example.com/tribu.jpg ",
          videoProvider: null,
        },
      ],
      tribeSlug: " matematica-pro ",
      websiteUrl: "   ",
    });

    expect(repository.save).toHaveBeenCalledWith({
      content: "Nuestra historia arranca acá.",
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
      websiteUrl: null,
    });
    expect(result.status).toBe(TRIBE_STORY_SAVE_STATUS.forbidden);
    expect(result.story).toBeNull();
  });

  it("reindexes media sort order by position", async () => {
    const repository = buildRepository();
    const useCase = saveTribeStory({
      tribeStoryRepository: repository,
    });

    await useCase({
      content: "Historia",
      media: [
        {
          externalVideoId: "dQw4w9WgXcQ",
          mediaType: TRIBE_STORY_MEDIA_TYPE.video,
          sortOrder: 9,
          url: null,
          videoProvider: "youtube",
        },
        {
          externalVideoId: null,
          mediaType: TRIBE_STORY_MEDIA_TYPE.image,
          sortOrder: 3,
          url: "https://images.example.com/tribu.jpg",
          videoProvider: null,
        },
      ],
      tribeSlug: "matematica-pro",
      websiteUrl: "https://tribu.example.com",
    });

    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        media: [
          expect.objectContaining({ sortOrder: 0 }),
          expect.objectContaining({ sortOrder: 1 }),
        ],
        websiteUrl: "https://tribu.example.com",
      })
    );
  });

  it("returns the updated story when the repository confirms the save", async () => {
    const savedStory = buildStory({ content: "Historia actualizada." });
    const repository = buildRepository({
      save: jest.fn(async () => ({
        status: TRIBE_STORY_SAVE_STATUS.updated,
        story: savedStory,
      })),
    });
    const useCase = saveTribeStory({
      tribeStoryRepository: repository,
    });

    const result = await useCase({
      content: " Historia actualizada. ",
      media: [],
      tribeSlug: "matematica-pro",
      websiteUrl: null,
    });

    expect(result).toEqual({
      status: TRIBE_STORY_SAVE_STATUS.updated,
      story: savedStory,
    });
  });
});
