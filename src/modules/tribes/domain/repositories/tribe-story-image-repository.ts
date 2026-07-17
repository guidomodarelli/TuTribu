import type { TRIBE_STORY_IMAGE_UPLOAD_STATUS } from "@/src/modules/tribes/constants/tribe-story";

export type TribeStoryImageUploadStatus =
  (typeof TRIBE_STORY_IMAGE_UPLOAD_STATUS)[keyof typeof TRIBE_STORY_IMAGE_UPLOAD_STATUS];

export type CreateTribeStoryImageUploadCommand = {
  tribeSlug: string;
};

export type TribeStoryImageUploadCreation = {
  deliveryUrl: string;
  imageId: string;
  uploadUrl: string;
};

export type TribeStoryImageUploadResult =
  | ({ status: typeof TRIBE_STORY_IMAGE_UPLOAD_STATUS.created } & TribeStoryImageUploadCreation)
  | { status: typeof TRIBE_STORY_IMAGE_UPLOAD_STATUS.forbidden }
  | { status: typeof TRIBE_STORY_IMAGE_UPLOAD_STATUS.invalidImage };

export type DeleteTribeStoryImageUploadCommand = {
  imageId: string;
  tribeSlug: string;
};

export type TribeStoryImageCleanupSummary = {
  deletedCount: number;
  failedRemoteDeleteCount: number;
};

export type TribeStoryImageRepository = {
  cleanupOrphanUploads(): Promise<TribeStoryImageCleanupSummary>;
  createUpload(
    command: CreateTribeStoryImageUploadCommand
  ): Promise<TribeStoryImageUploadResult>;
  deleteUpload(command: DeleteTribeStoryImageUploadCommand): Promise<boolean>;
};
