import type { CreateMessageReplyCommand } from "@/src/modules/messages/application/commands/tribe-message-command";
import type { MessageReplyCreationResult } from "@/src/modules/messages/application/results/message-mutation-result";

export interface MessageReplyRepository {
  create(command: CreateMessageReplyCommand): Promise<MessageReplyCreationResult>;
}
