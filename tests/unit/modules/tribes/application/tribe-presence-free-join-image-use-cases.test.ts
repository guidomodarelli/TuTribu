import { joinTribeFree } from "@/src/modules/tribes/application/use-cases/join-tribe-free-use-case";
import { touchTribePresence } from "@/src/modules/tribes/application/use-cases/manage-tribe-presence-use-cases";
import {
  createTribeImageUpload,
  deleteTribeImageUpload,
} from "@/src/modules/tribes/application/use-cases/manage-tribe-image-use-cases";
import { TRIBE_FREE_JOIN_STATUS } from "@/src/modules/tribes/constants/tribe-story";
import { TRIBE_IMAGE_UPLOAD_STATUS } from "@/src/modules/tribes/constants/tribe-images";
import type { TribeFreeJoinRepository } from "@/src/modules/tribes/domain/repositories/tribe-free-join-repository";
import type { TribePresenceRepository } from "@/src/modules/tribes/domain/repositories/tribe-presence-repository";
import type { TribeImageRepository } from "@/src/modules/tribes/domain/repositories/tribe-image-repository";

describe("tribe presence, free join, and story image use cases", () => {
  it("touches the viewer presence normalizing the slug", async () => {
    const repository: TribePresenceRepository = {
      touchByTribeSlug: jest.fn(async () => true),
    };
    const useCase = touchTribePresence({
      tribePresenceRepository: repository,
    });

    await expect(useCase({ tribeSlug: " matematica-pro " })).resolves.toBe(
      true
    );
    expect(repository.touchByTribeSlug).toHaveBeenCalledWith({
      tribeSlug: "matematica-pro",
    });
  });

  it("joins a free tribe normalizing the slug", async () => {
    const repository: TribeFreeJoinRepository = {
      join: jest.fn(async () => ({
        status: TRIBE_FREE_JOIN_STATUS.joined,
      })),
    };
    const useCase = joinTribeFree({
      tribeFreeJoinRepository: repository,
    });

    await expect(useCase({ tribeSlug: " matematica-pro " })).resolves.toEqual({
      status: TRIBE_FREE_JOIN_STATUS.joined,
    });
    expect(repository.join).toHaveBeenCalledWith({
      tribeSlug: "matematica-pro",
    });
  });

  it("creates and deletes tribe image uploads through the port", async () => {
    const repository: TribeImageRepository = {
      createUpload: jest.fn(async () => ({
        deliveryUrl: "https://imagedelivery.net/hash/image-1/public",
        imageId: "image-1",
        status: TRIBE_IMAGE_UPLOAD_STATUS.created,
        uploadUrl: "https://upload.example.com/image-1",
      })),
      deleteUpload: jest.fn(async () => true),
    };
    const createUseCase = createTribeImageUpload({
      tribeImageRepository: repository,
    });
    const deleteUseCase = deleteTribeImageUpload({
      tribeImageRepository: repository,
    });

    await expect(
      createUseCase({ tribeSlug: " matematica-pro " })
    ).resolves.toEqual(
      expect.objectContaining({
        status: TRIBE_IMAGE_UPLOAD_STATUS.created,
      })
    );
    expect(repository.createUpload).toHaveBeenCalledWith({
      tribeSlug: "matematica-pro",
    });

    await expect(
      deleteUseCase({ imageId: " image-1 ", tribeSlug: " matematica-pro " })
    ).resolves.toBe(true);
    expect(repository.deleteUpload).toHaveBeenCalledWith({
      imageId: "image-1",
      tribeSlug: "matematica-pro",
    });
  });
});
