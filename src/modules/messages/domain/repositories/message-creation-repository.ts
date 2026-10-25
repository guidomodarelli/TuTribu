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

/** Identifies a publication by the idempotency key its author's client sent. */
export type MessagePublicationKeyQuery = {
  authorId: string;
  clientRequestId: string;
  tribeSlug: string;
};

export interface MessageCreationRepository {
  create(
    command: CreateTribeMessageRepositoryCommand
  ): Promise<MessageCreationResult>;
  /**
   * Finds the publication an earlier attempt with the same key stored, so a retry is answered before any attachment is
   * prepared or cleaned up.
   *
   * @returns The stored message id, or `null` when the key was never stored for this author and tribe.
   */
  findPublicationByClientRequestId?(query: MessagePublicationKeyQuery): Promise<string | null>;
}
