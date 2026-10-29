/**
 * @file Message edit submission and optimistic message creation handlers.
 */
import type { SubmitEvent } from "react";
import { toast } from "@golfo/ui";
import { MESSAGE_MEDIA_KIND } from "@/src/modules/messages/constants/message-round";
import type { TribeRoundMessageResult } from "@/src/modules/messages/application/results/tribe-round-result";
import {
  applyMessageContentUpdate,
  buildCreateMessagePayload,
  buildOptimisticMessageFiles,
  buildOptimisticMessageMedia,
  buildPollPayload,
  type CreateMessageDraftSnapshot,
  type CreateMessageResponse,
  findViewerTribeAuthor,
  getBlobImagePreviewUrls,
  getCreatedMessageWithStableImages,
  getImageDraftsFromMediaDrafts,
  getMessagesAfterOptimisticCreationFailure,
  getMessagesAfterVisibleMessageCreation,
  getMissingMessageRequirements,
  getPaginationAfterVisibleMessageCreation,
  hasMessageFileChanges,
  type PendingCreateMessageIntent,
  revokeMessageImageDraftPreviewUrls,
  shouldKeepOptimisticImagePreviewUrls,
  submitJsonRequest,
  TRIBE_ROUND_COPY,
  TRIBE_ROUND_ENDPOINT,
  TRIBE_ROUND_FORM,
  TRIBE_ROUND_OPTIMISTIC,
  TRIBE_ROUND_RESET_KEY,
  type TribeRoundVisibleMessageResult,
  type UpdateMessageContentResponse,
} from "./tribe-round-shared";
import { isCurrentAction, type TribeRoundController } from "./use-tribe-round-controller";
import {
  buildMessageFilesPayload,
  buildMessageMediaPayload,
  cleanupPersistingMessageFiles,
  cleanupPersistingMessageImages,
  clearPersistingMessageFiles,
  clearPersistingMessageImages,
  getPersistingTransientMessageFileAssetIds,
  getPersistingTransientMessageImageAssetIds,
  markMessageFilesAsPersisting,
  markMessageImagesAsPersisting,
  removeTransientMessageFileDraftsFromComposer,
  removeTransientMessageImageDraftsFromComposer,
  reportComposerValidationErrors,
  resetMessageComposer,
} from "./composer-draft-actions";

/** Shows the saved edit and closes the composer. */
const settleEditedMessage = (controller: TribeRoundController, {
  messageId,
  persistingFileAssetIds,
  persistingImageAssetIds,
  response,
  submitted,
}: {
  messageId: string;
  persistingFileAssetIds: string[];
  persistingImageAssetIds: string[];
  response: UpdateMessageContentResponse;
  submitted: { content: string; title: string };
}) => {
  controller.setMessages((currentMessages) =>
    currentMessages.map((message) =>
      message.id === messageId
        ? applyMessageContentUpdate(message, response, submitted)
        : message
    )
  );
  resetMessageComposer(controller);
  clearPersistingMessageImages(controller, persistingImageAssetIds);
  clearPersistingMessageFiles(controller, persistingFileAssetIds);
  controller.setIsMessageComposerOpen(false);
  toast.success(response.message ?? TRIBE_ROUND_COPY.messageEditSuccess);
};

