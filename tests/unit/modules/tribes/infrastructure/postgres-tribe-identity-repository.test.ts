import { vi, describe, it, expect } from "vitest";
import { PostgresTribeIdentityRepository } from "@/src/modules/tribes/infrastructure/repositories/postgres-tribe-identity-repository";
import { TRIBE_IMAGE_SAVE_STATUS } from "@/src/modules/tribes/constants/tribe-images";

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
  });
});
