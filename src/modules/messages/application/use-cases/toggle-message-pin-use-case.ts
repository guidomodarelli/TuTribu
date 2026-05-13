import type { ToggleMessagePinCommand } from "@/src/modules/messages/application/commands/tribe-message-command";
import type { MessagePinToggleResult } from "@/src/modules/messages/application/results/message-mutation-result";
import type { MessagePinRepository } from "@/src/modules/messages/domain/repositories/message-pin-repository";

type ToggleMessagePinDependencies = {
  messagePinRepository: MessagePinRepository;
};

export function toggleMessagePin({
  messagePinRepository,
}: ToggleMessagePinDependencies) {
  return async (
    command: ToggleMessagePinCommand
  ): Promise<MessagePinToggleResult> =>
    messagePinRepository.togglePin({
      ...command,
      tribeSlug: command.tribeSlug.trim(),
    });
}