const submitEditMessage = async (controller: TribeRoundController, {
  content,
  messageId,
  title,
}: { content: string; messageId: string; title: string }) => {
  const editingMessage = controller.messages.find((message) => message.id === messageId);
  const mediaPayload = buildMessageMediaPayload(controller);
  const filesPayload = buildMessageFilesPayload(controller);
  const hasFileDraftChanges = hasMessageFileChanges(editingMessage, filesPayload);
  // A poll can only change while nobody has voted.
  const pollPayload =
    editingMessage?.poll?.totalVoteCount === 0 && controller.isPollComposerEnabled
      ? buildPollPayload(controller.pollAllowsMultipleVotes, controller.pollOptions)
      : undefined;
  const missingRequirements = getMissingMessageRequirements({
    channelId: editingMessage?.channel.id ?? controller.selectedChannelId,
    content,
    mediaDrafts: controller.mediaDrafts,
    poll: pollPayload
      ? {
          enabled: true,
          options: controller.pollOptions,
        }
      : undefined,
    title,
  });

  if (reportComposerValidationErrors(controller, missingRequirements)) {
    return;
  }

  const actionTribeSlug = controller.tribeSlug;
  const actionToken = controller.currentActionTokenRef.current + 1;
  const persistingImageAssetIds = getPersistingTransientMessageImageAssetIds(controller);
  const persistingFileAssetIds = getPersistingTransientMessageFileAssetIds(controller);

  controller.currentActionTokenRef.current = actionToken;
  markMessageImagesAsPersisting(controller, persistingImageAssetIds);
  markMessageFilesAsPersisting(controller, persistingFileAssetIds);
  controller.setPendingActionId(messageId);

  try {
    const response = await submitJsonRequest<UpdateMessageContentResponse>(
      TRIBE_ROUND_ENDPOINT.messageItem(actionTribeSlug, messageId),
      {
        content,
        ...(hasFileDraftChanges ? { files: filesPayload } : {}),
        media: mediaPayload,
        ...(pollPayload ? { poll: pollPayload } : {}),
        title,
      },
      undefined,
      TRIBE_ROUND_FORM.patchMethod
    );

    if (!isCurrentAction(controller, actionToken, actionTribeSlug)) {
      return;
    }

    settleEditedMessage(controller, {
      messageId,
      persistingFileAssetIds,
      persistingImageAssetIds,
      response,
      submitted: { content, title },
    });
  } catch (error) {
    cleanupPersistingMessageImages(controller, persistingImageAssetIds, actionTribeSlug);
    cleanupPersistingMessageFiles(controller, persistingFileAssetIds, actionTribeSlug);
    if (!isCurrentAction(controller, actionToken, actionTribeSlug)) {
      return;
    }

    removeTransientMessageImageDraftsFromComposer(controller);
    removeTransientMessageFileDraftsFromComposer(controller);
    toast.error(
      error instanceof Error
        ? error.message
        : TRIBE_ROUND_COPY.messageEditError
    );
  } finally {
    if (isCurrentAction(controller, actionToken, actionTribeSlug)) {
      controller.setPendingActionId(null);
    }
  }
};

const createMessageDraftSnapshot = (controller: TribeRoundController, {
  content,
  title,
}: {
  content: string;
  title: string;
}): CreateMessageDraftSnapshot => {
  const editorState = controller.messageEditor.getDisplayState();

  return {
    content,
    mediaDrafts: controller.mediaDrafts.map((mediaDraft) => ({ ...mediaDraft })),
    isPollComposerEnabled: controller.isPollComposerEnabled,
    messageContent: editorState.content,
    messageContentLinks: editorState.links,
    pollAllowsMultipleVotes: controller.pollAllowsMultipleVotes,
    pollOptions: [...controller.pollOptions],
    selectedChannelId: controller.selectedChannelId,
    title,
  };
};

const restoreCreateMessageDraft = (controller: TribeRoundController, draft: CreateMessageDraftSnapshot) => {
  controller.setMessageTitle(draft.title);
  controller.messageEditor.loadFromDisplay({
    content: draft.messageContent,
    links: draft.messageContentLinks,
  });
  controller.setIsPollComposerEnabled(draft.isPollComposerEnabled);
  controller.setPollOptions([...draft.pollOptions]);
  controller.setPollAllowsMultipleVotes(draft.pollAllowsMultipleVotes);
  const restoredMediaDrafts = draft.mediaDrafts.map((mediaDraft) => ({
    ...mediaDraft,
  }));
  controller.setMediaDrafts(restoredMediaDrafts);
  controller.currentMessageImageDraftsRef.current =
    getImageDraftsFromMediaDrafts(restoredMediaDrafts);
  controller.setSelectedChannelId(draft.selectedChannelId);
  controller.setMessageComposerErrors([]);
  controller.setEditingMessageId(null);
};

