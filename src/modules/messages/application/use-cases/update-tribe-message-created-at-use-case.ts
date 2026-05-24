import type { UpdateTribeMessageCreatedAtCommand } from "@/src/modules/messages/application/commands/tribe-message-command";
import type { MessageCreatedAtUpdateResult } from "@/src/modules/messages/application/results/message-mutation-result";
import { MESSAGE_MUTATION_STATUS } from "@/src/modules/messages/constants/message-round";
import type { MessageCreatedAtUpdateRepository } from "@/src/modules/messages/domain/repositories/message-created-at-update-repository";

type UpdateTribeMessageCreatedAtDependencies = {
  messageCreatedAtUpdateRepository: MessageCreatedAtUpdateRepository;
};

export function updateTribeMessageCreatedAt({
  messageCreatedAtUpdateRepository,
}: UpdateTribeMessageCreatedAtDependencies) {
  return async (
    command: UpdateTribeMessageCreatedAtCommand
  ): Promise<MessageCreatedAtUpdateResult> => {
    const trimmedCreatedAt = command.createdAt.trim();
    const parsedCreatedAt = trimmedCreatedAt
      ? new Date(trimmedCreatedAt)
      : null;

    if (!parsedCreatedAt || Number.isNaN(parsedCreatedAt.getTime())) {
      return { status: MESSAGE_MUTATION_STATUS.invalidContent };
    }

    return messageCreatedAtUpdateRepository.updateCreatedAt({
      createdAt: parsedCreatedAt.toISOString(),
      messageId: command.messageId.trim(),
      tribeSlug: command.tribeSlug.trim(),
      userId: command.userId.trim(),
    });
  };
}
