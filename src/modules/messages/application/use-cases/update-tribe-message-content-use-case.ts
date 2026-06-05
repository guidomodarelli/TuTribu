import type { UpdateTribeMessageContentCommand } from "@/src/modules/messages/application/commands/tribe-message-command";
import type { MessageContentUpdateResult } from "@/src/modules/messages/application/results/message-mutation-result";
import {
  MESSAGE_IMAGE_PREPARATION_STATUS,
  MESSAGE_MUTATION_STATUS,
  TRIBE_MESSAGE_CONTENT,
  TRIBE_MESSAGE_TITLE,
} from "@/src/modules/messages/constants/message-round";
import type { MessageContentUpdateRepository } from "@/src/modules/messages/domain/repositories/message-content-update-repository";
import type { MessageImageRepository } from "@/src/modules/messages/domain/repositories/message-image-repository";
import {
  isValidMessagePollDraft,
  normalizeMessagePollDraft,
} from "@/src/modules/messages/application/use-cases/manage-message-polls-use-cases";
import {
  NORMALIZED_MESSAGE_MEDIA_STATUS,
  normalizeMessageMediaDrafts,
} from "@/src/modules/messages/application/use-cases/normalize-message-media-use-cases";

type UpdateTribeMessageContentDependencies = {
  messageContentUpdateRepository: MessageContentUpdateRepository;
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

export function updateTribeMessageContent({
  messageContentUpdateRepository,
  messageImageRepository,
}: UpdateTribeMessageContentDependencies) {
  return async (
    command: UpdateTribeMessageContentCommand
  ): Promise<MessageContentUpdateResult> => {
    const title = command.title.trim();
    const content = command.content.trim();
    const messageId = command.messageId.trim();
    const tribeSlug = command.tribeSlug.trim();
    const userId = command.userId.trim();

    if (
      isInvalidText(title, TRIBE_MESSAGE_TITLE) ||
      isInvalidText(content, TRIBE_MESSAGE_CONTENT)
    ) {
      return { status: MESSAGE_MUTATION_STATUS.invalidContent };
    }

    const poll = command.poll
      ? normalizeMessagePollDraft(command.poll)
      : undefined;

    if (poll && !isValidMessagePollDraft(poll)) {
      return { status: MESSAGE_MUTATION_STATUS.invalidPoll };
    }

    const normalizedMedia =
      command.media === undefined
        ? undefined
        : normalizeMessageMediaDrafts(command.media);

    if (
      normalizedMedia &&
      normalizedMedia.status !== NORMALIZED_MESSAGE_MEDIA_STATUS.valid
    ) {
      return { status: normalizedMedia.status };
    }

    const videos = normalizedMedia?.videos;
    let images = normalizedMedia?.images;

    if (images && images.length > 0) {
      const preparedImages = await messageImageRepository?.prepareForAttachment({
        images,
        messageId,
        tribeSlug,
        userId,
      });

      if (
        !preparedImages ||
        preparedImages.status !== MESSAGE_IMAGE_PREPARATION_STATUS.ready
      ) {
        return { status: MESSAGE_MUTATION_STATUS.invalidImage };
      }

      images = preparedImages.images;
    }

    const result = await messageContentUpdateRepository.updateContent({
      content,
      ...(images !== undefined ? { images } : {}),
      messageId,
      ...(poll ? { poll } : {}),
      title,
      tribeSlug,
      userId,
      ...(videos !== undefined ? { videos } : {}),
    });

    if (
      result.status === MESSAGE_MUTATION_STATUS.updated &&
      command.media !== undefined
    ) {
      await messageImageRepository?.deletePendingImages({
        messageId,
        tribeSlug,
        userId,
      });
    }

    return result;
  };
}
