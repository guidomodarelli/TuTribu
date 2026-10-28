/**
 * @file Render helpers for the message details dialog and its replies.
 */
import { MessageCircleIcon, SendIcon } from "lucide-react";
import { AnimatePresence } from "motion/react";
import {
  AnimatedCount,
  AnimatedListItem,
  Avatar,
  Button,
  Dialog,
  DialogContent,
  ReactionButton,
} from "@golfo/ui";
import { MorphLoader } from "@/components/loaders/morph-loader";
import { MessageLikesHoverCard } from "@/components/tribe-round/message-likes-hover-card";
import type { TribeRoundReplyResult } from "@/src/modules/messages/application/results/tribe-round-result";
import styles from "./styles.module.scss";
import {
  getAvatarRoleModifierClassName,
  getCommentCount,
  getLikeButtonClassName,
  getReplyAvatarRoleModifierClassName,
  isPendingMessage,
  isPendingReply,
  renderAuthorIdentity,
  renderAuthorRoleAccessibleLabel,
  renderCommentAuthorsPreview,
  renderMessageCreatedTime,
  renderRoundAuthorAvatar,
  TRIBE_ROUND_ATTRIBUTES,
  TRIBE_ROUND_COPY,
  TRIBE_ROUND_FORM,
  TRIBE_ROUND_LOADER_SIZE_PX,
  TRIBE_ROUND_REPLY_LOAD_STATUS,
  TRIBE_ROUND_RESET_KEY,
  type TribeRoundVisibleMessageResult,
} from "./tribe-round-shared";
import type { TribeRoundController } from "./use-tribe-round-controller";
import { handleCreateReply, isLikeButtonDisabled, retryLoadingReplies } from "./message-actions";
import { handleToggleLike } from "./reaction-actions";
import {
  renderMessageActionsMenu,
  renderMessageContent,
  renderMessageFiles,
  renderMessageMedia,
  renderMessagePoll,
} from "./message-render";

/**
 * Renders the message details dialog with the selected message thread.
 */
export function renderMessageDetailsDialog(controller: TribeRoundController) {
  const { selectedMessage } = controller;

  return (
    <Dialog open={controller.isMessageDetailsOpen} onOpenChange={controller.setIsMessageDetailsOpen}>
      <DialogContent
        className={`${styles.TribeRound__composerDialog} ${styles["TribeRound__composerDialog--messageDetails"]}`}
        closeButtonPlacement={TRIBE_ROUND_ATTRIBUTES.messageDetailsCloseButtonPlacement}
        onOpenAutoFocus={controller.focusMessageDetailsBody}
        ref={controller.messageDetailsDialogRef}
        title={TRIBE_ROUND_COPY.messageDetailsDialogTitle}
        description={TRIBE_ROUND_COPY.messageDetailsDialogDescription}
        headerClassName={styles.TribeRound__composerDialogHeader}
        titleClassName={styles.TribeRound__composerDialogTitle}
        descriptionClassName={styles.TribeRound__composerDialogDescription}
      >
      {selectedMessage
        ? renderMessageDetailsBody(controller, selectedMessage)
        : null}
    </DialogContent>
  </Dialog>
  );
}

/**
 * Renders the selected message: header, content, actions, and replies.
 */
function renderMessageDetailsBody(controller: TribeRoundController, selectedMessage: TribeRoundVisibleMessageResult) {
  return (
    <article
      aria-label={TRIBE_ROUND_COPY.messageDetailsContentLabel}
      className={styles.TribeRound__messageDetailsBody}
      ref={controller.messageDetailsBodyRef}
      role={TRIBE_ROUND_ATTRIBUTES.regionRole}
      tabIndex={-1}
    >
      {renderMessageDetailsHeader(controller, selectedMessage)}
      {renderMessageDetailsContent(controller, selectedMessage)}
      {renderMessageDetailsReplies(controller, selectedMessage)}
    </article>
  );
}

/**
 * Renders the selected message header: author, created time, and actions menu.
 */
