/**
 * @file Round navigation, reply, message edit/delete, details thread, and media carousel handlers.
 */
import type { KeyboardEvent, MouseEvent, SubmitEvent } from "react";
import { type PaginationClickEvent, toast } from "@golfo/ui";
import { isInPageLinkClick } from "@/lib/plain-link-click";
import { MESSAGE_MEDIA_KIND } from "@/src/modules/messages/constants/message-round";
import type { TribeRoundMessageResult, TribeRoundReplyResult, TribeRoundResult } from "@/src/modules/messages/application/results/tribe-round-result";
import {
  type ApiErrorResponse,
  appendOptimisticReply,
  buildEditableVideoUrl,
  buildOptimisticReply,
  COMPOSER_FILE_UPLOAD_STATUS,
  COMPOSER_IMAGE_UPLOAD_STATUS,
  type ComposerFileDraft,
  type ComposerMediaDraft,
  type CreateReplyResponse,
  getImageDraftsFromMediaDrafts,
  isPendingMessage,
  parseDateTimeLocalInputValue,
  removeMessageReply,
  replaceMessageReply,
  retryFailedReplyLoad,
  sortMessagesByPinnedState,
  submitJsonRequest,
  toDateTimeLocalInputValue,
  TRIBE_ROUND_CAROUSEL_KEY,
  TRIBE_ROUND_COPY,
  TRIBE_ROUND_ENDPOINT,
  TRIBE_ROUND_FORM,
  TRIBE_ROUND_NAVIGATION_SCROLL,
  TRIBE_ROUND_OPTIMISTIC,
  TRIBE_ROUND_REPLY_LOAD_STATUS,
  type UpdateCreatedAtResponse,
} from "./tribe-round-shared";
import { isCurrentAction, type TribeRoundController } from "./use-tribe-round-controller";
import { resetMessageComposer } from "./composer-draft-actions";

/**
 * After a page loaded in place, brings the top of the round back into view
 * when the viewer scrolled past it (for example, pressing "Siguiente" at the
 * end of a long page). It runs on the next frame so the new list is laid
 * out, and jumps instead of scrolling smoothly under reduced motion.
 */
const revealRoundSection = (controller: TribeRoundController) => {
  window.requestAnimationFrame(() => {
    const roundSection = controller.roundSectionRef.current;

    if (!roundSection || roundSection.getBoundingClientRect().top >= 0) {
      return;
    }

    const prefersReducedMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia(TRIBE_ROUND_NAVIGATION_SCROLL.reducedMotionQuery).matches;

    roundSection.scrollIntoView({
      behavior: prefersReducedMotion
        ? TRIBE_ROUND_NAVIGATION_SCROLL.instantBehavior
        : TRIBE_ROUND_NAVIGATION_SCROLL.smoothBehavior,
      block: TRIBE_ROUND_NAVIGATION_SCROLL.block,
    });
  });
};

/**
 * Shows a round page loaded in place. The page's list, pagination, channel
 * filter, and permissions replace the previous ones; what the viewer is
 * writing (composer, reply drafts, poll choices) stays. Overlays tied to a
 * message that is not on the new page (thread, gallery, delete or date
 * dialogs) close, since their message is no longer visible behind them.
 */
export const applyNavigatedRound = (controller: TribeRoundController, nextRound: TribeRoundResult) => {
  const nextMessageIds = new Set(nextRound.messages.map((message) => message.id));

  controller.roundViewVersionRef.current += 1;
  controller.setRound(nextRound);
  controller.setMessages(nextRound.messages);
  controller.setVisiblePagination(nextRound.pagination);

  if (controller.selectedMessageId && !nextMessageIds.has(controller.selectedMessageId)) {
    controller.setIsMessageDetailsOpen(false);
    controller.setSelectedMessageId(null);
  }

  if (controller.activeImageCarousel && !nextMessageIds.has(controller.activeImageCarousel.messageId)) {
    handleImageCarouselOpenChange(controller, false);
  }

  if (
    controller.messagePendingDeletion &&
    !controller.isBusy &&
    !nextMessageIds.has(controller.messagePendingDeletion.id)
  ) {
    controller.setMessagePendingDeletion(null);
  }

  if (
    controller.editingCreatedAtMessageId &&
    !controller.isBusy &&
    !nextMessageIds.has(controller.editingCreatedAtMessageId)
  ) {
    closeEditCreatedAtDialog(controller);
  }

  revealRoundSection(controller);
};

