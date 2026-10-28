"use client";

import { type SubmitEvent, useState } from "react";
import { Trash2Icon } from "lucide-react";
import { AnimatePresence } from "motion/react";

import { Avatar, Button, Textarea, AnimatedCollapse, AnimatedListItem, PresenceSwap, cn } from "@golfo/ui";

import {
  formatBuenosAiresShortDate,
  formatBuenosAiresTime,
} from "@/lib/date-time/buenos-aires-format";
import {
  TRIBE_EVENT_POST_EVENT_LOAD_STATUS,
  type TribeEventLoadState,
} from "@/lib/events/tribe-event-post-event-state";
import type { TribeEventComment } from "@/src/modules/events/application/results/tribe-event-post-event-public-dto-schemas";
import { TRIBE_EVENT_POST_EVENT_LIMIT } from "@/src/modules/events/constants/tribe-event-post-event";
import styles from "./styles.module.scss";

type TribeEventConversationProps = {
  deletingCommentIds: ReadonlySet<string>;
  /** True once the occurrence ended: the prompt invites comments, not questions. */
  isFinished: boolean;
  isSubmitting: boolean;
  loadState: TribeEventLoadState<{ canComment: boolean; comments: TribeEventComment[] }>;
  onCreateComment: (content: string) => Promise<boolean>;
  onDeleteComment: (commentId: string) => void;
  onRetry: () => void;
};

const EMPTY_VALUE = "";
const FIELD_ID = "tribe-event-conversation-input";
/** Prefix of the per-comment delete button id, used to give focus back. */
const DELETE_BUTTON_ID_PREFIX = "tribe-event-comment-delete-";
/**
 * Presence keys of the list area; loaded conversations split into empty and
 * list so the first comment replaces the empty message with a cross-fade.
 */
const LIST_PRESENCE_KEY = {
  empty: "empty",
  error: "error",
  list: "list",
  loading: "loading",
} as const;
const AVATAR_SIZE = "sm";
const BUTTON_ATTRIBUTE = {
  sizeSmall: "sm",
  typeButton: "button",
  typeSubmit: "submit",
  variantGhost: "ghost",
  variantSecondary: "secondary",
} as const;
const COPY = {
  cancelDelete: "No",
  confirmDelete: "Sí, eliminar",
  confirmDeletePrompt: "¿Eliminar este comentario?",
  deleteComment: (authorName: string) => `Eliminar comentario de ${authorName}`,
  emptyAfter: "Todavía no hay comentarios. Contá cómo te fue.",
  emptyBefore: "Todavía no hay preguntas. ¿Querés preguntar algo antes del encuentro?",
  heading: "Conversación",
  inputLabelAfter: "Escribí un comentario",
  inputLabelBefore: "Escribí una pregunta o un comentario",
  loading: "Cargando la conversación…",
  readOnly: "Solo los miembros activos pueden participar en la conversación.",
  retry: "Reintentar",
  separator: " · ",
  submitButton: "Publicar",
  submittingButton: "Publicando…",
} as const;

function formatCommentDate(createdAt: string): string {
  return formatBuenosAiresShortDate(createdAt) + COPY.separator + formatBuenosAiresTime(createdAt);
}

/**
 * Focuses the element with `elementId` after the current update commits,
 * used to keep keyboard focus when the focused control is swapped out.
 */
function focusElementAfterCommit(elementId: string): void {
  requestAnimationFrame(() => {
    document.getElementById(elementId)?.focus();
  });
}

/** Stable DOM id of the delete button of one comment. */
function getDeleteButtonId(commentId: string): string {
  return DELETE_BUTTON_ID_PREFIX + commentId;
}

type ConversationLoadState = TribeEventConversationProps["loadState"];

/** Presence key of the list area; a loaded conversation splits into empty and list. */
function resolveListPresenceKey(loadState: ConversationLoadState) {
  if (loadState.status === TRIBE_EVENT_POST_EVENT_LOAD_STATUS.loaded) {
    return loadState.comments.length === 0 ? LIST_PRESENCE_KEY.empty : LIST_PRESENCE_KEY.list;
  }

  return loadState.status === TRIBE_EVENT_POST_EVENT_LOAD_STATUS.error
    ? LIST_PRESENCE_KEY.error
    : LIST_PRESENCE_KEY.loading;
}

type TribeEventConversationCommentProps = {
  comment: TribeEventComment;
  isConfirmingDelete: boolean;
  isDeleting: boolean;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
};

