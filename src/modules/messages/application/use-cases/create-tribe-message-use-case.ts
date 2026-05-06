import {
  TRIBE_MESSAGE_CONTENT,
  TRIBE_MESSAGE_TITLE,
  MESSAGE_MUTATION_STATUS,
} from "@/src/modules/messages/constants/message-round";
import type { CreateTribeMessageCommand } from "@/src/modules/messages/application/commands/tribe-message-command";
import type { MessageCreationResult } from "@/src/modules/messages/application/results/message-mutation-result";
import type { MessageCreationRepository } from "@/src/modules/messages/domain/repositories/message-creation-repository";

type CreateTribeMessageDependencies = {
  messageCreationRepository: MessageCreationRepository;
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

export function createTribeMessage({
  messageCreationRepository,
}: CreateTribeMessageDependencies) {
  return async (
    command: CreateTribeMessageCommand
  ): Promise<MessageCreationResult> => {
    const content = normalizeMessageContent(command.content);
    const title = normalizeMessageTitle(command.title);
    const channelId = command.channelId.trim();

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

    return messageCreationRepository.create({
      ...command,
      channelId,
      tribeSlug: command.tribeSlug.trim(),
      content,
      title,
    });
  };
}