/**
 * Loads another round page in place when a pagination link gets a plain
 * click; modified clicks keep the real link so it can open in a new tab.
 *
 * @param page - Requested round page.
 * @param event - Click on the pagination link that requested the page.
 */
export const handleRoundPageChange = (controller: TribeRoundController, 
  page: number,
  event: PaginationClickEvent
) => {
  if (!isInPageLinkClick(event)) {
    return;
  }

  event.preventDefault();
  void controller.roundNavigation.navigateToLocation({
    channelSlug: controller.activeChannel?.slug ?? null,
    page,
  });
};

/** Swaps the optimistic reply for the saved one, keeping its render key. */
const settleCreatedReply = (controller: TribeRoundController, 
  messageId: string,
  optimisticReplyId: string,
  createdReply: TribeRoundReplyResult
) => {
  const createdReplyId = createdReply.id;

  controller.setOptimisticRenderKeys((currentKeys) => ({
    ...currentKeys,
    [createdReplyId]: optimisticReplyId,
  }));
  controller.setMessages((currentMessages) =>
    currentMessages.map((message) =>
      message.id === messageId
        ? replaceMessageReply(message, optimisticReplyId, createdReply)
        : message
    )
  );
  toast.success(TRIBE_ROUND_COPY.submitReplySuccess);
};

/** Removes the failed reply and gives its text back to the reply input. */
const rollbackFailedReply = (controller: TribeRoundController, {
  content,
  error,
  messageId,
  optimisticReplyId,
}: {
  content: string;
  error: unknown;
  messageId: string;
  optimisticReplyId: string;
}) => {
  toast.error(
    error instanceof Error
      ? error.message
      : TRIBE_ROUND_COPY.submitReplyError
  );
  controller.setMessages((currentMessages) =>
    currentMessages.map((message) =>
      message.id === messageId
        ? removeMessageReply(message, optimisticReplyId)
        : message
    )
  );
  // Restore the failed reply unless the viewer already started a new one.
  controller.setReplyDrafts((currentDrafts) =>
    currentDrafts[messageId]
      ? currentDrafts
      : {
          ...currentDrafts,
          [messageId]: content,
        }
  );
};

