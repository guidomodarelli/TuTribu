import type { UpdateTribeMessageContentCommand } from "@/src/modules/messages/application/commands/tribe-message-command";
import type { MessageContentUpdateResult } from "@/src/modules/messages/application/results/message-mutation-result";
import {
  MESSAGE_FILE_PREPARATION_STATUS,
  MESSAGE_IMAGE_PREPARATION_STATUS,
  MESSAGE_MUTATION_STATUS,
  TRIBE_MESSAGE_CONTENT,
  TRIBE_MESSAGE_TITLE,
} from "@/src/modules/messages/constants/message-round";
import type { MessageContentUpdateRepository } from "@/src/modules/messages/domain/repositories/message-content-update-repository";
import type { MessageImageRepository } from "@/src/modules/messages/domain/repositories/message-image-repository";
import type { MessageFileRepository } from "@/src/modules/messages/domain/repositories/message-file-repository";
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

type UpdateTribeMessageContentDependencies = {
  messageContentUpdateRepository: MessageContentUpdateRepository;
  messageFileRepository?: Pick<
    MessageFileRepository,
    "deletePendingFiles" | "prepareForAttachment"
  >;
  messageImageRepository?: Pick<
    MessageImageRepository,
    "deletePendingImages" | "prepareForAttachment"
  >;
};

function isInvalidText(
  value: string,
  limits: { maxLength: number; minLength: number }
): boolean {
  return value.length < limits.minLength || value.length > limits.maxLength;
}

type ValidMessageMedia = Extract<
  NormalizedMessageMediaResult,
  { status: typeof NORMALIZED_MESSAGE_MEDIA_STATUS.valid }
>;

type ValidMessageFiles = Extract<
  NormalizedMessageFileDrafts,
  { status: typeof NORMALIZED_MESSAGE_FILES_STATUS.valid }
>;

type ContentUpdateDraft = {
  content: string;
  files: ValidMessageFiles["files"] | undefined;
  images: ValidMessageMedia["images"] | undefined;
  messageId: string;
  poll: ReturnType<typeof normalizeMessagePollDraft> | undefined;
  title: string;
  tribeSlug: string;
  userId: string;
  videos: ValidMessageMedia["videos"] | undefined;
};

type ContentUpdateAttachmentRepositories = Pick<
  UpdateTribeMessageContentDependencies,
  "messageFileRepository" | "messageImageRepository"
>;

type ContentUpdateFailure = { failure: MessageContentUpdateResult };

/**
 * Trims and validates the edit before any attachment is prepared.
 * @param command - Raw content update command.
 * @returns The rejection to answer, or the normalized draft.
 */
function validateContentUpdate(
  command: UpdateTribeMessageContentCommand
): ContentUpdateFailure | { draft: ContentUpdateDraft } {
  const title = command.title.trim();
  const content = command.content.trim();

  if (
    isInvalidText(title, TRIBE_MESSAGE_TITLE) ||
    isInvalidText(content, TRIBE_MESSAGE_CONTENT)
  ) {
    return { failure: { status: MESSAGE_MUTATION_STATUS.invalidContent } };
  }

  const poll = command.poll
    ? normalizeMessagePollDraft(command.poll)
    : undefined;

  if (poll && !isValidMessagePollDraft(poll)) {
    return { failure: { status: MESSAGE_MUTATION_STATUS.invalidPoll } };
  }

  const normalizedMedia =
    command.media === undefined
      ? undefined
      : normalizeMessageMediaDrafts(command.media);

  if (
    normalizedMedia &&
    normalizedMedia.status !== NORMALIZED_MESSAGE_MEDIA_STATUS.valid
  ) {
    return { failure: { status: normalizedMedia.status } };
  }

  const normalizedFiles =
    command.files === undefined
      ? undefined
      : normalizeMessageFileDrafts(command.files);

  if (
    normalizedFiles &&
    normalizedFiles.status !== NORMALIZED_MESSAGE_FILES_STATUS.valid
  ) {
    return { failure: { status: normalizedFiles.status } };
  }

  return {
    draft: {
      content,
      files: normalizedFiles?.files,
      images: normalizedMedia?.images,
      messageId: command.messageId.trim(),
      poll,
      title,
      tribeSlug: command.tribeSlug.trim(),
      userId: command.userId.trim(),
      videos: normalizedMedia?.videos,
    },
  };
}

