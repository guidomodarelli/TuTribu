/**
 * @file Debounced like, pin, and poll vote handlers with optimistic updates and rollback.
 */
import { toast } from "@golfo/ui";
import type { TribeRoundMessageResult } from "@/src/modules/messages/application/results/tribe-round-result";
import {
  getOptimisticPinnedAt,
  getPersistedPollSelection,
  type MessagePollResponse,
  type PendingLikeIntent,
  type PendingPollVoteIntent,
  sortMessagesByPinnedState,
  submitJsonRequest,
  type ToggleLikeResponse,
  type TogglePinResponse,
  togglePollOptionId,
  TRIBE_ROUND_COPY,
  TRIBE_ROUND_ENDPOINT,
  TRIBE_ROUND_LIMITS,
  TRIBE_ROUND_POLL,
} from "./tribe-round-shared";
import type { TribeRoundController } from "./use-tribe-round-controller";

const clearLikeDebounceTimer = (controller: TribeRoundController, messageId: string) => {
  const timer = controller.likeDebounceTimersRef.current[messageId];

  if (!timer) {
    return;
  }

  clearTimeout(timer);
  delete controller.likeDebounceTimersRef.current[messageId];
};

const applyMessageLikeState = (controller: TribeRoundController, 
  messageId: string,
  likedByViewer: boolean,
  likeCount: number
) => {
  controller.setMessages((currentMessages) =>
    currentMessages.map((message) =>
      message.id === messageId
        ? {
            ...message,
            likedByViewer,
            likeCount,
          }
        : message
    )
  );
};

/**
 * Decides whether the pending like intent must be sent now: it waits while a
 * request is in flight and is dropped when it matches the saved state.
 *
 * @returns The intent to send, already marked in flight, or `null`.
 */
const takeLikeIntentToSend = (controller: TribeRoundController, messageId: string): PendingLikeIntent | null => {
  const pendingLikeIntent = controller.pendingLikeIntentsRef.current[messageId];

  if (!pendingLikeIntent) {
    return null;
  }

  if (pendingLikeIntent.isRequestInFlight) {
    controller.pendingLikeIntentsRef.current[messageId] = {
      ...pendingLikeIntent,
      shouldFlushAfterRequest: true,
    };
    return null;
  }

  if (
    pendingLikeIntent.intendedLikedByViewer ===
    pendingLikeIntent.baselineLikedByViewer
  ) {
    delete controller.pendingLikeIntentsRef.current[messageId];
    return null;
  }

  controller.pendingLikeIntentsRef.current[messageId] = {
    ...pendingLikeIntent,
    isRequestInFlight: true,
    shouldFlushAfterRequest: false,
  };

  return pendingLikeIntent;
};

/**
 * Applies the saved like state, or sends the viewer's newer intent on top of it.
 */
const settleLikeResponse = (controller: TribeRoundController, 
  messageId: string,
  response: { likeCount: number; likedByViewer: boolean }
) => {
  const latestPendingLikeIntent = controller.pendingLikeIntentsRef.current[messageId];

  if (!latestPendingLikeIntent) {
    applyMessageLikeState(controller, messageId, response.likedByViewer, response.likeCount);
    return;
  }

  if (latestPendingLikeIntent.intendedLikedByViewer === response.likedByViewer) {
    applyMessageLikeState(controller, messageId, response.likedByViewer, response.likeCount);
    delete controller.pendingLikeIntentsRef.current[messageId];
    return;
  }

  controller.pendingLikeIntentsRef.current[messageId] = {
    baselineLikedByViewer: response.likedByViewer,
    baselineLikeCount: response.likeCount,
    intendedLikedByViewer: latestPendingLikeIntent.intendedLikedByViewer,
    isRequestInFlight: false,
    shouldFlushAfterRequest: latestPendingLikeIntent.shouldFlushAfterRequest,
  };

  applyMessageLikeState(controller,
    messageId,
    latestPendingLikeIntent.intendedLikedByViewer,
    Math.max(
      0,
      response.likeCount +
        (latestPendingLikeIntent.intendedLikedByViewer ? 1 : -1)
    )
  );

  void flushPendingLikeIntent(controller, messageId);
};

