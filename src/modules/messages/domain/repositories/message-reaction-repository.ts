import type { ToggleMessageLikeCommand } from "@/src/modules/messages/application/commands/tribe-message-command";
import type { MessageLikeToggleResult } from "@/src/modules/messages/application/results/message-mutation-result";

export interface MessageReactionRepository {
  toggle(command: ToggleMessageLikeCommand): Promise<MessageLikeToggleResult>;
}
