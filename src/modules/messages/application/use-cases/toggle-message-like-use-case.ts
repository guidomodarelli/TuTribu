import type { ToggleMessageLikeCommand } from "@/src/modules/messages/application/commands/tribe-message-command";
import type { MessageLikeToggleResult } from "@/src/modules/messages/application/results/message-mutation-result";
import type { MessageReactionRepository } from "@/src/modules/messages/domain/repositories/message-reaction-repository";

type ToggleMessageLikeDependencies = {
  messageReactionRepository: MessageReactionRepository;
};

export function toggleMessageLike({
  messageReactionRepository,
}: ToggleMessageLikeDependencies) {
  return async (
    command: ToggleMessageLikeCommand
  ): Promise<MessageLikeToggleResult> =>
    messageReactionRepository.toggle({
      ...command,
      tribeSlug: command.tribeSlug.trim(),
    });
}
