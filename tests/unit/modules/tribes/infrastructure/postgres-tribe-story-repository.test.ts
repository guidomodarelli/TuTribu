import { PostgresTribeStoryRepository } from "@/src/modules/tribes/infrastructure/repositories/postgres-tribe-story-repository";
import { TRIBE_STORY_SAVE_STATUS } from "@/src/modules/tribes/constants/tribe-story";

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
  it("maps the stored story row to the domain shape", async () => {
    const execute = jest.fn().mockResolvedValueOnce({
      rows: [
        {
          content: "Nacimos en 2020 para acompañarnos a invertir mejor.",
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
    });
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

  it("guards the save behind the leader management function", async () => {
    const execute = jest.fn().mockResolvedValueOnce({
      rows: [
        {
          content: "Historia actualizada.",
          status: TRIBE_STORY_SAVE_STATUS.updated,
        },
      ],
    });
    const repository = new PostgresTribeStoryRepository(async (callback) =>
      callback({ execute } as never)
    );

    const result = await repository.save({
      content: "Historia actualizada.",
      tribeSlug: "matematica-pro",
    });

    expect(result).toEqual({
      status: TRIBE_STORY_SAVE_STATUS.updated,
      story: { content: "Historia actualizada." },
    });
    expect(readQueryText(execute.mock.calls[0][0])).toContain(
      "can_manage_tribe_story"
    );
  });

  it("returns notFound when the tribe does not exist", async () => {
    const execute = jest.fn().mockResolvedValueOnce({
      rows: [
        {
          content: null,
          status: TRIBE_STORY_SAVE_STATUS.notFound,
        },
      ],
    });
    const repository = new PostgresTribeStoryRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.save({
        content: "Historia nueva.",
        tribeSlug: "tribu-inexistente",
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
          status: TRIBE_STORY_SAVE_STATUS.forbidden,
        },
      ],
    });
    const repository = new PostgresTribeStoryRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.save({
        content: "Historia nueva.",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      status: TRIBE_STORY_SAVE_STATUS.forbidden,
      story: null,
    });
  });
});
