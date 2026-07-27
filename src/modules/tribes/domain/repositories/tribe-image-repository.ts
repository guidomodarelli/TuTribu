import type { TRIBE_IMAGE_UPLOAD_STATUS } from "@/src/modules/tribes/constants/tribe-images";

export type TribeImageUploadStatus =
  (typeof TRIBE_IMAGE_UPLOAD_STATUS)[keyof typeof TRIBE_IMAGE_UPLOAD_STATUS];

export type CreateTribeImageUploadCommand = {
  tribeSlug: string;
};

export type TribeImageUploadCreation = {
  deliveryUrl: string;
  imageId: string;
  uploadUrl: string;
};

export type TribeImageUploadResult =
  | ({ status: typeof TRIBE_IMAGE_UPLOAD_STATUS.created } & TribeImageUploadCreation)
  | { status: typeof TRIBE_IMAGE_UPLOAD_STATUS.forbidden }
  | { status: typeof TRIBE_IMAGE_UPLOAD_STATUS.invalidImage };

export type DeleteTribeImageUploadCommand = {
  imageId: string;
  tribeSlug: string;
};

export type TribeImageCleanupSummary = {
  deletedCount: number;
  failedRemoteDeleteCount: number;
};

/**
 * Reserved image uploads shared by the tribe story gallery and the tribe
 * identity (logo and cover).
 */
export type TribeImageRepository = {
  cleanupOrphanUploads(): Promise<TribeImageCleanupSummary>;
  createUpload(
    command: CreateTribeImageUploadCommand
  ): Promise<TribeImageUploadResult>;
  deleteUpload(command: DeleteTribeImageUploadCommand): Promise<boolean>;
};