/** Restores the saved like state after a failed request. */
const rollbackLikeIntent = (controller: TribeRoundController, messageId: string, error: unknown) => {
  const latestPendingLikeIntent = controller.pendingLikeIntentsRef.current[messageId];

  if (latestPendingLikeIntent) {
    applyMessageLikeState(controller,
      messageId,
      latestPendingLikeIntent.baselineLikedByViewer,
      latestPendingLikeIntent.baselineLikeCount
    );
    delete controller.pendingLikeIntentsRef.current[messageId];
  }

  toast.error(
    error instanceof Error ? error.message : TRIBE_ROUND_COPY.toggleLikeError
  );
};

const flushPendingLikeIntent = async (controller: TribeRoundController, messageId: string) => {
  clearLikeDebounceTimer(controller, messageId);

  const pendingLikeIntent = takeLikeIntentToSend(controller, messageId);

  if (!pendingLikeIntent) {
    return;
  }

  const actionTribeSlug = controller.tribeSlug;

  try {
    // Sending the intended state keeps a retry after a lost response from inverting the reaction.
    const response = await submitJsonRequest<ToggleLikeResponse>(
      TRIBE_ROUND_ENDPOINT.like(actionTribeSlug, messageId),
      { liked: pendingLikeIntent.intendedLikedByViewer }
    );

    if (controller.currentTribeSlugRef.current !== actionTribeSlug) {
      return;
    }

    if (
      typeof response.likedByViewer !== "boolean" ||
      typeof response.likeCount !== "number"
    ) {
      throw new TypeError(TRIBE_ROUND_COPY.toggleLikeError);
    }

    settleLikeResponse(controller, messageId, {
      likeCount: response.likeCount,
      likedByViewer: response.likedByViewer,
    });
  } catch (error) {
    if (controller.currentTribeSlugRef.current !== actionTribeSlug) {
      return;
    }

    rollbackLikeIntent(controller, messageId, error);
  }
};

const schedulePendingLikeIntentFlush = (controller: TribeRoundController, messageId: string) => {
  clearLikeDebounceTimer(controller, messageId);
  controller.likeDebounceTimersRef.current[messageId] = setTimeout(() => {
    void flushPendingLikeIntent(controller, messageId);
  }, TRIBE_ROUND_LIMITS.toggleDebounceMs);
};

export const handleToggleLike = (controller: TribeRoundController, messageId: string) => {
  controller.setMessages((currentMessages) =>
    currentMessages.map((message) => {
      if (message.id !== messageId) {
        return message;
      }

      const pendingLikeIntent = controller.pendingLikeIntentsRef.current[messageId];
      const baselineLikedByViewer =
        pendingLikeIntent?.baselineLikedByViewer ?? message.likedByViewer;
      const baselineLikeCount =
        pendingLikeIntent?.baselineLikeCount ?? message.likeCount;
      const intendedLikedByViewer = !message.likedByViewer;
      const optimisticLikeCount = Math.max(
        0,
        message.likeCount + (intendedLikedByViewer ? 1 : -1)
      );

      controller.pendingLikeIntentsRef.current[messageId] = {
        baselineLikedByViewer,
        baselineLikeCount,
        intendedLikedByViewer,
        isRequestInFlight: pendingLikeIntent?.isRequestInFlight ?? false,
        shouldFlushAfterRequest: pendingLikeIntent?.shouldFlushAfterRequest ?? false,
      };

      schedulePendingLikeIntentFlush(controller, messageId);

      return {
        ...message,
        likedByViewer: intendedLikedByViewer,
        likeCount: optimisticLikeCount,
      };
    })
  );
};

const clearPinDebounceTimer = (controller: TribeRoundController, messageId: string) => {
  const timer = controller.pinDebounceTimersRef.current[messageId];

  if (!timer) {
    return;
  }

  clearTimeout(timer);
  delete controller.pinDebounceTimersRef.current[messageId];
};

