import {
  TRIBE_MESSAGE_CONTENT,
  TRIBE_MESSAGE_TITLE,
  MESSAGE_FILE_PREPARATION_STATUS,
  MESSAGE_IMAGE_PREPARATION_STATUS,
  MESSAGE_MUTATION_STATUS,
} from "@/src/modules/messages/constants/message-round";
import type { CreateTribeMessageCommand } from "@/src/modules/messages/application/commands/tribe-message-command";
import type { MessageCreationResult } from "@/src/modules/messages/application/results/message-mutation-result";
import type { MessageCreationRepository } from "@/src/modules/messages/domain/repositories/message-creation-repository";
import {
  isValidMessagePollDraft,
  normalizeMessagePollDraft,
} from "@/src/modules/messages/application/use-cases/manage-message-polls-use-cases";
import {
  NORMALIZED_MESSAGE_MEDIA_STATUS,
  normalizeMessageMediaDrafts,
  type NormalizedMessageMediaResult,
} from "@/src/modules/messages/application/use-cases/normalize-message-media-use-cases";
import {
  NORMALIZED_MESSAGE_FILES_STATUS,
  normalizeMessageFileDrafts,
  type NormalizedMessageFileDrafts,
} from "@/src/modules/messages/application/use-cases/message-files-use-cases";
import type { MessageImageRepository } from "@/src/modules/messages/domain/repositories/message-image-repository";
import type { MessageFileRepository } from "@/src/modules/messages/domain/repositories/message-file-repository";

type CreateTribeMessageDependencies = {
  messageCreationRepository: MessageCreationRepository;
  messageFileRepository?: Pick<MessageFileRepository, "prepareForAttachment"> &
    Partial<Pick<MessageFileRepository, "deleteFile">>;
  messageImageRepository?: Pick<MessageImageRepository, "prepareForAttachment"> &
    Partial<Pick<MessageImageRepository, "deleteImage">>;
};

function normalizeMessageContent(content: string): string {
  return content.trim();
}

function normalizeMessageTitle(title: string): string {
  return title.trim();
}

function isInvalidText(value: string, limits: { maxLength: number; minLength: number }): boolean {
  return (
    value.length < limits.minLength ||
    value.length > limits.maxLength
  );
}

async function cleanupPreparedMessageImages({
  images,
  messageImageRepository,
  tribeSlug,
  userId,
}: {
  images: { assetId: string }[];
  messageImageRepository?: Partial<Pick<MessageImageRepository, "deleteImage">>;
  tribeSlug: string;
  userId: string;
}): Promise<void> {
  if (!messageImageRepository?.deleteImage || images.length === 0) {
    return;
  }

  const deleteImage = messageImageRepository.deleteImage;

  await Promise.allSettled(
    images.map((image) =>
      deleteImage({
        assetId: image.assetId,
        tribeSlug,
        userId,
      })
    )
  );
}

async function cleanupPreparedMessageFiles({
  files,
  messageFileRepository,
  tribeSlug,
  userId,
}: {
  files: { assetId: string }[];
  messageFileRepository?: Partial<Pick<MessageFileRepository, "deleteFile">>;
  tribeSlug: string;
  userId: string;
}): Promise<void> {
  if (!messageFileRepository?.deleteFile || files.length === 0) {
    return;
  }

  const deleteFile = messageFileRepository.deleteFile;

  await Promise.allSettled(
    files.map((file) =>
      deleteFile({
        assetId: file.assetId,
        tribeSlug,
        userId,
      })
    )
  );
}

type ValidMessageMedia = Extract<
  NormalizedMessageMediaResult,
  { status: typeof NORMALIZED_MESSAGE_MEDIA_STATUS.valid }
>;

type ValidMessageFiles = Extract<
  NormalizedMessageFileDrafts,
  { status: typeof NORMALIZED_MESSAGE_FILES_STATUS.valid }
>;

