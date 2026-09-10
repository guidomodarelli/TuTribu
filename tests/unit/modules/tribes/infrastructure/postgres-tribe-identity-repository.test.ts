import { vi, describe, it, expect } from "vitest";
import { PostgresTribeIdentityRepository } from "@/src/modules/tribes/infrastructure/repositories/postgres-tribe-identity-repository";
import { TRIBE_IMAGE_SAVE_STATUS } from "@/src/modules/tribes/constants/tribe-images";

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

describe("PostgresTribeIdentityRepository", () => {
  it("maps the tribe identity row", async () => {
    const execute = vi.fn().mockResolvedValueOnce({
      rows: [
        {
          cover_url: "https://images.example.com/cover.jpg",
          id: "tribe-1",
          logo_url: "https://images.example.com/logo.png",
        },
      ],
    });
    const repository = new PostgresTribeIdentityRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.getByTribeSlug({ tribeSlug: "matematica-pro" })
    ).resolves.toEqual({
      coverUrl: "https://images.example.com/cover.jpg",
      logoUrl: "https://images.example.com/logo.png",
    });
  });

  it("returns null when the tribe is not visible to the viewer", async () => {
    const execute = vi.fn().mockResolvedValueOnce({ rows: [] });
    const repository = new PostgresTribeIdentityRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.getByTribeSlug({ tribeSlug: "matematica-pro" })
    ).resolves.toBeNull();
  });

  it("writes through the leader-guarded definer and refreshes the attachments", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ applied: true }] })
      .mockResolvedValueOnce({ rows: [] });
    const repository = new PostgresTribeIdentityRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.save({
        coverUrl: "https://images.example.com/cover.jpg",
        logoUrl: null,
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      identity: {
        coverUrl: "https://images.example.com/cover.jpg",
        logoUrl: null,
      },
      status: TRIBE_IMAGE_SAVE_STATUS.updated,
    });
    expect(readQueryText(execute.mock.calls[0][0])).toContain(
      "set_tribe_identity"
    );
    expect(readQueryText(execute.mock.calls[1][0])).toContain(
      "refresh_tribe_image_attachments"
    );
  });

  it("returns forbidden without refreshing when the definer rejects the write", async () => {
    const execute = vi.fn().mockResolvedValueOnce({
      rows: [{ applied: false }],
    });
    const repository = new PostgresTribeIdentityRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.save({
        coverUrl: null,
        logoUrl: null,
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      identity: null,
      status: TRIBE_IMAGE_SAVE_STATUS.forbidden,
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
