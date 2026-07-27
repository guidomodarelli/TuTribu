import type {
  CreateTribeImageUploadCommand,
  DeleteTribeImageUploadCommand,
  TribeImageRepository,
  TribeImageUploadResult,
} from "@/src/modules/tribes/domain/repositories/tribe-image-repository";

type TribeImageDependencies = {
  tribeImageRepository: TribeImageRepository;
};

function normalizeText(value: string): string {
  return value.trim();
}

export function createTribeImageUpload({
  tribeImageRepository,
}: TribeImageDependencies) {
  return async (
    command: CreateTribeImageUploadCommand
  ): Promise<TribeImageUploadResult> =>
    tribeImageRepository.createUpload({
      tribeSlug: normalizeText(command.tribeSlug),
    });
}

export function cleanupOrphanTribeImages({
  tribeImageRepository,
}: TribeImageDependencies) {
  return async () => tribeImageRepository.cleanupOrphanUploads();
}

export function deleteTribeImageUpload({
  tribeImageRepository,
}: TribeImageDependencies) {
  return async (command: DeleteTribeImageUploadCommand): Promise<boolean> =>
    tribeImageRepository.deleteUpload({
      imageId: normalizeText(command.imageId),
      tribeSlug: normalizeText(command.tribeSlug),
    });
}
