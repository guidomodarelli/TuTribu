import {
  getTribeStory,
  saveTribeStory,
} from "@/src/modules/tribes/application/use-cases/manage-tribe-story-use-cases";
import { TRIBE_STORY_SAVE_STATUS } from "@/src/modules/tribes/constants/tribe-story";
import type {
  TribeStoryRepository,
  TribeStorySettings,
} from "@/src/modules/tribes/domain/repositories/tribe-story-repository";

function buildStory(
  overrides: Partial<TribeStorySettings> = {}
): TribeStorySettings {
  return {
    content: "Nacimos en 2020 para acompañarnos a invertir mejor.",
    ...overrides,
  };
}

function buildRepository(
  overrides: Partial<TribeStoryRepository> = {}
): TribeStoryRepository {
  return {
    getByTribeSlug: jest.fn(async () => null),
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
    const story = buildStory();
    const repository = buildRepository({
      getByTribeSlug: jest.fn(async () => story),
    });
    const useCase = getTribeStory({
      tribeStoryRepository: repository,
    });

    const result = await useCase({ tribeSlug: "matematica-pro" });

    expect(result).toEqual(story);
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
      tribeSlug: " matematica-pro ",
    });

    expect(repository.save).toHaveBeenCalledWith({
      content: "Nuestra historia arranca acá.",
      tribeSlug: "matematica-pro",
    });
    expect(result.status).toBe(TRIBE_STORY_SAVE_STATUS.forbidden);
    expect(result.story).toBeNull();
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
      tribeSlug: "matematica-pro",
    });

    expect(result).toEqual({
      status: TRIBE_STORY_SAVE_STATUS.updated,
      story: savedStory,
    });
  });
});
