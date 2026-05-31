import {
  TRIBE_MESSAGE_CONTENT,
  TRIBE_MESSAGE_TITLE,
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
import { normalizeMessageImageDrafts } from "@/src/modules/messages/application/use-cases/message-images-use-cases";
import {
  InvalidVideoUrlError,
  type ParsedExternalVideo,
  parseExternalVideoUrl,
} from "@/src/modules/shared/domain/value-objects/external-video-url";
import type { MessageImageRepository } from "@/src/modules/messages/domain/repositories/message-image-repository";

type CreateTribeMessageDependencies = {
  messageCreationRepository: MessageCreationRepository;
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

export function createTribeMessage({
  messageCreationRepository,
  messageImageRepository,
}: CreateTribeMessageDependencies) {
  return async (
    command: CreateTribeMessageCommand
  ): Promise<MessageCreationResult> => {
    const content = normalizeMessageContent(command.content);
    const title = normalizeMessageTitle(command.title);
    const channelId = command.channelId.trim();
    const poll = command.poll ? normalizeMessagePollDraft(command.poll) : null;
    const normalizedImages = normalizeMessageImageDrafts(command.images);

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

    if (normalizedImages.status === MESSAGE_MUTATION_STATUS.invalidImage) {
      return { status: MESSAGE_MUTATION_STATUS.invalidImage };
    }

    let parsedVideo: ParsedExternalVideo | null = null;
    if (command.video) {
      const result = parseVideoDraft(command.video.url);
      if (result.kind === PARSED_VIDEO_KIND.invalid) {
        return {
          status: MESSAGE_MUTATION_STATUS.invalidVideoUrl,
        };
      }
      parsedVideo = result.value;
    }

    const tribeSlug = command.tribeSlug.trim();
    const userId = command.authorId;
    let images = normalizedImages.images;

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

    try {
      const result = await messageCreationRepository.create({
        authorId: command.authorId,
        channelId,
        tribeSlug,
        content,
        ...(images.length > 0 ? { images } : {}),
        ...(poll ? { poll } : {}),
        ...(parsedVideo ? { video: parsedVideo } : {}),
        title,
      });

      if (result.status !== MESSAGE_MUTATION_STATUS.created) {
        await cleanupPreparedMessageImages({
          images,
          messageImageRepository,
          tribeSlug,
          userId,
        });
      }

      return result;
    } catch (error) {
      await cleanupPreparedMessageImages({
        images,
        messageImageRepository,
        tribeSlug,
        userId,
      });

      throw error;
    }
  };
}
