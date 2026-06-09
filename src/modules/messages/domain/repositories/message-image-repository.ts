import type {
  MESSAGE_IMAGE_PREPARATION_STATUS,
  MESSAGE_MUTATION_STATUS,
} from "@/src/modules/messages/constants/message-round";

export type MessageImageAttachmentDraft = {
  altText: string;
  assetId: string;
  sortOrder: number;
};

export type PreparedMessageImageAttachmentResult =
  | {
      images: MessageImageAttachmentDraft[];
      status: typeof MESSAGE_IMAGE_PREPARATION_STATUS.ready;
    }
  | {
      status: typeof MESSAGE_MUTATION_STATUS.invalidImage;
    };

export type PrepareMessageImagesForAttachmentCommand = {
  images: MessageImageAttachmentDraft[];
  messageId?: string;
  tribeSlug: string;
  userId: string;
};

export type DeletePendingMessageImagesCommand = {
  messageId: string;
  tribeSlug: string;
  userId: string;
};

export type CleanupOrphanMessageImagesCommand = {
  abandonedDraftTtlHours: number;
  batchLimit: number;
  interactiveDeleteGraceMinutes: number;
};

export type CleanupOrphanMessageImagesResult = {
  reclaimedDrafts: number;
  remoteDeletedPending: number;
  remoteDeletedQueued: number;
  remoteFailures: number;
};

export type MessageImageUploadCreationResult =
  | {
      assetId: string;
      imageId: string;
      status: typeof MESSAGE_MUTATION_STATUS.created;
      uploadUrl: string;
    }
  | {
      status:
        | typeof MESSAGE_MUTATION_STATUS.forbidden
        | typeof MESSAGE_MUTATION_STATUS.notFound
        | typeof MESSAGE_MUTATION_STATUS.invalidImage;
    };

export type CreateMessageImageUploadCommand = {
  tribeSlug: string;
  userId: string;
};

export type DeleteMessageImageCommand = {
  assetId: string;
  tribeSlug: string;
  userId: string;
};

export type MessageImageDeletionResult = {
  status:
    | typeof MESSAGE_MUTATION_STATUS.deleted
    | typeof MESSAGE_MUTATION_STATUS.forbidden
    | typeof MESSAGE_MUTATION_STATUS.notFound
    | typeof MESSAGE_MUTATION_STATUS.invalidImage;
};

export interface MessageImageRepository {
  cleanupOrphanImages(
    command: CleanupOrphanMessageImagesCommand
  ): Promise<CleanupOrphanMessageImagesResult>;
  createUpload(
    command: CreateMessageImageUploadCommand
  ): Promise<MessageImageUploadCreationResult>;
  deleteImage(
    command: DeleteMessageImageCommand
  ): Promise<MessageImageDeletionResult>;
  deletePendingImages(command: DeletePendingMessageImagesCommand): Promise<void>;
  prepareForAttachment(
    command: PrepareMessageImagesForAttachmentCommand
  ): Promise<PreparedMessageImageAttachmentResult>;
}
