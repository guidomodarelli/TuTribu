"use client";

import { type FormEvent, useState } from "react";
import { Trash2Icon } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage, Button, Textarea } from "beez-ui";

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
 * Conversation of one occurrence: questions before it and comments after
 * it, oldest first, with a composer for active members and an inline
 * confirmation before deleting. Presentational: the container owns requests.
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
        {loadState.comments.map((comment) => (
          <li className={styles.TribeEventConversation__item} key={comment.id}>
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
            {confirmingCommentId === comment.id ? (
              <div className={styles.TribeEventConversation__confirm} role="group" aria-label={COPY.confirmDeletePrompt}>
                <span>{COPY.confirmDeletePrompt}</span>
                <Button
                  size={BUTTON_ATTRIBUTE.sizeSmall}
                  type={BUTTON_ATTRIBUTE.typeButton}
                  variant={BUTTON_ATTRIBUTE.variantGhost}
                  onClick={() => setConfirmingCommentId(null)}
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
                  }}
                >
                  {COPY.confirmDelete}
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    );
  };

  const canComment =
    loadState.status === TRIBE_EVENT_POST_EVENT_LOAD_STATUS.loaded && loadState.canComment;
  const inputLabel = isFinished ? COPY.inputLabelAfter : COPY.inputLabelBefore;

  return (
    <section aria-label={COPY.heading} className={styles.TribeEventConversation}>
      <p className={styles.TribeEventConversation__heading}>{COPY.heading}</p>
      {renderList()}
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
