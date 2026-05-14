import {
  MESSAGE_MUTATION_STATUS,
  MESSAGE_POLL_OPTION_TEXT,
  MESSAGE_POLL_OPTIONS,
  MESSAGE_POLL_QUESTION,
} from "@/src/modules/messages/constants/message-round";
import type {
  MessagePollDraftCommand,
  SubmitMessagePollVoteCommand,
} from "@/src/modules/messages/application/commands/tribe-message-command";
import type { MessagePollMutationResult } from "@/src/modules/messages/application/results/message-mutation-result";
import type { MessagePollRepository } from "@/src/modules/messages/domain/repositories/message-poll-repository";

type MessagePollDependencies = {
  messagePollRepository: MessagePollRepository;
};

/**
 * Normalizes a poll draft before validation and persistence.
 *
 * @param poll - Poll draft supplied by a client or route.
 * @returns Normalized poll draft with trimmed question and non-empty options.
 */
export function normalizeMessagePollDraft(
  poll: MessagePollDraftCommand
): MessagePollDraftCommand {
  return {
    allowMultipleVotes: Boolean(poll.allowMultipleVotes),
    options: poll.options.map((option) => option.trim()).filter(Boolean),
    question: poll.question.trim(),
  };
}

/**
 * Validates whether a poll draft can be persisted.
 *
 * @param poll - Normalized poll draft to validate.
 * @returns True when the poll satisfies question and option constraints.
 */
export function isValidMessagePollDraft(poll: MessagePollDraftCommand): boolean {
  const nonEmptyOptions = poll.options.filter(Boolean);
  const uniqueOptions = new Set(
    nonEmptyOptions.map((option) => option.toLocaleLowerCase())
  );

  return (
    poll.question.length >= MESSAGE_POLL_QUESTION.minLength &&
    poll.question.length <= MESSAGE_POLL_QUESTION.maxLength &&
    nonEmptyOptions.length >= MESSAGE_POLL_OPTIONS.minCount &&
    nonEmptyOptions.length <= MESSAGE_POLL_OPTIONS.maxCount &&
    uniqueOptions.size === nonEmptyOptions.length &&
    nonEmptyOptions.every(
      (option) =>
        option.length >= MESSAGE_POLL_OPTION_TEXT.minLength &&
        option.length <= MESSAGE_POLL_OPTION_TEXT.maxLength
    )
  );
}

/**
 * Builds the use case that stores a poll vote.
 *
 * @param dependencies - Message poll repository dependency.
 * @returns Use case function that validates and stores selected options.
 */
export function submitMessagePollVote({
  messagePollRepository,
}: MessagePollDependencies) {
  return async (
    command: SubmitMessagePollVoteCommand
  ): Promise<MessagePollMutationResult> => {
    const optionIds = [...new Set(command.optionIds.map((optionId) => optionId.trim()))]
      .filter(Boolean);

    if (optionIds.length === 0) {
      return { status: MESSAGE_MUTATION_STATUS.invalidPoll };
    }

    return messagePollRepository.vote({
      ...command,
      messageId: command.messageId.trim(),
      optionIds,
      tribeSlug: command.tribeSlug.trim(),
      userId: command.userId.trim(),
    });
  };
}