/**
 * Prepares the new images and then the new files the edit attaches.
 * @param options - Normalized draft and the attachment repositories.
 * @returns The rejection to answer, or the prepared attachments.
 */
async function prepareContentUpdateAttachments({
  draft,
  messageFileRepository,
  messageImageRepository,
}: ContentUpdateAttachmentRepositories & { draft: ContentUpdateDraft }): Promise<
  ContentUpdateFailure | Pick<ContentUpdateDraft, "files" | "images">
> {
  const { messageId, tribeSlug, userId } = draft;
  let { files, images } = draft;

  if (images && images.length > 0) {
    const preparedImages = await messageImageRepository?.prepareForAttachment({
      images,
      messageId,
      tribeSlug,
      userId,
    });

    if (
      preparedImages?.status !== MESSAGE_IMAGE_PREPARATION_STATUS.ready
    ) {
      return { failure: { status: MESSAGE_MUTATION_STATUS.invalidImage } };
    }

    images = preparedImages.images;
  }

  if (files && files.length > 0) {
    const preparedFiles = await messageFileRepository?.prepareForAttachment({
      files,
      messageId,
      tribeSlug,
      userId,
    });

    if (
      preparedFiles?.status !== MESSAGE_FILE_PREPARATION_STATUS.ready
    ) {
      return { failure: { status: MESSAGE_MUTATION_STATUS.invalidFile } };
    }

    files = preparedFiles.files;
  }

  return { files, images };
}

/**
 * Deletes the drafts left pending by an edit that replaced the media or the files.
 * @param options - Original command, normalized draft and the attachment repositories.
 */
async function deleteReplacedPendingAttachments({
  command,
  draft,
  messageFileRepository,
  messageImageRepository,
}: ContentUpdateAttachmentRepositories & {
  command: UpdateTribeMessageContentCommand;
  draft: ContentUpdateDraft;
}): Promise<void> {
  const { messageId, tribeSlug, userId } = draft;

  if (command.media !== undefined) {
    await messageImageRepository?.deletePendingImages({
      messageId,
      tribeSlug,
      userId,
    });
  }

  if (command.files !== undefined) {
    await messageFileRepository?.deletePendingFiles({
      messageId,
      tribeSlug,
      userId,
    });
  }
}

export function updateTribeMessageContent({
  messageContentUpdateRepository,
  messageFileRepository,
  messageImageRepository,
}: UpdateTribeMessageContentDependencies) {
  return async (
    command: UpdateTribeMessageContentCommand
  ): Promise<MessageContentUpdateResult> => {
    const validation = validateContentUpdate(command);

    if ("failure" in validation) {
      return validation.failure;
    }

    const { draft } = validation;
    const prepared = await prepareContentUpdateAttachments({
      draft,
      messageFileRepository,
      messageImageRepository,
    });

    if ("failure" in prepared) {
      return prepared.failure;
    }

    const { files, images } = prepared;
    const { content, messageId, poll, title, tribeSlug, userId, videos } = draft;
    const result = await messageContentUpdateRepository.updateContent({
      content,
      ...(files !== undefined ? { files } : {}),
      ...(images !== undefined ? { images } : {}),
      messageId,
      ...(poll ? { poll } : {}),
      title,
      tribeSlug,
      userId,
      ...(videos !== undefined ? { videos } : {}),
    });

    if (result.status === MESSAGE_MUTATION_STATUS.updated) {
      await deleteReplacedPendingAttachments({
        command,
        draft,
        messageFileRepository,
        messageImageRepository,
      });
    }

    return result;
  };
}