export const handleCreateReply = async (controller: TribeRoundController, 
  event: SubmitEvent<HTMLFormElement>,
  messageId: string
) => {
  event.preventDefault();
  const content = (controller.replyDrafts[messageId] ?? "").trim();

  // The reply input stays editable while another action is in flight so the
  // viewer keeps focus and can draft the next reply; only sending waits.
  if (controller.isBusy) {
    return;
  }

  if (!content) {
    toast.warning(TRIBE_ROUND_COPY.replyPlaceholder);
    return;
  }

  const actionTribeSlug = controller.tribeSlug;
  const actionToken = controller.currentActionTokenRef.current + 1;
  controller.optimisticReplyCounterRef.current += 1;
  const optimisticReplyId =
    TRIBE_ROUND_OPTIMISTIC.replyIdPrefix +
    String(controller.optimisticReplyCounterRef.current);
  const optimisticReply = buildOptimisticReply({
    authenticatedMember: controller.authenticatedMember,
    content,
    messages: controller.messages,
    optimisticReplyId,
  });

  controller.currentActionTokenRef.current = actionToken;
  controller.setPendingActionId(messageId);
  controller.setMessages((currentMessages) =>
    currentMessages.map((message) =>
      message.id === messageId
        ? appendOptimisticReply(message, optimisticReply)
        : message
    )
  );
  controller.setReplyLoadStatuses((currentStatuses) =>
    retryFailedReplyLoad(currentStatuses, messageId)
  );
  controller.setReplyDrafts((currentDrafts) => ({
    ...currentDrafts,
    [messageId]: "",
  }));

  try {
    const response = await submitJsonRequest<CreateReplyResponse>(
      TRIBE_ROUND_ENDPOINT.reply(actionTribeSlug, messageId),
      {
        content,
      }
    );

    if (!isCurrentAction(controller, actionToken, actionTribeSlug)) {
      return;
    }

    if (!response.reply) {
      throw new Error(TRIBE_ROUND_COPY.submitReplyError);
    }

    settleCreatedReply(controller, messageId, optimisticReplyId, response.reply);
  } catch (error) {
    if (!isCurrentAction(controller, actionToken, actionTribeSlug)) {
      return;
    }

    rollbackFailedReply(controller, { content, error, messageId, optimisticReplyId });
  } finally {
    if (isCurrentAction(controller, actionToken, actionTribeSlug)) {
      controller.setPendingActionId(null);
    }
  }
};

export const openEditCreatedAtDialog = (controller: TribeRoundController, message: TribeRoundMessageResult) => {
  controller.setEditingCreatedAtMessageId(message.id);
  controller.setEditingCreatedAtValue(toDateTimeLocalInputValue(message.createdAt));
};

const closeEditCreatedAtDialog = (controller: TribeRoundController) => {
  controller.setEditingCreatedAtMessageId(null);
  controller.setEditingCreatedAtValue("");
};

export const handleEditCreatedAtOpenChange = (controller: TribeRoundController, isOpen: boolean) => {
  if (!isOpen) {
    closeEditCreatedAtDialog(controller);
  }
};

export const handleSubmitCreatedAt = async (controller: TribeRoundController, event: SubmitEvent<HTMLFormElement>) => {
  event.preventDefault();

  if (!controller.editingCreatedAtMessageId) {
    return;
  }

  const parsedDate = parseDateTimeLocalInputValue(controller.editingCreatedAtValue);

  if (!parsedDate) {
    toast.warning(TRIBE_ROUND_COPY.messageEditCreatedAtInvalid);
    return;
  }

  const messageId = controller.editingCreatedAtMessageId;
  const originalCreatedAt =
    controller.messages.find((message) => message.id === messageId)?.createdAt ?? "";
  const nextCreatedAt =
    originalCreatedAt &&
    controller.editingCreatedAtValue === toDateTimeLocalInputValue(originalCreatedAt)
      ? originalCreatedAt
      : parsedDate.toISOString();

  controller.setPendingActionId(messageId);

  try {
    const response = await submitJsonRequest<UpdateCreatedAtResponse>(
      TRIBE_ROUND_ENDPOINT.createdAt(controller.tribeSlug, messageId),
      { createdAt: nextCreatedAt },
      undefined,
      TRIBE_ROUND_FORM.patchMethod
    );

    const appliedCreatedAt =
      typeof response.createdAt === "string" ? response.createdAt : nextCreatedAt;

    controller.setMessages((currentMessages) =>
      sortMessagesByPinnedState(
        currentMessages.map((message) =>
          message.id === messageId
            ? { ...message, createdAt: appliedCreatedAt }
            : message
        )
      )
    );
    // A timestamp move can cross page boundaries, so refresh the server view after the local update.
    controller.router.refresh();
    toast.success(response.message ?? TRIBE_ROUND_COPY.messageEditCreatedAtSuccess);
    closeEditCreatedAtDialog(controller);
  } catch (error) {
    toast.error(
      error instanceof Error
        ? error.message
        : TRIBE_ROUND_COPY.messageEditCreatedAtError
    );
  } finally {
    controller.setPendingActionId(null);
  }
};