function renderMessageDetailsHeader(controller: TribeRoundController, selectedMessage: TribeRoundVisibleMessageResult) {
  return (
    <div
      className={`${styles.TribeRound__messageHeader} ${styles.TribeRound__messageDetailsHeader}`}
    >
      {renderRoundAuthorAvatar(
        selectedMessage.author,
        styles.TribeRound__avatar,
        getAvatarRoleModifierClassName(selectedMessage.author.role)
      )}
      <div className={styles.TribeRound__author}>
        {renderAuthorIdentity(selectedMessage.author)}
        {renderMessageCreatedTime(
          selectedMessage.createdAt,
          selectedMessage.channel
        )}
      </div>
      <div className={styles.TribeRound__messageMeta}>
        {renderMessageActionsMenu(controller, selectedMessage)}
      </div>
    </div>
  );
}

/**
 * Renders the selected message body: title, content, media, files, poll, and actions.
 */
function renderMessageDetailsContent(controller: TribeRoundController, selectedMessage: TribeRoundVisibleMessageResult) {
  return (
    <div className={styles.TribeRound__messageContent}>
      {selectedMessage.title ? (
        <h3 className={styles.TribeRound__messageTitle}>
          {selectedMessage.title}
        </h3>
      ) : null}
      {renderMessageContent(controller, selectedMessage)}
      {renderMessageMedia(controller, selectedMessage, { canOpenCarousel: true })}
      {renderMessageFiles(controller, selectedMessage)}
      {renderMessagePoll(controller, selectedMessage)}
      {renderMessageDetailsActions(controller, selectedMessage)}
    </div>
  );
}

/**
 * Renders the like, comment, and comment authors controls of the selected message.
 */
function renderMessageDetailsActions(controller: TribeRoundController, selectedMessage: TribeRoundVisibleMessageResult) {
  return (
    <div
      className={`${styles.TribeRound__messageActions} ${styles["TribeRound__messageActions--dialog"]}`}
    >
      <MessageLikesHoverCard
        isTriggerDisabled={isLikeButtonDisabled(controller, selectedMessage)}
        likeCount={selectedMessage.likeCount}
        messageId={selectedMessage.id}
        tribeSlug={controller.tribeSlug}
      >
        <ReactionButton
          activeColor="currentColor"
          ariaLabel={`${TRIBE_ROUND_COPY.likeButtonAriaLabel} ${selectedMessage.likeCount}`}
          className={getLikeButtonClassName(
            selectedMessage.likedByViewer
          )}
          isDisabled={isLikeButtonDisabled(controller, selectedMessage)}
          isActive={selectedMessage.likedByViewer}
          count={selectedMessage.likeCount}
          onClick={() => {
            handleToggleLike(controller, selectedMessage.id);
          }}
        />
      </MessageLikesHoverCard>
      <Button
        aria-label={`${TRIBE_ROUND_COPY.commentButtonAriaLabel} ${getCommentCount(selectedMessage)}`}
        className={styles.TribeRound__commentButton}
        disabled={isPendingMessage(selectedMessage)}
        type={TRIBE_ROUND_FORM.buttonType}
        variant={TRIBE_ROUND_FORM.secondaryVariant}
      >
        <MessageCircleIcon />
        <AnimatedCount value={getCommentCount(selectedMessage)} />
      </Button>
      {renderCommentAuthorsPreview(selectedMessage)}
    </div>
  );
}

/**
 * Renders the replies section of the selected message.
 */
function renderMessageDetailsReplies(controller: TribeRoundController, selectedMessage: TribeRoundVisibleMessageResult) {
  return (
    <div className={styles.TribeRound__modalReplysSection}>
      <section
        aria-label={TRIBE_ROUND_COPY.repliesTitle}
        className={styles.TribeRound__replies}
      >
        {renderRepliesLoading(controller)}
        {renderRepliesLoadError(controller, selectedMessage)}
        {renderReplyList(controller, selectedMessage)}
        {renderReplyForm(controller, selectedMessage)}
      </section>
    </div>
  );
}

/**
 * Renders the loader shown while the selected message replies load.
 */
function renderRepliesLoading(controller: TribeRoundController) {
  return controller.selectedMessageReplyLoadStatus ===
    TRIBE_ROUND_REPLY_LOAD_STATUS.loading ? (
    <div className={styles.TribeRound__replyLoading}>
      <MorphLoader
        label={TRIBE_ROUND_COPY.repliesLoading}
        size={TRIBE_ROUND_LOADER_SIZE_PX}
      />
    </div>
  ) : null;
}

/**
 * Renders the replies load error with a retry button.
 */