/** One comment with its author, date and the inline delete confirmation. */
function TribeEventConversationComment({
  comment,
  isConfirmingDelete,
  isDeleting,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
}: TribeEventConversationCommentProps) {
  return (
    <AnimatedListItem
      aria-busy={isDeleting || undefined}
      className={cn(
        styles.TribeEventConversation__item,
        isDeleting &&
          styles["TribeEventConversation__item--deleting"]
      )}
    >
      <div className={styles.TribeEventConversation__itemHeader}>
        {/* Decorative: the author name is shown next to it. */}
        <Avatar
          aria-hidden
          name={comment.authorName}
          size={AVATAR_SIZE}
          src={comment.authorImageUrl}
        />
        <span className={styles.TribeEventConversation__author}>{comment.authorName}</span>
        <time className={styles.TribeEventConversation__date} dateTime={comment.createdAt}>
          {formatCommentDate(comment.createdAt)}
        </time>
        {comment.canDelete && !isConfirmingDelete ? (
          <Button
            aria-label={COPY.deleteComment(comment.authorName)}
            className={styles.TribeEventConversation__delete}
            id={getDeleteButtonId(comment.id)}
            disabled={isDeleting}
            size={BUTTON_ATTRIBUTE.sizeSmall}
            type={BUTTON_ATTRIBUTE.typeButton}
            variant={BUTTON_ATTRIBUTE.variantGhost}
            onClick={onAskDelete}
          >
            <Trash2Icon aria-hidden />
          </Button>
        ) : null}
      </div>
      <p className={styles.TribeEventConversation__content}>{comment.content}</p>
      <AnimatedCollapse isOpen={isConfirmingDelete}>
        <div
          aria-label={COPY.confirmDeletePrompt}
          className={styles.TribeEventConversation__confirm}
          role="group"
        >
          <span>{COPY.confirmDeletePrompt}</span>
          <Button
            // The trash button that opened this step is gone, so the
            // safe answer takes the focus.
            autoFocus
            size={BUTTON_ATTRIBUTE.sizeSmall}
            type={BUTTON_ATTRIBUTE.typeButton}
            variant={BUTTON_ATTRIBUTE.variantGhost}
            onClick={onCancelDelete}
          >
            {COPY.cancelDelete}
          </Button>
          <Button
            size={BUTTON_ATTRIBUTE.sizeSmall}
            type={BUTTON_ATTRIBUTE.typeButton}
            variant={BUTTON_ATTRIBUTE.variantSecondary}
            onClick={onConfirmDelete}
          >
            {COPY.confirmDelete}
          </Button>
        </div>
      </AnimatedCollapse>
    </AnimatedListItem>
  );
}

type TribeEventConversationListProps = Pick<
  TribeEventConversationProps,
  "deletingCommentIds" | "isFinished" | "loadState" | "onRetry"
> & {
  confirmingCommentId: string | null;
  onAskDelete: (commentId: string) => void;
  onCancelDelete: (commentId: string) => void;
  onConfirmDelete: (commentId: string) => void;
};

/** Loading, error, empty or the list of comments, oldest first. */
function TribeEventConversationList({
  confirmingCommentId,
  deletingCommentIds,
  isFinished,
  loadState,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
  onRetry,
}: TribeEventConversationListProps) {
  if (loadState.status === TRIBE_EVENT_POST_EVENT_LOAD_STATUS.loading) {
    return (
      <p className={styles.TribeEventConversation__muted} role="status">
        {COPY.loading}
      </p>
    );
  }

  if (loadState.status === TRIBE_EVENT_POST_EVENT_LOAD_STATUS.error) {
    return (
      <>
        <p className={styles.TribeEventConversation__error} role="alert">
          {loadState.message}
        </p>
        <Button
          className={styles.TribeEventConversation__retry}
          size={BUTTON_ATTRIBUTE.sizeSmall}
          type={BUTTON_ATTRIBUTE.typeButton}
          variant={BUTTON_ATTRIBUTE.variantSecondary}
          onClick={onRetry}
        >
          {COPY.retry}
        </Button>
      </>
    );
  }

  if (loadState.comments.length === 0) {
    return (
      <p className={styles.TribeEventConversation__muted}>
        {isFinished ? COPY.emptyAfter : COPY.emptyBefore}
      </p>
    );
  }

  return (
    <ul className={styles.TribeEventConversation__list}>
      <AnimatePresence initial={false}>
        {loadState.comments.map((comment) => (
          <TribeEventConversationComment
            comment={comment}
            isConfirmingDelete={confirmingCommentId === comment.id}
            isDeleting={deletingCommentIds.has(comment.id)}
            key={comment.id}
            onAskDelete={() => onAskDelete(comment.id)}
            onCancelDelete={() => onCancelDelete(comment.id)}
            onConfirmDelete={() => onConfirmDelete(comment.id)}
          />
        ))}
      </AnimatePresence>
    </ul>
  );
}

