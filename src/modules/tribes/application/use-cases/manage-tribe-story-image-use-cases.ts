import type {
  CreateTribeStoryImageUploadCommand,
  DeleteTribeStoryImageUploadCommand,
  TribeStoryImageRepository,
  TribeStoryImageUploadResult,
} from "@/src/modules/tribes/domain/repositories/tribe-story-image-repository";

type TribeStoryImageDependencies = {
  tribeStoryImageRepository: TribeStoryImageRepository;
};

function normalizeText(value: string): string {
  return value.trim();
}

export function createTribeStoryImageUpload({
  tribeStoryImageRepository,
}: TribeStoryImageDependencies) {
  return async (
    command: CreateTribeStoryImageUploadCommand
  ): Promise<TribeStoryImageUploadResult> =>
    tribeStoryImageRepository.createUpload({
      tribeSlug: normalizeText(command.tribeSlug),
    });
}

export function deleteTribeStoryImageUpload({
  tribeStoryImageRepository,
}: TribeStoryImageDependencies) {
  return async (
    command: DeleteTribeStoryImageUploadCommand
  ): Promise<boolean> =>
    tribeStoryImageRepository.deleteUpload({
      imageId: normalizeText(command.imageId),
      tribeSlug: normalizeText(command.tribeSlug),
    });
}
