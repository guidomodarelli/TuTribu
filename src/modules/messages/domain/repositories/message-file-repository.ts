import type {
  MESSAGE_FILE_PREPARATION_STATUS,
  MESSAGE_MUTATION_STATUS,
} from "@/src/modules/messages/constants/message-round";

export type MessageFileAttachmentDraft = {
  assetId: string;
  sortOrder: number;
};

export type PreparedMessageFileAttachmentResult =
  | {
      files: MessageFileAttachmentDraft[];
      status: typeof MESSAGE_FILE_PREPARATION_STATUS.ready;
    }
  | {
      status: typeof MESSAGE_MUTATION_STATUS.invalidFile;
    };

export type PrepareMessageFilesForAttachmentCommand = {
  files: MessageFileAttachmentDraft[];
  messageId?: string;
  tribeSlug: string;
  userId: string;
};

export type DeletePendingMessageFilesCommand = {
  messageId: string;
  tribeSlug: string;
  userId: string;
};

export type CleanupOrphanMessageFilesCommand = {
  abandonedDraftTtlHours: number;
  batchLimit: number;
  interactiveDeleteGraceMinutes: number;
};

export type CleanupOrphanMessageFilesResult = {
  reclaimedDrafts: number;
  remoteDeletedPending: number;
  remoteDeletedQueued: number;
  remoteFailures: number;
};

export type MessageFileUploadCreationResult =
  | {
      assetId: string;
      status: typeof MESSAGE_MUTATION_STATUS.created;
      uploadHeaders: Record<string, string>;
      uploadUrl: string;
    }
  | {
      status:
        | typeof MESSAGE_MUTATION_STATUS.forbidden
        | typeof MESSAGE_MUTATION_STATUS.notFound
        | typeof MESSAGE_MUTATION_STATUS.invalidFile;
    };

export type CreateMessageFileUploadCommand = {
  fileName: string;
  fileSizeBytes: number;
  mimeType: string;
  tribeSlug: string;
  userId: string;
};

export type DeleteMessageFileCommand = {
  assetId: string;
  tribeSlug: string;
  userId: string;
};

export type MessageFileDeletionResult = {
  status:
    | typeof MESSAGE_MUTATION_STATUS.deleted
    | typeof MESSAGE_MUTATION_STATUS.forbidden
    | typeof MESSAGE_MUTATION_STATUS.notFound
    | typeof MESSAGE_MUTATION_STATUS.invalidFile;
};

export type CreateMessageFileDownloadUrlCommand = {
  assetId: string;
  tribeSlug: string;
  userId: string;
};

export type MessageFileDownloadUrlResult =
  | {
      downloadUrl: string;
      status: typeof MESSAGE_MUTATION_STATUS.created;
    }
  | {
      status:
        | typeof MESSAGE_MUTATION_STATUS.notFound
        | typeof MESSAGE_MUTATION_STATUS.invalidFile;
    };

export interface MessageFileRepository {
  cleanupOrphanFiles(
    command: CleanupOrphanMessageFilesCommand
  ): Promise<CleanupOrphanMessageFilesResult>;
  createDownloadUrl(
    command: CreateMessageFileDownloadUrlCommand
  ): Promise<MessageFileDownloadUrlResult>;
  createUpload(
    command: CreateMessageFileUploadCommand
  ): Promise<MessageFileUploadCreationResult>;
  deleteFile(
    command: DeleteMessageFileCommand
  ): Promise<MessageFileDeletionResult>;
  deletePendingFiles(command: DeletePendingMessageFilesCommand): Promise<void>;
  prepareForAttachment(
    command: PrepareMessageFilesForAttachmentCommand
  ): Promise<PreparedMessageFileAttachmentResult>;
}
