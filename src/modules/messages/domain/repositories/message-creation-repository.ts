import type { CreateTribeMessageCommand } from "@/src/modules/messages/application/commands/tribe-message-command";
import type { MessageCreationResult } from "@/src/modules/messages/application/results/message-mutation-result";

export interface MessageCreationRepository {
  create(command: CreateTribeMessageCommand): Promise<MessageCreationResult>;
}