export const openEditMessageDialog = (controller: TribeRoundController, message: TribeRoundMessageResult) => {
  resetMessageComposer(controller, { shouldCleanupTransientUploads: true });
  controller.setEditingMessageId(message.id);
  controller.setMessageTitle(message.title ?? "");
  controller.messageEditor.reset(message.content);
  controller.setSelectedChannelId(message.channel.id);
  const hydratedMediaDrafts: ComposerMediaDraft[] = (message.media ?? []).map(
    (mediaItem) => {
      if (mediaItem.kind === MESSAGE_MEDIA_KIND.image) {
        return {
          altText: mediaItem.altText,
          assetId: mediaItem.id,
          isPersisted: true,
          kind: MESSAGE_MEDIA_KIND.image,
          localId: mediaItem.id,
          previewUrl: mediaItem.url,
          status: COMPOSER_IMAGE_UPLOAD_STATUS.uploaded,
        };
      }

      controller.mediaDraftCounterRef.current += 1;

      return {
        kind: MESSAGE_MEDIA_KIND.video,
        localId:
          TRIBE_ROUND_OPTIMISTIC.mediaVideoLocalIdPrefix +
          String(controller.mediaDraftCounterRef.current),
        url: buildEditableVideoUrl(mediaItem),
      };
    }
  );
  controller.setMediaDrafts(hydratedMediaDrafts);
  controller.currentMessageImageDraftsRef.current =
    getImageDraftsFromMediaDrafts(hydratedMediaDrafts);
  const hydratedFileDrafts: ComposerFileDraft[] = [...(message.files ?? [])]
    .sort(
      (firstFile, secondFile) => firstFile.sortOrder - secondFile.sortOrder
    )
    .map((messageFile) => ({
      assetId: messageFile.id,
      fileName: messageFile.fileName,
      fileSizeBytes: messageFile.fileSizeBytes,
      isPersisted: true,
      localId: messageFile.id,
      mimeType: messageFile.mimeType,
      status: COMPOSER_FILE_UPLOAD_STATUS.uploaded,
    }));
  controller.setFileDrafts(hydratedFileDrafts);

  if (message.poll?.totalVoteCount === 0) {
    controller.setIsPollComposerEnabled(true);
    controller.setPollOptions(message.poll.options.map((option) => option.text));
    controller.setPollAllowsMultipleVotes(message.poll.allowMultipleVotes);
  }

  controller.setIsMessageComposerOpen(true);
};

const handleDeleteMessage = async (controller: TribeRoundController, message: TribeRoundMessageResult) => {
  controller.setPendingActionId(message.id);

  try {
    const response = await submitJsonRequest<ApiErrorResponse>(
      TRIBE_ROUND_ENDPOINT.messageItem(controller.tribeSlug, message.id),
      undefined,
      undefined,
      TRIBE_ROUND_FORM.deleteMethod
    );

    controller.setMessages((currentMessages) =>
      currentMessages.filter((currentMessage) => currentMessage.id !== message.id)
    );
    if (controller.selectedMessageId === message.id) {
      controller.setIsMessageDetailsOpen(false);
      controller.setSelectedMessageId(null);
    }
    toast.success(response.message ?? TRIBE_ROUND_COPY.messageDeleteSuccess);
    return true;
  } catch (error) {
    toast.error(
      error instanceof Error ? error.message : TRIBE_ROUND_COPY.messageDeleteError
    );
    return false;
  } finally {
    controller.setPendingActionId(null);
  }
};

export const handleDeleteConfirmationOpenChange = (controller: TribeRoundController, isOpen: boolean) => {
  if (!isOpen && !controller.isBusy) {
    controller.setMessagePendingDeletion(null);
  }
};