const buildOptimisticPoll = (controller: TribeRoundController, 
  optimisticMessageId: string
): TribeRoundMessageResult["poll"] => {
  if (!controller.isPollComposerEnabled) {
    return null;
  }

  const options = controller.pollOptions.map((option) => option.trim()).filter(Boolean);

  return {
    allowMultipleVotes: controller.pollAllowsMultipleVotes,
    id: TRIBE_ROUND_OPTIMISTIC.pollIdPrefix + optimisticMessageId,
    options: options.map((option, optionIndex) => ({
      id:
        TRIBE_ROUND_OPTIMISTIC.pollOptionIdPrefix +
        optimisticMessageId +
        TRIBE_ROUND_RESET_KEY.fieldSeparator +
        String(optionIndex),
      percentage: 0,
      selectedByViewer: false,
      text: option,
      voteCount: 0,
    })),
    totalVoteCount: 0,
    viewerHasVoted: false,
  };
};

const buildOptimisticMessage = (controller: TribeRoundController, {
  content,
  optimisticMessageId,
  title,
}: {
  content: string;
  optimisticMessageId: string;
  title: string;
}): TribeRoundVisibleMessageResult | null => {
  if (!controller.selectedChannel) {
    return null;
  }

  const viewerTribeAuthor = findViewerTribeAuthor(
    controller.messages,
    controller.authenticatedMember.id
  );
  const optimisticMedia = buildOptimisticMessageMedia(
    controller.mediaDrafts,
    optimisticMessageId
  );
  const optimisticFiles = buildOptimisticMessageFiles(controller.fileDrafts);

  return {
    author: {
      avatarFallback:
        viewerTribeAuthor?.avatarFallback ?? controller.authenticatedMember.avatarFallback,
      id: controller.authenticatedMember.id,
      image: viewerTribeAuthor?.image ?? controller.authenticatedMember.image,
      name: viewerTribeAuthor?.name ?? controller.authenticatedMember.name,
      role:
        viewerTribeAuthor?.role ??
        (controller.authenticatedMember.role as TribeRoundMessageResult["author"]["role"]),
    },
    channel: controller.selectedChannel,
    content,
    createdAt: new Date().toISOString(),
    id: optimisticMessageId,
    ...(optimisticFiles.length > 0 ? { files: optimisticFiles } : {}),
    ...(optimisticMedia.length > 0 ? { media: optimisticMedia } : {}),
    likedByViewer: false,
    likeCount: 0,
    replyCount: 0,
    isPending: true,
    permissions: {
      canDelete: false,
      canEdit: false,
    },
    poll: buildOptimisticPoll(controller, optimisticMessageId),
    replies: [],
    title,
  };
};

const replaceOptimisticMessage = (controller: TribeRoundController, {
  createdMessage,
  optimisticMessage,
  optimisticMessageId,
  roundViewVersion,
}: {
  createdMessage: TribeRoundMessageResult;
  optimisticMessage: TribeRoundVisibleMessageResult | null;
  optimisticMessageId: string;
  /** {@link roundViewVersionRef} when the creation started. */
  roundViewVersion: number;
}) => {
  if (controller.roundViewVersionRef.current !== roundViewVersion) {
    // Another round page replaced the one the message was composed on: that
    // page came from the server, so only drop a leftover optimistic copy.
    controller.setMessages((currentMessages) =>
      currentMessages.filter((message) => message.id !== optimisticMessageId)
    );
    return;
  }

  const visibleCreatedMessage = getCreatedMessageWithStableImages({
    createdMessage,
    optimisticMessage,
  });

  // Keep rendering the confirmed message under its optimistic key so the
  // list swaps it in place instead of playing an exit and a new entrance.
  controller.setOptimisticRenderKeys((currentKeys) => ({
    ...currentKeys,
    [visibleCreatedMessage.id]: optimisticMessageId,
  }));

  controller.setMessages((currentMessages) => {
    const messagesWithoutOptimistic = currentMessages.filter(
      (message) =>
        message.id !== optimisticMessageId &&
        message.id !== visibleCreatedMessage.id
    );

    if (
      !controller.round.activeChannelId ||
      visibleCreatedMessage.channel.id === controller.round.activeChannelId
    ) {
      return getMessagesAfterVisibleMessageCreation({
        createdMessage: visibleCreatedMessage,
        currentMessages: messagesWithoutOptimistic,
        pagination: controller.visiblePagination,
      });
    }

    return messagesWithoutOptimistic;
  });
};

