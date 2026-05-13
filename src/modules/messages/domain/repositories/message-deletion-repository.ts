import type { DeleteTribeMessageCommand } from "@/src/modules/messages/application/commands/tribe-message-command";
import type { MessageDeletionResult } from "@/src/modules/messages/application/results/message-mutation-result";

/**
 * Deletes tribe messages as whole post records.
 *
 * @module message-deletion-repository
 */
export interface MessageDeletionRepository {
  /**
   * Deletes a message when the viewer can manage the whole post.
   *
   * @param command - Message deletion command with tribe, message, and user identifiers.
   * @returns Message deletion status.
   */
  delete(command: DeleteTribeMessageCommand): Promise<MessageDeletionResult>;
}