type TribeEventConversationComposerProps = {
  draft: string;
  inputLabel: string;
  isSubmitting: boolean;
  onDraftChange: (draft: string) => void;
  onSubmit: (submitEvent: SubmitEvent<HTMLFormElement>) => Promise<void>;
};

/** Composer of a new question or comment. */
function TribeEventConversationComposer({
  draft,
  inputLabel,
  isSubmitting,
  onDraftChange,
  onSubmit,
}: TribeEventConversationComposerProps) {
  return (
    <form
      className={styles.TribeEventConversation__form}
      onSubmit={(submitEvent) => {
        void onSubmit(submitEvent);
      }}
    >
      <label className={styles.TribeEventConversation__srOnly} htmlFor={FIELD_ID}>
        {inputLabel}
      </label>
      <Textarea
        className={styles.TribeEventConversation__input}
        id={FIELD_ID}
        maxLength={TRIBE_EVENT_POST_EVENT_LIMIT.commentMaxLength}
        placeholder={inputLabel}
        rows={2}
        value={draft}
        onChange={(event) => onDraftChange(event.currentTarget.value)}
      />
      <Button
        disabled={isSubmitting || draft.trim().length === 0}
        size={BUTTON_ATTRIBUTE.sizeSmall}
        type={BUTTON_ATTRIBUTE.typeSubmit}
      >
        {isSubmitting ? COPY.submittingButton : COPY.submitButton}
      </Button>
    </form>
  );
}

/**
 * Conversation of one occurrence: questions before it and comments after
 * it, oldest first, with a composer for active members and an inline
 * confirmation before deleting. Presentational: the container owns requests.
 * New comments slide in and deleted ones fold away; opening the delete
 * confirmation moves focus to its safe "No" and cancelling returns it to
 * the trash button.
 */
export function TribeEventConversation({
  deletingCommentIds,
  isFinished,
  isSubmitting,
  loadState,
  onCreateComment,
  onDeleteComment,
  onRetry,
}: TribeEventConversationProps) {
  const [draft, setDraft] = useState(EMPTY_VALUE);
  const [confirmingCommentId, setConfirmingCommentId] = useState<string | null>(null);

  const handleSubmit = async (submitEvent: SubmitEvent<HTMLFormElement>) => {
    submitEvent.preventDefault();

    const content = draft.trim();

    if (!content || isSubmitting) {
      return;
    }

    if (await onCreateComment(content)) {
      setDraft(EMPTY_VALUE);
    }
  };

  const cancelDelete = (commentId: string) => {
    setConfirmingCommentId(null);
    focusElementAfterCommit(getDeleteButtonId(commentId));
  };

  const listPresenceKey = resolveListPresenceKey(loadState);

  const canComment =
    loadState.status === TRIBE_EVENT_POST_EVENT_LOAD_STATUS.loaded && loadState.canComment;
  const inputLabel = isFinished ? COPY.inputLabelAfter : COPY.inputLabelBefore;

  return (
    <section aria-label={COPY.heading} className={styles.TribeEventConversation}>
      <p className={styles.TribeEventConversation__heading}>{COPY.heading}</p>
      <PresenceSwap className={styles.TribeEventConversation__body} presenceKey={listPresenceKey}>
        <TribeEventConversationList
          confirmingCommentId={confirmingCommentId}
          deletingCommentIds={deletingCommentIds}
          isFinished={isFinished}
          loadState={loadState}
          onAskDelete={setConfirmingCommentId}
          onCancelDelete={cancelDelete}
          onConfirmDelete={(commentId) => {
            setConfirmingCommentId(null);
            onDeleteComment(commentId);
            // The comment is on its way out; the composer is the
            // next useful stop when the viewer can comment.
            focusElementAfterCommit(FIELD_ID);
          }}
          onRetry={onRetry}
        />
      </PresenceSwap>
      {canComment ? (
        <TribeEventConversationComposer
          draft={draft}
          inputLabel={inputLabel}
          isSubmitting={isSubmitting}
          onDraftChange={setDraft}
          onSubmit={handleSubmit}
        />
      ) : null}
      {loadState.status === TRIBE_EVENT_POST_EVENT_LOAD_STATUS.loaded && !loadState.canComment ? (
        <p className={styles.TribeEventConversation__muted}>{COPY.readOnly}</p>
      ) : null}
    </section>
  );
}