export const handleConfirmMessageDeletion = async (controller: TribeRoundController) => {
  if (!controller.messagePendingDeletion) {
    return;
  }

  const wasDeleted = await handleDeleteMessage(controller, controller.messagePendingDeletion);

  if (wasDeleted) {
    controller.setMessagePendingDeletion(null);
  }
};

export const openMessageDetails = (controller: TribeRoundController, messageId: string) => {
  const message = controller.messages.find((currentMessage) => currentMessage.id === messageId);

  if (!message || isPendingMessage(message)) {
    return;
  }

  controller.setExpandedMessageIds((currentExpandedMessageIds) => ({
    ...currentExpandedMessageIds,
    [messageId]: false,
  }));
  controller.setSelectedMessageId(messageId);
  controller.setIsMessageDetailsOpen(true);
};

export const retryLoadingReplies = (controller: TribeRoundController, messageId: string) => {
  controller.setReplyLoadStatuses((currentStatuses) => ({
    ...currentStatuses,
    [messageId]: TRIBE_ROUND_REPLY_LOAD_STATUS.loading,
  }));
  controller.setMessages((currentMessages) =>
    currentMessages.map((message) =>
      message.id === messageId
        ? {
            ...message,
            hasLoadedReplies: false,
          }
        : message
    )
  );
};

export const stopMessageDetailsOpening = (event: MouseEvent<HTMLElement>) => {
  event.stopPropagation();
};

export const isLikeButtonDisabled = (controller: TribeRoundController, message: TribeRoundMessageResult): boolean =>
  !controller.round.viewerPermissions.canReact || isPendingMessage(message);

export const toggleMessageContentExpansion = (controller: TribeRoundController, messageId: string) => {
  controller.setExpandedMessageIds((currentExpandedMessageIds) => ({
    ...currentExpandedMessageIds,
    [messageId]: !currentExpandedMessageIds[messageId],
  }));
};

export const openMessageMediaCarousel = (controller: TribeRoundController, {
  event,
  mediaIndex,
  messageId,
}: {
  event: MouseEvent<HTMLButtonElement>;
  mediaIndex: number;
  messageId: string;
}) => {
  stopMessageDetailsOpening(event);
  controller.setActiveImageCarouselSlideIndex(mediaIndex);
  controller.setSettledImageCarouselSlideIndex(mediaIndex);
  controller.setActiveImageCarousel({ mediaIndex, messageId });
};

export const handleImageCarouselOpenChange = (controller: TribeRoundController, isOpen: boolean) => {
  if (!isOpen) {
    controller.setActiveImageCarousel(null);
    controller.setActiveImageCarouselSlideIndex(0);
    controller.setSettledImageCarouselSlideIndex(0);
  }
};

/**
 * Drives the media carousel with the arrow keys from the dialog level. The
 * handler runs in the capture phase and stops propagation so the carousel's
 * own key handler does not fire twice, and so arrows work even when focus
 * sits on the close button or anywhere else inside the dialog. It cannot
 * recover keystrokes routed to a focused cross-origin video iframe, but the
 * carousel only ever mounts the active slide's iframe, so navigating away
 * unmounts it and returns key control to the document.
 */
export const handleImageCarouselKeyDown = (controller: TribeRoundController, 
  event: KeyboardEvent<HTMLDivElement>
) => {
  const slideCount = controller.activeImageCarouselMedia.length;

  if (slideCount <= 1) {
    return;
  }

  // The carousel loops, so both arrows wrap around the ends.
  if (event.key === TRIBE_ROUND_CAROUSEL_KEY.previous) {
    event.preventDefault();
    event.stopPropagation();
    controller.setActiveImageCarouselSlideIndex(
      (currentIndex) => (currentIndex - 1 + slideCount) % slideCount
    );
  } else if (event.key === TRIBE_ROUND_CAROUSEL_KEY.next) {
    event.preventDefault();
    event.stopPropagation();
    controller.setActiveImageCarouselSlideIndex(
      (currentIndex) => (currentIndex + 1) % slideCount
    );
  }
};