function renderRepliesLoadError(controller: TribeRoundController, selectedMessage: TribeRoundVisibleMessageResult) {
  return controller.selectedMessageReplyLoadStatus ===
    TRIBE_ROUND_REPLY_LOAD_STATUS.error ? (
    <div className={styles.TribeRound__replyStatus}>
      <p className={styles.TribeRound__replyStatusText}>
        {TRIBE_ROUND_COPY.repliesLoadError}
      </p>
      <Button
        onClick={() => {
          retryLoadingReplies(controller, selectedMessage.id);
        }}
        type={TRIBE_ROUND_FORM.buttonType}
        variant={TRIBE_ROUND_FORM.secondaryVariant}
      >
        {TRIBE_ROUND_COPY.repliesRetry}
      </Button>
    </div>
  ) : null;
}

/**
 * Renders the list of replies of the selected message.
 */
function renderReplyList(controller: TribeRoundController, selectedMessage: TribeRoundVisibleMessageResult) {
  return selectedMessage.replies.length > 0 ? (
    <ol className={styles.TribeRound__replyList}>
      <AnimatePresence initial={false}>
        {selectedMessage.replies.map((reply) => renderReplyItem(controller, reply))}
      </AnimatePresence>
    </ol>
  ) : null;
}

/**
 * Renders one reply of the selected message.
 */
function renderReplyItem(controller: TribeRoundController, reply: TribeRoundReplyResult) {
  return (
    <AnimatedListItem
      aria-busy={isPendingReply(reply) || undefined}
      className={
        isPendingReply(reply)
          ? `${styles.TribeRound__reply} ${styles["TribeRound__reply--pending"]}`
          : styles.TribeRound__reply
      }
      key={controller.optimisticRenderKeys[reply.id] ?? reply.id}
      layout={false}
    >
      {renderRoundAuthorAvatar(
        reply.author,
        styles.TribeRound__replyAvatar,
        getReplyAvatarRoleModifierClassName(reply.author.role)
      )}
      <div className={styles.TribeRound__replyBody}>
        <p className={styles.TribeRound__replyMeta}>
          <span>{reply.author.name}</span>
          {renderAuthorRoleAccessibleLabel(reply.author.role)}
        </p>
        <p className={styles.TribeRound__replyContent}>
          {reply.content}
        </p>
      </div>
    </AnimatedListItem>
  );
}

/**
 * Renders the reply form when the viewer can reply.
 */
function renderReplyForm(controller: TribeRoundController, selectedMessage: TribeRoundVisibleMessageResult) {
  return controller.round.viewerPermissions.canReply ? (
    <form
      className={styles.TribeRound__replyForm}
      onSubmit={(event) => {
        void handleCreateReply(controller, event, selectedMessage.id);
      }}
    >
      <Avatar
        className={styles.TribeRound__replyComposerAvatar}
        fallback={controller.authenticatedMember.avatarFallback}
        name={controller.authenticatedMember.name}
        size={TRIBE_ROUND_ATTRIBUTES.authorAvatarSize}
        src={controller.authenticatedMember.image}
      />
      <div className={styles.TribeRound__replyInputWrapper}>
        <input
          aria-label={TRIBE_ROUND_COPY.replyInputLabel}
          className={styles.TribeRound__replyInput}
          disabled={
            controller.selectedMessageReplyLoadStatus ===
            TRIBE_ROUND_REPLY_LOAD_STATUS.loading
          }
          onChange={(event) => {
            const nextReplyDraft = event.currentTarget.value;

            controller.setReplyDrafts((currentDrafts) => ({
              ...currentDrafts,
              [selectedMessage.id]: nextReplyDraft,
            }));
          }}
          placeholder={TRIBE_ROUND_COPY.replyPlaceholder}
          value={
            controller.replyDrafts[selectedMessage.id] ??
            TRIBE_ROUND_RESET_KEY.empty
          }
        />
        <button
          aria-label={TRIBE_ROUND_COPY.replySendButtonAriaLabel}
          className={styles.TribeRound__replySendButton}
          disabled={
            controller.isBusy ||
            controller.selectedMessageReplyLoadStatus ===
              TRIBE_ROUND_REPLY_LOAD_STATUS.loading ||
            !(
              controller.replyDrafts[selectedMessage.id] ??
              TRIBE_ROUND_RESET_KEY.empty
            ).trim()
          }
          type={TRIBE_ROUND_FORM.submitType}
        >
          <SendIcon />
        </button>
      </div>
    </form>
  ) : null;
}
