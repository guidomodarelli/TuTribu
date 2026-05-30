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
import { normalizeMessageImageDrafts } from "@/src/modules/messages/application/use-cases/message-images-use-cases";
import {
  InvalidVideoUrlError,
  type ParsedExternalVideo,
  parseExternalVideoUrl,
} from "@/src/modules/shared/domain/value-objects/external-video-url";

type UpdateTribeMessageContentDependencies = {
  messageContentUpdateRepository: MessageContentUpdateRepository;
  messageImageRepository?: Pick<
    MessageImageRepository,
    "deletePendingImages" | "prepareForAttachment"
  >;
};

const PARSED_VIDEO_KIND = {
  invalid: "invalid",
  ok: "ok",
} as const;

type ParsedVideoOrError =
  | { kind: typeof PARSED_VIDEO_KIND.ok; value: ParsedExternalVideo }
  | { kind: typeof PARSED_VIDEO_KIND.invalid };

function parseVideoDraft(rawUrl: string): ParsedVideoOrError {
  try {
    return { kind: PARSED_VIDEO_KIND.ok, value: parseExternalVideoUrl(rawUrl) };
  } catch (error) {
    if (error instanceof InvalidVideoUrlError) {
      return { kind: PARSED_VIDEO_KIND.invalid };
    }
    throw error;
  }
}

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

    const normalizedImages =
      command.images === undefined
        ? undefined
        : normalizeMessageImageDrafts(command.images);

    if (normalizedImages?.status === MESSAGE_MUTATION_STATUS.invalidImage) {
      return { status: MESSAGE_MUTATION_STATUS.invalidImage };
    }

    let parsedVideo: ParsedExternalVideo | null | undefined;

    if (command.video === null) {
      parsedVideo = null;
    } else if (command.video) {
      const result = parseVideoDraft(command.video.url);

      if (result.kind === PARSED_VIDEO_KIND.invalid) {
        return { status: MESSAGE_MUTATION_STATUS.invalidVideoUrl };
      }

      parsedVideo = result.value;
    }

    let images = normalizedImages?.images;
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
      ...(images ? { images } : {}),
      messageId,
      ...(poll ? { poll } : {}),
      title,
      tribeSlug,
      userId,
      ...(parsedVideo !== undefined ? { video: parsedVideo } : {}),
    });

    if (
      result.status === MESSAGE_MUTATION_STATUS.updated &&
      command.images !== undefined
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
