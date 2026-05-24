import type { UpdateTribeMessageCreatedAtCommand } from "@/src/modules/messages/application/commands/tribe-message-command";
import type { MessageCreatedAtUpdateResult } from "@/src/modules/messages/application/results/message-mutation-result";

export interface MessageCreatedAtUpdateRepository {
  updateCreatedAt(
    command: UpdateTribeMessageCreatedAtCommand
  ): Promise<MessageCreatedAtUpdateResult>;
}