const applyMessagePinState = (controller: TribeRoundController, 
  messageId: string,
  isPinned: boolean,
  pinnedAt: string | null
) => {
  controller.setMessages((currentMessages) =>
    sortMessagesByPinnedState(
      currentMessages.map((message) =>
        message.id === messageId
          ? {
              ...message,
              isPinned,
              pinnedAt,
            }
          : message
      )
    )
  );
};

/**
 * Decides whether the pending pin intent must be sent now: it waits while a
 * request is in flight and is dropped when it matches the saved state.
 *
 * @returns Whether a request must be sent; the intent is then marked in flight.
 */
const takePinIntentToSend = (controller: TribeRoundController, messageId: string): boolean => {
  const pendingPinIntent = controller.pendingPinIntentsRef.current[messageId];

  if (!pendingPinIntent) {
    return false;
  }

  if (pendingPinIntent.isRequestInFlight) {
    controller.pendingPinIntentsRef.current[messageId] = {
      ...pendingPinIntent,
      shouldFlushAfterRequest: true,
    };
    return false;
  }

  if (pendingPinIntent.intendedIsPinned === pendingPinIntent.baselineIsPinned) {
    delete controller.pendingPinIntentsRef.current[messageId];
    return false;
  }

  controller.pendingPinIntentsRef.current[messageId] = {
    ...pendingPinIntent,
    isRequestInFlight: true,
    shouldFlushAfterRequest: false,
  };

  return true;
};

/**
 * Applies the saved pin state, or sends the viewer's newer intent on top of it.
 */
const settlePinResponse = (controller: TribeRoundController, 
  messageId: string,
  response: TogglePinResponse & { isPinned: boolean }
) => {
  const responsePinnedAt = response.pinnedAt ?? null;
  const latestPendingPinIntent = controller.pendingPinIntentsRef.current[messageId];

  if (!latestPendingPinIntent) {
    applyMessagePinState(controller, messageId, response.isPinned, responsePinnedAt);
    return;
  }

  if (latestPendingPinIntent.intendedIsPinned === response.isPinned) {
    applyMessagePinState(controller, messageId, response.isPinned, responsePinnedAt);
    delete controller.pendingPinIntentsRef.current[messageId];
    toast.success(
      response.message ??
        (response.isPinned
          ? TRIBE_ROUND_COPY.pinSuccess
          : TRIBE_ROUND_COPY.unpinSuccess)
    );
    return;
  }

  controller.pendingPinIntentsRef.current[messageId] = {
    baselineIsPinned: response.isPinned,
    baselinePinnedAt: responsePinnedAt,
    intendedIsPinned: latestPendingPinIntent.intendedIsPinned,
    isRequestInFlight: false,
    shouldFlushAfterRequest: latestPendingPinIntent.shouldFlushAfterRequest,
  };

  applyMessagePinState(controller,
    messageId,
    latestPendingPinIntent.intendedIsPinned,
    getOptimisticPinnedAt(
      latestPendingPinIntent.intendedIsPinned,
      response.isPinned,
      responsePinnedAt
    )
  );

  void flushPendingPinIntent(controller, messageId);
};

/** Restores the saved pin state after a failed request; the pin limit is a warning. */
const rollbackPinIntent = (controller: TribeRoundController, messageId: string, error: unknown) => {
  const latestPendingPinIntent = controller.pendingPinIntentsRef.current[messageId];

  if (latestPendingPinIntent) {
    applyMessagePinState(controller,
      messageId,
      latestPendingPinIntent.baselineIsPinned,
      latestPendingPinIntent.baselinePinnedAt
    );
    delete controller.pendingPinIntentsRef.current[messageId];
  }

  const errorMessage =
    error instanceof Error ? error.message : TRIBE_ROUND_COPY.togglePinError;

  if (errorMessage === TRIBE_ROUND_COPY.pinLimitReachedMessage) {
    toast.warning(errorMessage);
  } else {
    toast.error(errorMessage);
  }
};

