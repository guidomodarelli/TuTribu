"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { toast } from "@golfo/ui";

import {
  trackTribeEventConversationMutation,
  waitForTribeEventConversationMutations,
} from "@/lib/events/tribe-event-occurrence-pending-mutations";
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

type SetConversationLoadState = Dispatch<SetStateAction<TribeEventLoadState<ConversationData>>>;

/**
 * Loads the conversation once per mount and again on each explicit reload.
 *
 * @param target - Occurrence addressed by the conversation.
 * @returns Load state, its setter for local mutations, and the reload.
 */
function useConversationLoad(target: TribeEventOccurrenceTarget) {
  const [loadState, setLoadState] = useState<TribeEventLoadState<ConversationData>>({
    status: TRIBE_EVENT_POST_EVENT_LOAD_STATUS.loading,
  });
  const [reloadCount, setReloadCount] = useState(0);
  const { eventId, originalStartsAt, tribeSlug } = target;

  useEffect(() => {
    const abortController = new AbortController();
    const occurrenceTarget = { eventId, originalStartsAt, tribeSlug };

    // A comment created or deleted by a previous opening of this occurrence
    // may still be committing: load after it so the thread is not stale.
    waitForTribeEventConversationMutations(occurrenceTarget)
      .then(() =>
        abortController.signal.aborted
          ? null
          : fetchTribeEventConversationRequest(occurrenceTarget, abortController.signal)
      )
      .then((result) => {
        if (!result || abortController.signal.aborted) {
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

  return { loadState, setLoadState, reload };
}

/**
 * Sends new comments, reusing the client request id of an unconfirmed attempt.
 *
 * @param target - Occurrence addressed by the conversation.
 * @param setLoadState - Load state setter, to append the created comment.
 * @returns The submitting flag and the creation.
 */
function useCommentCreation(target: TribeEventOccurrenceTarget, setLoadState: SetConversationLoadState) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);
  const pendingCommentAttemptRef = useRef<PendingCommentAttempt | null>(null);
  const { eventId, originalStartsAt, tribeSlug } = target;

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
      const occurrenceTarget = { eventId, originalStartsAt, tribeSlug };
      const request = createTribeEventCommentRequest(occurrenceTarget, pendingAttempt);

      trackTribeEventConversationMutation(occurrenceTarget, request);

      const result = await request;

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

  return { createComment, isSubmitting };
}

/**
 * Deletes comments, one request per comment at a time.
 *
 * @param target - Occurrence addressed by the conversation.
 * @param setLoadState - Load state setter, to remove the deleted comment.
 * @returns The comments being deleted and the deletion.
 */
function useCommentDeletion(target: TribeEventOccurrenceTarget, setLoadState: SetConversationLoadState) {
  const [deletingCommentIds, setDeletingCommentIds] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const { eventId, originalStartsAt, tribeSlug } = target;

  const deleteComment = async (commentId: string): Promise<void> => {
    if (deletingCommentIds.has(commentId)) {
      return;
    }

    setDeletingCommentIds((currentIds) => new Set(currentIds).add(commentId));

    try {
      const request = deleteTribeEventCommentRequest({ commentId, tribeSlug });

      trackTribeEventConversationMutation({ eventId, originalStartsAt, tribeSlug }, request);

      const result = await request;

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

  return { deleteComment, deletingCommentIds };
}

/**
 * Conversation of one occurrence: loads once per mount (the container
 * remounts per occurrence) with an AbortController, appends a new comment
 * from the route answer, and removes a deleted one, never refreshing the
 * route. A ref guards against duplicate submits. Each send carries a client
 * request id generated once per attempt and reused while the same text is
 * retried after a failure, so a retry after a lost or unreadable response
 * answers the comment already created instead of duplicating it. Comment
 * creations and deletions are registered per occurrence and a load waits for
 * them, so reopening the detail while one is pending shows its outcome.
 *
 * @param target - Occurrence addressed by the conversation.
 * @returns Load state, submitting flags, and the mutations.
 */
export function useTribeEventConversation(target: TribeEventOccurrenceTarget) {
  const { loadState, setLoadState, reload } = useConversationLoad(target);
  const { createComment, isSubmitting } = useCommentCreation(target, setLoadState);
  const { deleteComment, deletingCommentIds } = useCommentDeletion(target, setLoadState);

  return { createComment, deleteComment, deletingCommentIds, isSubmitting, loadState, reload };
}
