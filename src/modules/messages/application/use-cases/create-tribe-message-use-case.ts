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
} from "@/src/modules/messages/application/use-cases/normalize-message-media-use-cases";
import {
  NORMALIZED_MESSAGE_FILES_STATUS,
  normalizeMessageFileDrafts,
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

export function createTribeMessage({
  messageCreationRepository,
  messageFileRepository,
  messageImageRepository,
}: CreateTribeMessageDependencies) {
  return async (
    command: CreateTribeMessageCommand
  ): Promise<MessageCreationResult> => {
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
      return {
        status: MESSAGE_MUTATION_STATUS.invalidContent,
      };
    }

    if (!channelId) {
      return {
        status: MESSAGE_MUTATION_STATUS.invalidChannel,
      };
    }

    if (poll && !isValidMessagePollDraft(poll)) {
      return {
        status: MESSAGE_MUTATION_STATUS.invalidPoll,
      };
    }

    if (normalizedMedia.status !== NORMALIZED_MESSAGE_MEDIA_STATUS.valid) {
      return { status: normalizedMedia.status };
    }

    if (normalizedFiles.status !== NORMALIZED_MESSAGE_FILES_STATUS.valid) {
      return { status: normalizedFiles.status };
    }

    const tribeSlug = command.tribeSlug.trim();
    const userId = command.authorId;
    const videos = normalizedMedia.videos;
    let images = normalizedMedia.images;
    let files = normalizedFiles.files;

    if (images.length > 0) {
      const preparedImages = await messageImageRepository?.prepareForAttachment({
        images,
        tribeSlug,
        userId,
      });

      if (
        !preparedImages ||
        preparedImages.status !== MESSAGE_IMAGE_PREPARATION_STATUS.ready
      ) {
        await cleanupPreparedMessageImages({
          images,
          messageImageRepository,
          tribeSlug,
          userId,
        });

        return { status: MESSAGE_MUTATION_STATUS.invalidImage };
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
        !preparedFiles ||
        preparedFiles.status !== MESSAGE_FILE_PREPARATION_STATUS.ready
      ) {
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

        return { status: MESSAGE_MUTATION_STATUS.invalidFile };
      }

      files = preparedFiles.files;
    }

    const cleanupPreparedAttachments = async (): Promise<void> => {
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
    };

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
      });

      if (result.status !== MESSAGE_MUTATION_STATUS.created) {
        await cleanupPreparedAttachments();
      }

      return result;
    } catch (error) {
      await cleanupPreparedAttachments();

      throw error;
    }
  };
}
