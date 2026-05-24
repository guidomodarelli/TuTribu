import type {
  CreateTribeMessageCommand,
  MessagePollDraftCommand,
} from "@/src/modules/messages/application/commands/tribe-message-command";
import type { MessageCreationResult } from "@/src/modules/messages/application/results/message-mutation-result";
import type { VideoProvider } from "@/src/modules/shared/domain/value-objects/video-provider";

export type MessageVideoRepositoryDraft = {
  externalId: string;
  provider: VideoProvider;
};

export type CreateTribeMessageRepositoryCommand = Omit<
  CreateTribeMessageCommand,
  "poll" | "video"
> & {
  poll?: MessagePollDraftCommand | null;
  video?: MessageVideoRepositoryDraft | null;
};

export interface MessageCreationRepository {
  create(
    command: CreateTribeMessageRepositoryCommand
  ): Promise<MessageCreationResult>;
}
