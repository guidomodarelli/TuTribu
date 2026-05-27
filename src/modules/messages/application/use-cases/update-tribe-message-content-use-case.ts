import type { UpdateTribeMessageContentCommand } from "@/src/modules/messages/application/commands/tribe-message-command";
import type { MessageContentUpdateResult } from "@/src/modules/messages/application/results/message-mutation-result";
import {
  MESSAGE_MUTATION_STATUS,
  TRIBE_MESSAGE_CONTENT,
  TRIBE_MESSAGE_TITLE,
} from "@/src/modules/messages/constants/message-round";
import type { MessageContentUpdateRepository } from "@/src/modules/messages/domain/repositories/message-content-update-repository";
import {
  isValidMessagePollDraft,
  normalizeMessagePollDraft,
} from "@/src/modules/messages/application/use-cases/manage-message-polls-use-cases";
import {
  InvalidVideoUrlError,
  type ParsedExternalVideo,
  parseExternalVideoUrl,
} from "@/src/modules/shared/domain/value-objects/external-video-url";

type UpdateTribeMessageContentDependencies = {
  messageContentUpdateRepository: MessageContentUpdateRepository;
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
}: UpdateTribeMessageContentDependencies) {
  return async (
    command: UpdateTribeMessageContentCommand
  ): Promise<MessageContentUpdateResult> => {
    const title = command.title.trim();
    const content = command.content.trim();

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

    return messageContentUpdateRepository.updateContent({
      content,
      messageId: command.messageId.trim(),
      ...(poll ? { poll } : {}),
      title,
      tribeSlug: command.tribeSlug.trim(),
      userId: command.userId.trim(),
      ...(parsedVideo !== undefined ? { video: parsedVideo } : {}),
    });
  };
}
