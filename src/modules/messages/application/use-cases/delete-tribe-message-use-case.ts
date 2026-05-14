import type { DeleteTribeMessageCommand } from "@/src/modules/messages/application/commands/tribe-message-command";
import type { MessageDeletionResult } from "@/src/modules/messages/application/results/message-mutation-result";
import type { MessageDeletionRepository } from "@/src/modules/messages/domain/repositories/message-deletion-repository";

type DeleteTribeMessageDependencies = {
  messageDeletionRepository: MessageDeletionRepository;
};

/**
 * Builds the use case that deletes a tribe message as a whole post.
 *
 * @param dependencies - Message deletion repository dependency.
 * @returns Use case function that deletes the target message.
 */
export function deleteTribeMessage({
  messageDeletionRepository,
}: DeleteTribeMessageDependencies) {
  return (
    command: DeleteTribeMessageCommand
  ): Promise<MessageDeletionResult> =>
    messageDeletionRepository.delete({
      messageId: command.messageId.trim(),
      tribeSlug: command.tribeSlug.trim(),
      userId: command.userId.trim(),
    });
}