const flushPendingPinIntent = async (controller: TribeRoundController, messageId: string) => {
  clearPinDebounceTimer(controller, messageId);

  if (!takePinIntentToSend(controller, messageId)) {
    return;
  }

  const actionTribeSlug = controller.tribeSlug;

  try {
    const response = await submitJsonRequest<TogglePinResponse>(
      TRIBE_ROUND_ENDPOINT.pin(actionTribeSlug, messageId)
    );

    if (controller.currentTribeSlugRef.current !== actionTribeSlug) {
      return;
    }

    if (typeof response.isPinned !== "boolean") {
      throw new TypeError(TRIBE_ROUND_COPY.togglePinError);
    }

    settlePinResponse(controller, messageId, { ...response, isPinned: response.isPinned });
  } catch (error) {
    if (controller.currentTribeSlugRef.current !== actionTribeSlug) {
      return;
    }

    rollbackPinIntent(controller, messageId, error);
  }
};

const schedulePendingPinIntentFlush = (controller: TribeRoundController, messageId: string) => {
  clearPinDebounceTimer(controller, messageId);
  controller.pinDebounceTimersRef.current[messageId] = setTimeout(() => {
    void flushPendingPinIntent(controller, messageId);
  }, TRIBE_ROUND_LIMITS.toggleDebounceMs);
};

export const handleTogglePin = (controller: TribeRoundController, messageId: string) => {
  controller.setMessages((currentMessages) =>
    sortMessagesByPinnedState(
      currentMessages.map((message) => {
        if (message.id !== messageId) {
          return message;
        }

        const pendingPinIntent = controller.pendingPinIntentsRef.current[messageId];
        const baselineIsPinned =
          pendingPinIntent?.baselineIsPinned ?? Boolean(message.isPinned);
        const baselinePinnedAt =
          pendingPinIntent?.baselinePinnedAt ?? message.pinnedAt ?? null;
        const intendedIsPinned = !message.isPinned;
        const optimisticPinnedAt = getOptimisticPinnedAt(
          intendedIsPinned,
          baselineIsPinned,
          baselinePinnedAt
        );

        controller.pendingPinIntentsRef.current[messageId] = {
          baselineIsPinned,
          baselinePinnedAt,
          intendedIsPinned,
          isRequestInFlight: pendingPinIntent?.isRequestInFlight ?? false,
          shouldFlushAfterRequest:
            pendingPinIntent?.shouldFlushAfterRequest ?? false,
        };

        schedulePendingPinIntentFlush(controller, messageId);

        return {
          ...message,
          isPinned: intendedIsPinned,
          pinnedAt: optimisticPinnedAt,
        };
      })
    )
  );
};

const updateMessagePoll = (controller: TribeRoundController, 
  messageId: string,
  poll: TribeRoundMessageResult["poll"] | null
) => {
  controller.setMessages((currentMessages) =>
    currentMessages.map((message) =>
      message.id === messageId
        ? {
            ...message,
            poll,
          }
        : message
    )
  );
};

const getOptimisticPollVote = (
  poll: NonNullable<TribeRoundMessageResult["poll"]>,
  optionIds: string[]
): NonNullable<TribeRoundMessageResult["poll"]> => {
  const baselineOptionIds = getPersistedPollSelection(poll);
  const optimisticOptions = poll.options.map((option) => {
    const wasSelected = baselineOptionIds.includes(option.id);
    const isSelected = optionIds.includes(option.id);
    const optimisticVoteCount = Math.max(
      0,
      option.voteCount + (isSelected ? 1 : 0) - (wasSelected ? 1 : 0)
    );

    return {
      ...option,
      percentage: 0,
      selectedByViewer: isSelected,
      voteCount: optimisticVoteCount,
    };
  });
  const optimisticTotalVoteCount = Math.max(
    0,
    poll.totalVoteCount + optionIds.length - baselineOptionIds.length
  );

  return {
    ...poll,
    options: optimisticOptions.map((option) => ({
      ...option,
      percentage:
        optimisticTotalVoteCount > 0
          ? Math.round(
              (option.voteCount / optimisticTotalVoteCount) *
                TRIBE_ROUND_POLL.percentageBase
            )
          : 0,
    })),
    totalVoteCount: optimisticTotalVoteCount,
    viewerHasVoted: optionIds.length > 0 || poll.viewerHasVoted,
  };
};