type MessageCreationDraft = {
  channelId: string;
  content: string;
  files: ValidMessageFiles["files"];
  images: ValidMessageMedia["images"];
  poll: ReturnType<typeof normalizeMessagePollDraft> | null;
  title: string;
  videos: ValidMessageMedia["videos"];
};

type MessageCreationFailure = { failure: MessageCreationResult };

type MessageCreationScope = {
  messageFileRepository: CreateTribeMessageDependencies["messageFileRepository"];
  messageImageRepository: CreateTribeMessageDependencies["messageImageRepository"];
  tribeSlug: string;
  userId: string;
};

/**
 * Normalizes and validates the publication before any attachment is prepared.
 * @param command - Raw creation command.
 * @returns The rejection to answer, or the normalized draft.
 */
function validateMessageCreation(
  command: CreateTribeMessageCommand
): MessageCreationFailure | { draft: MessageCreationDraft } {
  const content = normalizeMessageContent(command.content);
  const title = normalizeMessageTitle(command.title);
  const channelId = command.channelId.trim();
  const poll = command.poll ? normalizeMessagePollDraft(command.poll) : null;
  const normalizedMedia = normalizeMessageMediaDrafts(command.media);
  const normalizedFiles = normalizeMessageFileDrafts(command.files);

  if (
    isInvalidText(content, TRIBE_MESSAGE_CONTENT) ||
    isInvalidText(title, TRIBE_MESSAGE_TITLE)
  ) {
    return { failure: { status: MESSAGE_MUTATION_STATUS.invalidContent } };
  }

  if (!channelId) {
    return { failure: { status: MESSAGE_MUTATION_STATUS.invalidChannel } };
  }

  if (poll && !isValidMessagePollDraft(poll)) {
    return { failure: { status: MESSAGE_MUTATION_STATUS.invalidPoll } };
  }

  if (normalizedMedia.status !== NORMALIZED_MESSAGE_MEDIA_STATUS.valid) {
    return { failure: { status: normalizedMedia.status } };
  }

  if (normalizedFiles.status !== NORMALIZED_MESSAGE_FILES_STATUS.valid) {
    return { failure: { status: normalizedFiles.status } };
  }

  return {
    draft: {
      channelId,
      content,
      files: normalizedFiles.files,
      images: normalizedMedia.images,
      poll,
      title,
      videos: normalizedMedia.videos,
    },
  };
}

/**
 * A retry of a stored publication with attachments must be answered before attachment preparation: its assets are
 * already attached, preparation would reject them and the cleanup that follows would delete the stored media.
 * Without attachments the repository's single statement already replays the key, so no extra lookup is needed.
 * @param options - Command, normalized draft, repository and the author scope.
 * @returns The stored message id when the command replays a stored publication.
 */
async function findReplayedPublication({
  command,
  draft,
  messageCreationRepository,
  tribeSlug,
  userId,
}: {
  command: CreateTribeMessageCommand;
  draft: MessageCreationDraft;
  messageCreationRepository: MessageCreationRepository;
  tribeSlug: string;
  userId: string;
}): Promise<string | null> {
  const hasAttachments = draft.images.length > 0 || draft.files.length > 0;

  if (!command.clientRequestId || !hasAttachments || !messageCreationRepository.findPublicationByClientRequestId) {
    return null;
  }

  return messageCreationRepository.findPublicationByClientRequestId({
    authorId: userId,
    clientRequestId: command.clientRequestId,
    tribeSlug,
  });
}

/**
 * Prepares the images and then the files; a failed preparation cleans up what was prepared so far.
 * @param options - Normalized draft, attachment repositories and the author scope.
 * @returns The rejection to answer, or the prepared attachments.
 */
async function prepareCreationAttachments({
  draft,
  ...scope
}: MessageCreationScope & { draft: MessageCreationDraft }): Promise<
  MessageCreationFailure | Pick<MessageCreationDraft, "files" | "images">
