import type {
  SubmitMessagePollVoteCommand,
} from "@/src/modules/messages/application/commands/tribe-message-command";
import type { MessagePollMutationResult } from "@/src/modules/messages/application/results/message-mutation-result";

/**
 * Persists and mutates polls attached to tribe messages.
 *
 * @module message-poll-repository
 */
export interface MessagePollRepository {
  /**
   * Stores the viewer vote for a message poll.
   *
   * @param command - Vote command with selected option identifiers.
   * @returns Poll mutation result with the updated poll when the operation succeeds.
   */
  vote(command: SubmitMessagePollVoteCommand): Promise<MessagePollMutationResult>;
}
