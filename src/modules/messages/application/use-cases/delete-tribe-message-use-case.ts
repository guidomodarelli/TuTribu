import type { DeleteTribeMessageCommand } from "@/src/modules/messages/application/commands/tribe-message-command";
import type { MessageDeletionResult } from "@/src/modules/messages/application/results/message-mutation-result";
import { MESSAGE_MUTATION_STATUS } from "@/src/modules/messages/constants/message-round";
import type { MessageDeletionRepository } from "@/src/modules/messages/domain/repositories/message-deletion-repository";
import type { MessageImageRepository } from "@/src/modules/messages/domain/repositories/message-image-repository";

type DeleteTribeMessageDependencies = {
  messageDeletionRepository: MessageDeletionRepository;
  messageImageRepository?: Pick<MessageImageRepository, "deletePendingImages">;
};

/**
 * Builds the use case that deletes a tribe message as a whole post.
 *
 * @param dependencies - Message deletion repository dependency.
 * @returns Use case function that deletes the target message.
 */
export function deleteTribeMessage({
  messageDeletionRepository,
  messageImageRepository,
}: DeleteTribeMessageDependencies) {
  return async (
    command: DeleteTribeMessageCommand
  ): Promise<MessageDeletionResult> => {
    const messageId = command.messageId.trim();
    const tribeSlug = command.tribeSlug.trim();
    const userId = command.userId.trim();
    const result = await messageDeletionRepository.delete({
      messageId,
      tribeSlug,
      userId,
    });

    if (result.status === MESSAGE_MUTATION_STATUS.deleted) {
      await messageImageRepository?.deletePendingImages({
        messageId,
        tribeSlug,
        userId,
      });
    }

    return result;
  };
}