> {
  const { messageFileRepository, messageImageRepository, tribeSlug, userId } = scope;
  let { files, images } = draft;

  if (images.length > 0) {
    const preparedImages = await messageImageRepository?.prepareForAttachment({
      images,
      tribeSlug,
      userId,
    });

    if (
      preparedImages?.status !== MESSAGE_IMAGE_PREPARATION_STATUS.ready
    ) {
      await cleanupPreparedMessageImages({
        images,
        messageImageRepository,
        tribeSlug,
        userId,
      });

      return { failure: { status: MESSAGE_MUTATION_STATUS.invalidImage } };
    }

    images = preparedImages.images;
  }

  if (files.length > 0) {
    const preparedFiles = await messageFileRepository?.prepareForAttachment({
      files,
      tribeSlug,
      userId,
    });

    if (
      preparedFiles?.status !== MESSAGE_FILE_PREPARATION_STATUS.ready
    ) {
      await cleanupPreparedAttachments({ ...scope, files, images });

      return { failure: { status: MESSAGE_MUTATION_STATUS.invalidFile } };
    }

    files = preparedFiles.files;
  }

  return { files, images };
}

/**
 * Deletes every prepared image and file of a publication that was not stored.
 * @param options - Prepared attachments, attachment repositories and the author scope.
 */
async function cleanupPreparedAttachments({
  files,
  images,
  messageFileRepository,
  messageImageRepository,
  tribeSlug,
  userId,
}: MessageCreationScope & Pick<MessageCreationDraft, "files" | "images">): Promise<void> {
  await Promise.all([
    cleanupPreparedMessageImages({
      images,
      messageImageRepository,
      tribeSlug,
      userId,
    }),
    cleanupPreparedMessageFiles({
      files,
      messageFileRepository,
      tribeSlug,
      userId,
    }),
  ]);
}

export function createTribeMessage({
  messageCreationRepository,
  messageFileRepository,
  messageImageRepository,
}: CreateTribeMessageDependencies) {
  return async (
    command: CreateTribeMessageCommand
  ): Promise<MessageCreationResult> => {
    const validation = validateMessageCreation(command);

    if ("failure" in validation) {
      return validation.failure;
    }

    const { draft } = validation;
    const tribeSlug = command.tribeSlug.trim();
    const userId = command.authorId;
    const storedMessageId = await findReplayedPublication({
      command,
      draft,
      messageCreationRepository,
      tribeSlug,
      userId,
    });

    if (storedMessageId) {
      return { messageId: storedMessageId, status: MESSAGE_MUTATION_STATUS.replayed };
    }

    const scope: MessageCreationScope = { messageFileRepository, messageImageRepository, tribeSlug, userId };
    const prepared = await prepareCreationAttachments({ ...scope, draft });

    if ("failure" in prepared) {
      return prepared.failure;
    }

    const { files, images } = prepared;
    const { channelId, content, poll, title, videos } = draft;

    try {
      const result = await messageCreationRepository.create({
        authorId: command.authorId,
        channelId,
        tribeSlug,
        content,
        ...(files.length > 0 ? { files } : {}),
        ...(images.length > 0 ? { images } : {}),
        ...(poll ? { poll } : {}),
        ...(videos.length > 0 ? { videos } : {}),
        title,
        ...(command.clientRequestId ? { clientRequestId: command.clientRequestId } : {}),
      });

      // A replay keeps its stored attachments; unattached preparations are left to the orphan cleanup
      // rather than risk deleting an asset the stored message already uses.
      if (result.status !== MESSAGE_MUTATION_STATUS.created && result.status !== MESSAGE_MUTATION_STATUS.replayed) {
        await cleanupPreparedAttachments({ ...scope, files, images });
      }

      return result;
    } catch (error) {
      await cleanupPreparedAttachments({ ...scope, files, images });

      throw error;
    }
  };
}
