import type {
  CreateTribeMessageCommand,
  MessagePollDraftCommand,
} from "@/src/modules/messages/application/commands/tribe-message-command";
import type { MessageCreationResult } from "@/src/modules/messages/application/results/message-mutation-result";
import type { VideoProvider } from "@/src/modules/shared/domain/value-objects/video-provider";
import type { MessageImageAttachmentDraft } from "@/src/modules/messages/domain/repositories/message-image-repository";

export type MessageVideoRepositoryDraft = {
  externalId: string;
  provider: VideoProvider;
};

export type CreateTribeMessageRepositoryCommand = Omit<
  CreateTribeMessageCommand,
  "images" | "poll" | "video"
> & {
  images?: MessageImageAttachmentDraft[];
  poll?: MessagePollDraftCommand | null;
  video?: MessageVideoRepositoryDraft | null;
};

export interface MessageCreationRepository {
  create(
    command: CreateTribeMessageRepositoryCommand
  ): Promise<MessageCreationResult>;
}