/**
 * Starts a publication: shows the optimistic message when it belongs to the
 * current view, marks its attachments as persisting and makes it the
 * current action.
 *
 * @returns The attempt facts needed to settle or roll it back.
 */
const startCreateMessageAttempt = (controller: TribeRoundController, {
  content,
  title,
}: {
  content: string;
  title: string;
}) => {
  const actionTribeSlug = controller.tribeSlug;
  const actionToken = controller.currentActionTokenRef.current + 1;
  const persistingImageAssetIds = getPersistingTransientMessageImageAssetIds(controller);
  const persistingFileAssetIds = getPersistingTransientMessageFileAssetIds(controller);
  controller.optimisticMessageCounterRef.current += 1;
  const optimisticMessageId =
    TRIBE_ROUND_OPTIMISTIC.messageIdPrefix +
    String(controller.optimisticMessageCounterRef.current);
  const draftSnapshot = createMessageDraftSnapshot(controller, { content, title });
  const optimisticMessage = buildOptimisticMessage(controller, {
    content,
    optimisticMessageId,
    title,
  });
  const roundViewVersion = controller.roundViewVersionRef.current;
  const createMessageIntent: PendingCreateMessageIntent = {
    baselineMessages: controller.messages,
    baselinePagination: controller.visiblePagination,
    draft: draftSnapshot,
    optimisticMessageId,
  };
  const shouldShowOptimisticMessageInCurrentView = Boolean(
    optimisticMessage &&
      (!controller.round.activeChannelId ||
        optimisticMessage.channel.id === controller.round.activeChannelId) &&
      controller.visiblePagination.currentPage === 1
  );

  controller.currentActionTokenRef.current = actionToken;
  controller.pendingCreateMessageIntentRef.current = createMessageIntent;
  markMessageImagesAsPersisting(controller, persistingImageAssetIds);
  markMessageFilesAsPersisting(controller, persistingFileAssetIds);
  if (optimisticMessage && shouldShowOptimisticMessageInCurrentView) {
    controller.setVisiblePagination((currentPagination) =>
      getPaginationAfterVisibleMessageCreation({
        currentMessageCount: controller.messages.length,
        pagination: currentPagination,
      })
    );
    controller.setMessages((currentMessages) =>
      getMessagesAfterVisibleMessageCreation({
        createdMessage: optimisticMessage,
        currentMessages,
        pagination: controller.visiblePagination,
      })
    );
    resetMessageComposer(controller, { shouldRevokeImagePreviewUrls: false });
    controller.setIsMessageComposerOpen(false);
  }
  controller.setPendingActionId(TRIBE_ROUND_COPY.messageButton);

  return {
    actionToken,
    actionTribeSlug,
    createMessageIntent,
    draftSnapshot,
    optimisticMessage,
    optimisticMessageId,
    persistingFileAssetIds,
    persistingImageAssetIds,
    roundViewVersion,
    shouldShowOptimisticMessageInCurrentView,
  };
};

type CreateMessageAttempt = ReturnType<typeof startCreateMessageAttempt>;

/**
 * Reuses the key of an identical pending publication, so one whose response
 * was lost is not duplicated; any change to the text, poll or attachments
 * makes it a new publication with a new key.
 *
 * @returns The client request id for this payload.
 */
const resolveCreateMessageClientRequestId = (controller: TribeRoundController, 
  createMessagePayload: Record<string, unknown>
): string => {
  const createMessageFingerprint = JSON.stringify(createMessagePayload);
  const clientRequestId =
    controller.pendingCreateMessageKeyRef.current?.fingerprint === createMessageFingerprint
      ? controller.pendingCreateMessageKeyRef.current.key
      : crypto.randomUUID();
  controller.pendingCreateMessageKeyRef.current = { fingerprint: createMessageFingerprint, key: clientRequestId };

  return clientRequestId;
};