const arePollOptionIdsEqual = (
  firstOptionIds: string[],
  secondOptionIds: string[]
) => (
  firstOptionIds.length === secondOptionIds.length &&
  firstOptionIds.every((optionId) => secondOptionIds.includes(optionId))
);

const clearPollVoteDebounceTimer = (controller: TribeRoundController, messageId: string) => {
  const timer = controller.pollVoteDebounceTimersRef.current[messageId];

  if (!timer) {
    return;
  }

  clearTimeout(timer);
  delete controller.pollVoteDebounceTimersRef.current[messageId];
};

/** Shows the given selection for a poll in the composer state. */
const setPollSelection = (controller: TribeRoundController, messageId: string, optionIds: string[]) => {
  controller.setSelectedPollOptionIds((currentSelections) => ({
    ...currentSelections,
    [messageId]: optionIds,
  }));
};

/**
 * Decides whether the pending poll vote must be sent now: it waits while a
 * request is in flight, is dropped when it matches the saved vote, and an
 * empty selection restores the saved vote with a warning.
 *
 * @returns The vote to send, already marked in flight, or `null`.
 */
const takePollVoteIntentToSend = (controller: TribeRoundController, 
  messageId: string
): PendingPollVoteIntent | null => {
  const pendingPollVoteIntent = controller.pendingPollVoteIntentsRef.current[messageId];

  if (!pendingPollVoteIntent) {
    return null;
  }

  if (pendingPollVoteIntent.isRequestInFlight) {
    controller.pendingPollVoteIntentsRef.current[messageId] = {
      ...pendingPollVoteIntent,
      shouldFlushAfterRequest: true,
    };
    return null;
  }

  const baselineOptionIds = getPersistedPollSelection(
    pendingPollVoteIntent.baselinePoll
  );

  if (
    arePollOptionIdsEqual(
      pendingPollVoteIntent.intendedOptionIds,
      baselineOptionIds
    )
  ) {
    delete controller.pendingPollVoteIntentsRef.current[messageId];
    return null;
  }

  if (pendingPollVoteIntent.intendedOptionIds.length === 0) {
    updateMessagePoll(controller, messageId, pendingPollVoteIntent.baselinePoll);
    setPollSelection(controller, messageId, baselineOptionIds);
    delete controller.pendingPollVoteIntentsRef.current[messageId];
    toast.warning(TRIBE_ROUND_COPY.pollSubmitButton);
    return null;
  }

  controller.pendingPollVoteIntentsRef.current[messageId] = {
    ...pendingPollVoteIntent,
    isRequestInFlight: true,
    shouldFlushAfterRequest: false,
  };

  return pendingPollVoteIntent;
};

/**
 * Applies the saved vote, or sends the viewer's newer selection on top of it.
 */
const settlePollVoteResponse = (controller: TribeRoundController, 
  messageId: string,
  poll: NonNullable<MessagePollResponse["poll"]>
) => {
  const latestPendingPollVoteIntent =
    controller.pendingPollVoteIntentsRef.current[messageId];

  if (!latestPendingPollVoteIntent) {
    updateMessagePoll(controller, messageId, poll);
    return;
  }

  const responseOptionIds = getPersistedPollSelection(poll);

  if (
    arePollOptionIdsEqual(
      latestPendingPollVoteIntent.intendedOptionIds,
      responseOptionIds
    )
  ) {
    updateMessagePoll(controller, messageId, poll);
    setPollSelection(controller, messageId, responseOptionIds);
    delete controller.pendingPollVoteIntentsRef.current[messageId];
    return;
  }

  controller.pendingPollVoteIntentsRef.current[messageId] = {
    baselinePoll: poll,
    intendedOptionIds: latestPendingPollVoteIntent.intendedOptionIds,
    isRequestInFlight: false,
    shouldFlushAfterRequest:
      latestPendingPollVoteIntent.shouldFlushAfterRequest,
  };

  updateMessagePoll(controller,
    messageId,
    getOptimisticPollVote(
      poll,
      latestPendingPollVoteIntent.intendedOptionIds
    )
  );

  void flushPendingPollVoteIntent(controller, messageId);
};

