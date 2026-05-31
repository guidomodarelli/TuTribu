import type {
  MessagePollDraftCommand,
  UpdateTribeMessageContentCommand,
} from "@/src/modules/messages/application/commands/tribe-message-command";
import type { MessageContentUpdateResult } from "@/src/modules/messages/application/results/message-mutation-result";
import type { MessageImageAttachmentDraft } from "@/src/modules/messages/domain/repositories/message-image-repository";
import type { MessageVideoRepositoryDraft } from "@/src/modules/messages/domain/repositories/message-creation-repository";

export type UpdateTribeMessageContentRepositoryCommand = Omit<
  UpdateTribeMessageContentCommand,
  "images" | "poll" | "video"
> & {
  images?: MessageImageAttachmentDraft[];
  poll?: MessagePollDraftCommand;
  video?: MessageVideoRepositoryDraft | null;
};

/**
 * Updates the editable fields of a tribe message authored by the viewer.
 *
 * @module message-content-update-repository
 */
export interface MessageContentUpdateRepository {
  /**
   * Updates the editable fields of a tribe message when the viewer is the author.
   *
   * @param command - Update command with tribe, message, author, and the new editable fields.
   * @returns Update status with the persisted title, content, video and poll when applied.
   */
  updateContent(
    command: UpdateTribeMessageContentRepositoryCommand
  ): Promise<MessageContentUpdateResult>;
}