/** Releases the attachments and the draft of a settled publication. */
const finishCreateMessageAttempt = (controller: TribeRoundController, attempt: CreateMessageAttempt) => {
  clearPersistingMessageImages(controller, attempt.persistingImageAssetIds);
  clearPersistingMessageFiles(controller, attempt.persistingFileAssetIds);
  controller.pendingCreateMessageIntentRef.current = null;
  if (!attempt.shouldShowOptimisticMessageInCurrentView) {
    resetMessageComposer(controller, { shouldRevokeImagePreviewUrls: false });
    controller.setIsMessageComposerOpen(false);
  }
};

/**
 * Hands the blob previews of a publication to the round, which revokes each
 * one once no message or draft shows it anymore.
 */
const retainPublishedImagePreviewUrls = (controller: TribeRoundController, attempt: CreateMessageAttempt) => {
  getBlobImagePreviewUrls(getImageDraftsFromMediaDrafts(attempt.draftSnapshot.mediaDrafts)).forEach((previewUrl) =>
    controller.retainedMessageImagePreviewUrlsRef.current.add(previewUrl)
  );
};

/** Replaces the optimistic copy with the created message. */
const settleCreatedMessage = (controller: TribeRoundController, 
  attempt: CreateMessageAttempt,
  createdMessage: TribeRoundMessageResult
) => {
  controller.pendingCreateMessageKeyRef.current = null;

  replaceOptimisticMessage(controller, {
    createdMessage,
    optimisticMessage: attempt.optimisticMessage,
    optimisticMessageId: attempt.optimisticMessageId,
    roundViewVersion: attempt.roundViewVersion,
  });
  if (
    shouldKeepOptimisticImagePreviewUrls({
      createdMessage,
      optimisticMessage: attempt.optimisticMessage,
    })
  ) {
    retainPublishedImagePreviewUrls(controller, attempt);
  } else {
    revokeMessageImageDraftPreviewUrls(
      getImageDraftsFromMediaDrafts(attempt.draftSnapshot.mediaDrafts)
    );
  }
  finishCreateMessageAttempt(controller, attempt);
  toast.success(TRIBE_ROUND_COPY.submitMessageSuccess);
};

/** Drops the optimistic copy and gives the draft back to the composer. */
const rollbackCreateMessageAttempt = (controller: TribeRoundController, 
  attempt: CreateMessageAttempt,
  error: unknown
) => {
  const { actionTribeSlug, createMessageIntent } = attempt;
  const cleanupPersistingAttachments = () => {
    cleanupPersistingMessageImages(controller, attempt.persistingImageAssetIds, actionTribeSlug);
    cleanupPersistingMessageFiles(controller, attempt.persistingFileAssetIds, actionTribeSlug);
  };

  if (!isCurrentAction(controller, attempt.actionToken, actionTribeSlug)) {
    cleanupPersistingAttachments();
    return;
  }

  // The rollback snapshot belongs to the page the message was composed on;
  // after an in-place page change only the optimistic copy is dropped.
  if (controller.roundViewVersionRef.current === attempt.roundViewVersion) {
    controller.setMessages((currentMessages) =>
      getMessagesAfterOptimisticCreationFailure({
        baselineMessages: createMessageIntent.baselineMessages,
        currentMessages,
        optimisticMessageId: createMessageIntent.optimisticMessageId,
      })
    );
    controller.setVisiblePagination(createMessageIntent.baselinePagination);
  } else {
    controller.setMessages((currentMessages) =>
      currentMessages.filter(
        (message) => message.id !== createMessageIntent.optimisticMessageId
      )
    );
  }
  cleanupPersistingAttachments();
  controller.pendingCreateMessageIntentRef.current = null;
  revokeMessageImageDraftPreviewUrls(
    getImageDraftsFromMediaDrafts(createMessageIntent.draft.mediaDrafts)
  );
  restoreCreateMessageDraft(controller, {
    ...createMessageIntent.draft,
    mediaDrafts: createMessageIntent.draft.mediaDrafts.filter(
      (mediaDraft) => mediaDraft.kind === MESSAGE_MEDIA_KIND.video
    ),
  });
  // Like the image drafts above, transient file drafts cannot be restored:
  // their draft assets were just cleaned up server-side.
  removeTransientMessageFileDraftsFromComposer(controller);
  controller.setIsMessageComposerOpen(true);
  toast.error(
    error instanceof Error ? error.message : TRIBE_ROUND_COPY.submitMessageError
  );
};

