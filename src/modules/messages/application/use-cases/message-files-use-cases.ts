import {
  MESSAGE_FILES,
  MESSAGE_MUTATION_STATUS,
} from "@/src/modules/messages/constants/message-round";
import {
  isAttachmentAssetId,
  isValidAttachmentUploadDeclaration,
  normalizeAttachmentFileName,
} from "@/src/modules/shared/application/attachments/attachment-upload-validation";
import type { MessageFileDraftCommand } from "@/src/modules/messages/application/commands/tribe-message-command";
import type {
  CreateMessageFileDownloadUrlCommand,
  CreateMessageFileUploadCommand,
  DeleteMessageFileCommand,
  MessageFileAttachmentDraft,
  MessageFileDeletionResult,
  MessageFileDownloadUrlResult,
  MessageFileRepository,
  MessageFileUploadCreationResult,
} from "@/src/modules/messages/domain/repositories/message-file-repository";

type CreateMessageFileUploadDependencies = {
  messageFileRepository: Pick<MessageFileRepository, "createUpload">;
};

type DeleteMessageFileDependencies = {
  messageFileRepository: Pick<MessageFileRepository, "deleteFile">;
};

type CreateMessageFileDownloadUrlDependencies = {
  messageFileRepository: Pick<MessageFileRepository, "createDownloadUrl">;
};

export const NORMALIZED_MESSAGE_FILES_STATUS = {
  valid: "valid",
} as const;

export type NormalizedMessageFileDrafts =
  | {
      files: MessageFileAttachmentDraft[];
      status: typeof NORMALIZED_MESSAGE_FILES_STATUS.valid;
    }
  | {
      status: typeof MESSAGE_MUTATION_STATUS.invalidFile;
    };

/**
 * Normalizes the composer's file draft list into attachment drafts: bounded
 * count, unique well-formed asset ids, and `sortOrder` derived from the array
 * index the author arranged.
 *
 * @param drafts - Raw file drafts from the composer payload.
 * @returns The normalized drafts, or an invalid-file status.
 */
export function normalizeMessageFileDrafts(
  drafts: MessageFileDraftCommand[] | null | undefined
): NormalizedMessageFileDrafts {
  const rawDrafts = drafts ?? [];

  if (rawDrafts.length > MESSAGE_FILES.maxCount) {
    return { status: MESSAGE_MUTATION_STATUS.invalidFile };
  }

  const files: MessageFileAttachmentDraft[] = [];
  const seenAssetIds = new Set<string>();

  for (const draft of rawDrafts) {
    const assetId = (draft.assetId ?? "").trim();

    if (!isAttachmentAssetId(assetId) || seenAssetIds.has(assetId)) {
      return { status: MESSAGE_MUTATION_STATUS.invalidFile };
    }

    seenAssetIds.add(assetId);
    files.push({ assetId, sortOrder: files.length });
  }

  return { files, status: NORMALIZED_MESSAGE_FILES_STATUS.valid };
}

export function createMessageFileUpload({
  messageFileRepository,
}: CreateMessageFileUploadDependencies) {
  return async (
    command: CreateMessageFileUploadCommand
  ): Promise<MessageFileUploadCreationResult> => {
    const fileName = normalizeAttachmentFileName(command.fileName);
    const mimeType = command.mimeType.trim().toLowerCase();

    if (
      !isValidAttachmentUploadDeclaration({
        fileName,
        fileSizeBytes: command.fileSizeBytes,
        mimeType,
      })
    ) {
      return { status: MESSAGE_MUTATION_STATUS.invalidFile };
    }

    return messageFileRepository.createUpload({
      fileName,
      fileSizeBytes: command.fileSizeBytes,
      mimeType,
      tribeSlug: command.tribeSlug.trim(),
      userId: command.userId.trim(),
    });
  };
}

export function deleteMessageFile({
  messageFileRepository,
}: DeleteMessageFileDependencies) {
  return async (
    command: DeleteMessageFileCommand
  ): Promise<MessageFileDeletionResult> =>
    messageFileRepository.deleteFile({
      assetId: command.assetId.trim(),
      tribeSlug: command.tribeSlug.trim(),
      userId: command.userId.trim(),
    });
}

export function createMessageFileDownloadUrl({
  messageFileRepository,
}: CreateMessageFileDownloadUrlDependencies) {
  return async (
    command: CreateMessageFileDownloadUrlCommand
  ): Promise<MessageFileDownloadUrlResult> => {
    const assetId = command.assetId.trim();

    if (!isAttachmentAssetId(assetId)) {
      return { status: MESSAGE_MUTATION_STATUS.notFound };
    }

    return messageFileRepository.createDownloadUrl({
      assetId,
      tribeSlug: command.tribeSlug.trim(),
      userId: command.userId.trim(),
    });
  };
}