/** Restores the saved vote after a failed request. */
const rollbackPollVoteIntent = (controller: TribeRoundController, messageId: string, error: unknown) => {
  const latestPendingPollVoteIntent =
    controller.pendingPollVoteIntentsRef.current[messageId];

  if (latestPendingPollVoteIntent) {
    updateMessagePoll(controller, messageId, latestPendingPollVoteIntent.baselinePoll);
    setPollSelection(controller,
      messageId,
      getPersistedPollSelection(latestPendingPollVoteIntent.baselinePoll)
    );
    delete controller.pendingPollVoteIntentsRef.current[messageId];
  }

  toast.error(
    error instanceof Error ? error.message : TRIBE_ROUND_COPY.pollSubmitError
  );
};

const flushPendingPollVoteIntent = async (controller: TribeRoundController, messageId: string) => {
  clearPollVoteDebounceTimer(controller, messageId);

  const pendingPollVoteIntent = takePollVoteIntentToSend(controller, messageId);

  if (!pendingPollVoteIntent) {
    return;
  }

  const actionTribeSlug = controller.tribeSlug;

  try {
    const response = await submitJsonRequest<MessagePollResponse>(
      TRIBE_ROUND_ENDPOINT.pollVotes(actionTribeSlug, messageId),
      { optionIds: pendingPollVoteIntent.intendedOptionIds }
    );

    if (controller.currentTribeSlugRef.current !== actionTribeSlug) {
      return;
    }

    if (!response.poll) {
      throw new Error(TRIBE_ROUND_COPY.pollSubmitError);
    }

    settlePollVoteResponse(controller, messageId, response.poll);
  } catch (error) {
    if (controller.currentTribeSlugRef.current !== actionTribeSlug) {
      return;
    }

    rollbackPollVoteIntent(controller, messageId, error);
  }
};

const schedulePendingPollVoteIntentFlush = (controller: TribeRoundController, messageId: string) => {
  clearPollVoteDebounceTimer(controller, messageId);
  controller.pollVoteDebounceTimersRef.current[messageId] = setTimeout(() => {
    void flushPendingPollVoteIntent(controller, messageId);
  }, TRIBE_ROUND_LIMITS.toggleDebounceMs);
};

export const handlePollOptionSelection = (controller: TribeRoundController, {
  message,
  optionId,
}: {
  message: TribeRoundMessageResult;
  optionId: string;
}) => {
  const poll = message.poll;

  if (!poll || !controller.round.viewerPermissions.canReact) {
    return;
  }

  const pendingPollVoteIntent = controller.pendingPollVoteIntentsRef.current[message.id];
  const baselinePoll = pendingPollVoteIntent?.baselinePoll ?? poll;
  const currentOptionIds =
    controller.selectedPollOptionIds[message.id] ?? getPersistedPollSelection(poll);
  const intendedOptionIds = poll.allowMultipleVotes
    ? togglePollOptionId(currentOptionIds, optionId)
    : [optionId];

  controller.setSelectedPollOptionIds((currentSelections) => ({
    ...currentSelections,
    [message.id]: intendedOptionIds,
  }));
  controller.pendingPollVoteIntentsRef.current[message.id] = {
    baselinePoll,
    intendedOptionIds,
    isRequestInFlight: pendingPollVoteIntent?.isRequestInFlight ?? false,
    shouldFlushAfterRequest:
      pendingPollVoteIntent?.shouldFlushAfterRequest ?? false,
  };
  updateMessagePoll(controller, message.id, getOptimisticPollVote(poll, intendedOptionIds));
  schedulePendingPollVoteIntentFlush(controller, message.id);
};
