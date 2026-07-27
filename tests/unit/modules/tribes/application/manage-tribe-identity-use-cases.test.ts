import {
  getTribeIdentity,
  saveTribeIdentity,
} from "@/src/modules/tribes/application/use-cases/manage-tribe-identity-use-cases";
import { TRIBE_IMAGE_SAVE_STATUS } from "@/src/modules/tribes/constants/tribe-images";
import type { TribeIdentityRepository } from "@/src/modules/tribes/domain/repositories/tribe-identity-repository";

function buildRepository(
  overrides: Partial<TribeIdentityRepository> = {}
): TribeIdentityRepository {
  return {
    getByTribeSlug: jest.fn(async () => ({ coverUrl: null, logoUrl: null })),
    save: jest.fn(async () => ({
      identity: { coverUrl: null, logoUrl: null },
      status: TRIBE_IMAGE_SAVE_STATUS.updated,
    })),
    ...overrides,
  };
}

describe("manage tribe identity use cases", () => {
  it("reads the identity normalizing the slug", async () => {
    const repository = buildRepository({
      getByTribeSlug: jest.fn(async () => ({
        coverUrl: "https://images.example.com/cover.jpg",
        logoUrl: "https://images.example.com/logo.png",
      })),
    });
    const useCase = getTribeIdentity({ tribeIdentityRepository: repository });

    await expect(useCase({ tribeSlug: " matematica-pro " })).resolves.toEqual({
      coverUrl: "https://images.example.com/cover.jpg",
      logoUrl: "https://images.example.com/logo.png",
    });
    expect(repository.getByTribeSlug).toHaveBeenCalledWith({
      tribeSlug: "matematica-pro",
    });
  });

  it("normalizes blank identity values to null before saving", async () => {
    const repository = buildRepository();
    const useCase = saveTribeIdentity({ tribeIdentityRepository: repository });

    await useCase({
      coverUrl: "   ",
      logoUrl: " https://images.example.com/logo.png ",
      tribeSlug: " matematica-pro ",
    });

    expect(repository.save).toHaveBeenCalledWith({
      coverUrl: null,
      logoUrl: "https://images.example.com/logo.png",
      tribeSlug: "matematica-pro",
    });
  });

  it("forwards a forbidden save", async () => {
    const repository = buildRepository({
      save: jest.fn(async () => ({
        identity: null,
        status: TRIBE_IMAGE_SAVE_STATUS.forbidden,
      })),
    });
    const useCase = saveTribeIdentity({ tribeIdentityRepository: repository });

    await expect(
      useCase({ coverUrl: null, logoUrl: null, tribeSlug: "matematica-pro" })
    ).resolves.toEqual({
      identity: null,
      status: TRIBE_IMAGE_SAVE_STATUS.forbidden,
    });
  });
});
