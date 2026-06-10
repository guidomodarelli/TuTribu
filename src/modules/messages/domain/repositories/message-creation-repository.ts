import type {
  CreateTribeMessageCommand,
  MessagePollDraftCommand,
} from "@/src/modules/messages/application/commands/tribe-message-command";
import type { MessageCreationResult } from "@/src/modules/messages/application/results/message-mutation-result";
import type { VideoProvider } from "@/src/modules/shared/domain/value-objects/video-provider";
import type { MessageImageAttachmentDraft } from "@/src/modules/messages/domain/repositories/message-image-repository";
import type { MessageFileAttachmentDraft } from "@/src/modules/messages/domain/repositories/message-file-repository";

export type MessageVideoRepositoryDraft = {
  externalId: string;
  provider: VideoProvider;
  sortOrder: number;
};

export type CreateTribeMessageRepositoryCommand = Omit<
  CreateTribeMessageCommand,
  "files" | "media" | "poll"
> & {
  files?: MessageFileAttachmentDraft[];
  images?: MessageImageAttachmentDraft[];
  poll?: MessagePollDraftCommand | null;
  videos?: MessageVideoRepositoryDraft[];
};

export interface MessageCreationRepository {
  create(
    command: CreateTribeMessageRepositoryCommand
  ): Promise<MessageCreationResult>;
}
