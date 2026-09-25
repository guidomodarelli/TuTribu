"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "beez-ui";

import {
  createTribeEventCommentRequest,
  deleteTribeEventCommentRequest,
  fetchTribeEventConversationRequest,
  type TribeEventOccurrenceTarget,
} from "@/lib/events/tribe-event-post-event-api-client";
import { createTribeEventClientRequestId } from "@/lib/events/tribe-event-client-request-id";
import {
  TRIBE_EVENT_POST_EVENT_LOAD_STATUS,
  type TribeEventLoadState,
} from "@/lib/events/tribe-event-post-event-state";
import type { TribeEventComment } from "@/src/modules/events/application/results/tribe-event-post-event-public-dto-schemas";

const COPY = {
  createFailure: "No pudimos publicar el comentario. Intentá de nuevo.",
  createSuccess: "Comentario publicado.",
  deleteFailure: "No pudimos eliminar el comentario. Intentá de nuevo.",
  deleteSuccess: "Comentario eliminado.",
  loadFailure: "No pudimos cargar la conversación.",
} as const;

type ConversationData = {
  canComment: boolean;
  comments: TribeEventComment[];
};

/**
 * Send attempt whose outcome is not confirmed yet: its text and the client
 * request id every retry of that same text reuses.
 */
type PendingCommentAttempt = {
  clientRequestId: string;
  content: string;
};

/**
 * Conversation of one occurrence: loads once per mount (the container
 * remounts per occurrence) with an AbortController, appends a new comment
 * from the route answer, and removes a deleted one, never refreshing the
 * route. A ref guards against duplicate submits. Each send carries a client
 * request id generated once per attempt and reused while the same text is
 * retried after a failure, so a retry after a lost or unreadable response
 * answers the comment already created instead of duplicating it.
 *
 * @param target - Occurrence addressed by the conversation.
 * @returns Load state, submitting flags, and the mutations.
 */
export function useTribeEventConversation(target: TribeEventOccurrenceTarget) {
  const [loadState, setLoadState] = useState<TribeEventLoadState<ConversationData>>({
    status: TRIBE_EVENT_POST_EVENT_LOAD_STATUS.loading,
  });
  const [reloadCount, setReloadCount] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingCommentIds, setDeletingCommentIds] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const isSubmittingRef = useRef(false);
  const pendingCommentAttemptRef = useRef<PendingCommentAttempt | null>(null);
  const { eventId, originalStartsAt, tribeSlug } = target;

  useEffect(() => {
    const abortController = new AbortController();

    fetchTribeEventConversationRequest(
      { eventId, originalStartsAt, tribeSlug },
      abortController.signal
    )
      .then((result) => {
        if (abortController.signal.aborted) {
          return;
        }

        setLoadState(
          result.isSuccess
            ? {
                canComment: result.canComment,
                comments: result.comments,
                status: TRIBE_EVENT_POST_EVENT_LOAD_STATUS.loaded,
              }
            : {
                message: result.message ?? COPY.loadFailure,
                status: TRIBE_EVENT_POST_EVENT_LOAD_STATUS.error,
              }
        );
      })
      .catch(() => {
        // Aborted requests are the expected cleanup; any other failure is a
        // network error shown with the safe fallback copy.
        if (!abortController.signal.aborted) {
          setLoadState({
            message: COPY.loadFailure,
            status: TRIBE_EVENT_POST_EVENT_LOAD_STATUS.error,
          });
        }
      });

    return () => abortController.abort();
  }, [eventId, originalStartsAt, reloadCount, tribeSlug]);

  const reload = useCallback(() => {
    setLoadState({ status: TRIBE_EVENT_POST_EVENT_LOAD_STATUS.loading });
    setReloadCount((currentCount) => currentCount + 1);
  }, []);

  const createComment = async (content: string): Promise<boolean> => {
    if (isSubmittingRef.current) {
      return false;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);

    const normalizedContent = content.trim();
    const pendingAttempt =
      pendingCommentAttemptRef.current?.content === normalizedContent
        ? pendingCommentAttemptRef.current
        : { clientRequestId: createTribeEventClientRequestId(), content: normalizedContent };

    pendingCommentAttemptRef.current = pendingAttempt;

    try {
      const result = await createTribeEventCommentRequest(
        { eventId, originalStartsAt, tribeSlug },
        pendingAttempt
      );

      if (!result.isSuccess) {
        toast.error(result.message ?? COPY.createFailure);
        return false;
      }

      pendingCommentAttemptRef.current = null;

      // A replayed request answers a comment the thread may already show
      // (for example after a reload), so it is appended only once.
      setLoadState((currentState) =>
        currentState.status === TRIBE_EVENT_POST_EVENT_LOAD_STATUS.loaded &&
        !currentState.comments.some((comment) => comment.id === result.comment.id)
          ? { ...currentState, comments: [...currentState.comments, result.comment] }
          : currentState
      );
      toast.success(result.message ?? COPY.createSuccess);

      return true;
    } catch {
      toast.error(COPY.createFailure);
      return false;
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const deleteComment = async (commentId: string): Promise<void> => {
    if (deletingCommentIds.has(commentId)) {
      return;
    }

    setDeletingCommentIds((currentIds) => new Set(currentIds).add(commentId));

    try {
      const result = await deleteTribeEventCommentRequest({ commentId, tribeSlug });

      if (!result.isSuccess) {
        toast.error(result.message ?? COPY.deleteFailure);
        return;
      }

      setLoadState((currentState) =>
        currentState.status === TRIBE_EVENT_POST_EVENT_LOAD_STATUS.loaded
          ? {
              ...currentState,
              comments: currentState.comments.filter((comment) => comment.id !== commentId),
            }
          : currentState
      );
      toast.success(COPY.deleteSuccess);
    } catch {
      toast.error(COPY.deleteFailure);
    } finally {
      setDeletingCommentIds((currentIds) => {
        const nextIds = new Set(currentIds);

        nextIds.delete(commentId);

        return nextIds;
      });
    }
  };

  return { createComment, deleteComment, deletingCommentIds, isSubmitting, loadState, reload };
}
