import { MESSAGE_REPLY_CONTENT, MESSAGE_MUTATION_STATUS } from "@/src/modules/messages/constants/message-round";
import type { CreateMessageReplyCommand } from "@/src/modules/messages/application/commands/tribe-message-command";
import type { MessageReplyCreationResult } from "@/src/modules/messages/application/results/message-mutation-result";
import type { MessageReplyRepository } from "@/src/modules/messages/domain/repositories/message-reply-repository";

type CreateMessageReplyDependencies = {
  messageReplyRepository: MessageReplyRepository;
};

function normalizeReplyContent(content: string): string {
  return content.trim();
}

function isInvalidReplyContent(content: string): boolean {
  return (
    content.length < MESSAGE_REPLY_CONTENT.minLength ||
    content.length > MESSAGE_REPLY_CONTENT.maxLength
  );
}

export function createMessageReply({
  messageReplyRepository,
}: CreateMessageReplyDependencies) {
  return async (
    command: CreateMessageReplyCommand
  ): Promise<MessageReplyCreationResult> => {
    const content = normalizeReplyContent(command.content);

    if (isInvalidReplyContent(content)) {
      return {
        status: MESSAGE_MUTATION_STATUS.invalidContent,
      };
    }

    return messageReplyRepository.create({
      ...command,
      tribeSlug: command.tribeSlug.trim(),
      content,
    });
  };
}
