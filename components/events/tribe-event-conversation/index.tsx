"use client";

import { type FormEvent, useState } from "react";
import { Trash2Icon } from "lucide-react";
import { AnimatePresence } from "motion/react";

import { Avatar, AvatarFallback, AvatarImage, Button, Textarea } from "beez-ui";

import { AnimatedCollapse } from "@/components/motion/animated-collapse";
import { AnimatedListItem } from "@/components/motion/animated-list-item";
import { PresenceSwap } from "@/components/motion/presence-swap";
import { joinClassNames } from "@/lib/motion/join-class-names";

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
  variantOutline: "outline",
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

  const handleSubmit = async (submitEvent: FormEvent<HTMLFormElement>) => {
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

  const listPresenceKey =
    loadState.status === TRIBE_EVENT_POST_EVENT_LOAD_STATUS.loaded
      ? loadState.comments.length === 0
        ? LIST_PRESENCE_KEY.empty
        : LIST_PRESENCE_KEY.list
      : loadState.status === TRIBE_EVENT_POST_EVENT_LOAD_STATUS.error
        ? LIST_PRESENCE_KEY.error
        : LIST_PRESENCE_KEY.loading;

  const renderList = () => {
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
            variant={BUTTON_ATTRIBUTE.variantOutline}
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
            <AnimatedListItem
              aria-busy={deletingCommentIds.has(comment.id) || undefined}
              className={joinClassNames(
                styles.TribeEventConversation__item,
                deletingCommentIds.has(comment.id) &&
                  styles["TribeEventConversation__item--deleting"]
              )}
              key={comment.id}
            >
              <div className={styles.TribeEventConversation__itemHeader}>
                <Avatar size={AVATAR_SIZE}>
                  {comment.authorImageUrl ? <AvatarImage alt="" src={comment.authorImageUrl} /> : null}
                  <AvatarFallback>{comment.authorName.slice(0, 1).toUpperCase()}</AvatarFallback>
                </Avatar>
                <span className={styles.TribeEventConversation__author}>{comment.authorName}</span>
                <time className={styles.TribeEventConversation__date} dateTime={comment.createdAt}>
                  {formatCommentDate(comment.createdAt)}
                </time>
                {comment.canDelete && confirmingCommentId !== comment.id ? (
                  <Button
                    aria-label={COPY.deleteComment(comment.authorName)}
                    className={styles.TribeEventConversation__delete}
                    id={getDeleteButtonId(comment.id)}
                    disabled={deletingCommentIds.has(comment.id)}
                    size={BUTTON_ATTRIBUTE.sizeSmall}
                    type={BUTTON_ATTRIBUTE.typeButton}
                    variant={BUTTON_ATTRIBUTE.variantGhost}
                    onClick={() => setConfirmingCommentId(comment.id)}
                  >
                    <Trash2Icon aria-hidden />
                  </Button>
                ) : null}
              </div>
              <p className={styles.TribeEventConversation__content}>{comment.content}</p>
              <AnimatedCollapse isOpen={confirmingCommentId === comment.id}>
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
                    onClick={() => cancelDelete(comment.id)}
                  >
                    {COPY.cancelDelete}
                  </Button>
                  <Button
                    size={BUTTON_ATTRIBUTE.sizeSmall}
                    type={BUTTON_ATTRIBUTE.typeButton}
                    variant={BUTTON_ATTRIBUTE.variantOutline}
                    onClick={() => {
                      setConfirmingCommentId(null);
                      onDeleteComment(comment.id);
                      // The comment is on its way out; the composer is the
                      // next useful stop when the viewer can comment.
                      focusElementAfterCommit(FIELD_ID);
                    }}
                  >
                    {COPY.confirmDelete}
                  </Button>
                </div>
              </AnimatedCollapse>
            </AnimatedListItem>
          ))}
        </AnimatePresence>
      </ul>
    );
  };

  const canComment =
    loadState.status === TRIBE_EVENT_POST_EVENT_LOAD_STATUS.loaded && loadState.canComment;
  const inputLabel = isFinished ? COPY.inputLabelAfter : COPY.inputLabelBefore;

  return (
    <section aria-label={COPY.heading} className={styles.TribeEventConversation}>
      <p className={styles.TribeEventConversation__heading}>{COPY.heading}</p>
      <PresenceSwap className={styles.TribeEventConversation__body} presenceKey={listPresenceKey}>
        {renderList()}
      </PresenceSwap>
      {canComment ? (
        <form
          className={styles.TribeEventConversation__form}
          onSubmit={(submitEvent) => {
            void handleSubmit(submitEvent);
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
            onChange={(event) => setDraft(event.currentTarget.value)}
          />
          <Button
            disabled={isSubmitting || draft.trim().length === 0}
            size={BUTTON_ATTRIBUTE.sizeSmall}
            type={BUTTON_ATTRIBUTE.typeSubmit}
          >
            {isSubmitting ? COPY.submittingButton : COPY.submitButton}
          </Button>
        </form>
      ) : null}
      {loadState.status === TRIBE_EVENT_POST_EVENT_LOAD_STATUS.loaded && !loadState.canComment ? (
        <p className={styles.TribeEventConversation__muted}>{COPY.readOnly}</p>
      ) : null}
    </section>
  );
}
