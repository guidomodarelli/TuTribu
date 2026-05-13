import type { ToggleMessagePinCommand } from "@/src/modules/messages/application/commands/tribe-message-command";
import type { MessagePinToggleResult } from "@/src/modules/messages/application/results/message-mutation-result";

export interface MessagePinRepository {
  togglePin(command: ToggleMessagePinCommand): Promise<MessagePinToggleResult>;
}