export const handleCreateMessage = async (controller: TribeRoundController, event: SubmitEvent<HTMLFormElement>) => {
  event.preventDefault();
  const title = controller.messageTitle.trim();
  const displayContent = controller.messageEditor.content.trim();
  const content = controller.messageEditor.serialize().trim();
  const mediaPayload = buildMessageMediaPayload(controller);
  const filesPayload = buildMessageFilesPayload(controller);

  if (controller.editingMessageId) {
    await submitEditMessage(controller, {
      content,
      messageId: controller.editingMessageId,
      title,
    });
    return;
  }

  const missingRequirements = getMissingMessageRequirements({
    channelId: controller.selectedChannelId,
    content: displayContent,
    mediaDrafts: controller.mediaDrafts,
    poll: {
      enabled: controller.isPollComposerEnabled,
      options: controller.pollOptions,
    },
    title,
  });

  if (reportComposerValidationErrors(controller, missingRequirements)) {
    return;
  }

  const attempt = startCreateMessageAttempt(controller, { content, title });
  const { actionToken, actionTribeSlug } = attempt;
  const createMessagePayload = buildCreateMessagePayload({
    channelId: controller.selectedChannelId,
    content,
    filesPayload,
    mediaPayload,
    poll: controller.isPollComposerEnabled
      ? { allowMultipleVotes: controller.pollAllowsMultipleVotes, options: controller.pollOptions }
      : null,
    title,
  });
  const clientRequestId = resolveCreateMessageClientRequestId(controller, createMessagePayload);

  const submitCreateMessage = () =>
    submitJsonRequest<CreateMessageResponse>(
      TRIBE_ROUND_ENDPOINT.message(actionTribeSlug),
      { ...createMessagePayload, clientRequestId }
    );

  try {
    // A network failure leaves the outcome unknown: before rolling back (which also cleans transient attachments and
    // changes the draft), reconcile it once by sending the same publication with the same key. The server either
    // replays the stored one or creates it for the first time, so this retry can never duplicate it.
    const response = await submitCreateMessage().catch((error: unknown) => {
      if (error instanceof TypeError && isCurrentAction(controller, actionToken, actionTribeSlug)) {
        return submitCreateMessage();
      }

      throw error;
    });

    if (!isCurrentAction(controller, actionToken, actionTribeSlug)) {
      return;
    }

    if (response.replayed) {
      // The earlier attempt was stored: keep the optimistic copy until the current page reloads in place with the stored
      // message, so the feed never flashes an empty state and a draft started meanwhile is not lost to a remount. The
      // action stays pending until that reload settles, so a newer publication cannot be erased by its older snapshot.
      controller.pendingCreateMessageKeyRef.current = null;
      // The optimistic copy keeps showing its previews until the reload replaces it.
      retainPublishedImagePreviewUrls(controller, attempt);
      finishCreateMessageAttempt(controller, attempt);
      toast.success(response.message ?? TRIBE_ROUND_COPY.submitMessageReplayed);
      await controller.roundNavigation.reloadCurrentPage();
      return;
    }

    if (!response.tribeMessage) {
      throw new Error(TRIBE_ROUND_COPY.submitMessageError);
    }

    settleCreatedMessage(controller, attempt, response.tribeMessage);
  } catch (error) {
    rollbackCreateMessageAttempt(controller, attempt, error);
  } finally {
    if (isCurrentAction(controller, actionToken, actionTribeSlug)) {
      controller.setPendingActionId(null);
    }
  }
};
