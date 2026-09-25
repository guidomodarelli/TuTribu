"use client";

import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { toast } from "beez-ui";

import {
  fetchTribeEventPostEventRequest,
  saveTribeEventPostEventRequest,
  setTribeEventReactionRequest,
  type TribeEventOccurrenceTarget,
} from "@/lib/events/tribe-event-post-event-api-client";
import {
  TRIBE_EVENT_POST_EVENT_LOAD_STATUS,
  TRIBE_EVENT_REACTION_FLUSH_DELAY_MS,
  type TribeEventLoadState,
} from "@/lib/events/tribe-event-post-event-state";
import {
  applyOptimisticTribeEventReaction,
  getNextTribeEventReaction,
  type TribeEventReactionSummary,
} from "@/lib/events/tribe-event-reaction-state";
import type { TribeEventPostEventView } from "@/src/modules/events/application/results/tribe-event-post-event-public-dto-schemas";
import type { TribeEventOccurrenceReaction } from "@/src/modules/events/domain/entities/tribe-event-post-event";
import type { TribeEventPostEventRequestBody } from "@/src/modules/events/infrastructure/api/schemas/tribe-event-post-event-request-schemas";

export type TribeEventPostEventResourcesPayload = Omit<
  TribeEventPostEventRequestBody,
  "occurrenceStartsAt"
>;

type UseTribeEventPostEventInput = {
  /**
   * Called with the current recording availability after every successful
   * load or save, so the agenda badge follows what the detail shows even when
   * another manager changed the recording after the calendar was loaded.
   */
  onRecordingAvailabilityChange?: (hasRecording: boolean) => void;
  target: TribeEventOccurrenceTarget;
};

/**
 * Pending "¿Cómo estuvo?" intent: the last persisted summary (baseline), the
 * latest reaction the viewer wants. Replaced (never mutated) on every tap.
 */
type PendingReactionIntent = {
  baseline: TribeEventReactionSummary;
  intendedReaction: TribeEventOccurrenceReaction | null;
};

const COPY = {
  loadFailure: "No pudimos cargar la grabación y los materiales.",
  reactionFailure: "No pudimos guardar tu reacción. Intentá de nuevo.",
  saveFailure: "No pudimos guardar la grabación y los materiales. Intentá de nuevo.",
  saveLoading: "Guardando grabación y materiales…",
  saveSuccess: "Grabación y materiales guardados.",
} as const;

/**
 * Container logic of the post-event block of one occurrence: loads the
 * resources once per mount (the container remounts per occurrence), saves
 * them incrementally (no route refresh), reports the recording availability
 * of every successful load or save to the parent, and applies reactions
 * optimistically with debounce, coalescing, and rollback to the persisted
 * baseline.
 *
 * @param input - Occurrence target and the recording availability callback.
 * @returns Load state, visible reactions, and the mutations.
 */
export function useTribeEventPostEvent({
  onRecordingAvailabilityChange,
  target,
}: UseTribeEventPostEventInput) {
  const [loadState, setLoadState] = useState<
    TribeEventLoadState<{ postEvent: TribeEventPostEventView }>
  >({ status: TRIBE_EVENT_POST_EVENT_LOAD_STATUS.loading });
  const [visibleReactions, setVisibleReactions] = useState<TribeEventReactionSummary | null>(null);
  const [reloadCount, setReloadCount] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const isSavingRef = useRef(false);
  const isMountedRef = useRef(true);
  const reactionIntentRef = useRef<PendingReactionIntent | null>(null);
  const reactionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isReactionRequestInFlightRef = useRef(false);
  // Bumped whenever a load (or a save with no pending reaction) replaces the
  // reactions, so an older reaction answer never overwrites them. A save that
  // races a pending reaction keeps the scope: that reaction answer is newer.
  const reactionScopeRef = useRef(0);
  const { eventId, originalStartsAt, tribeSlug } = target;
  // Effect event: the load effect reports with the latest parent callback
  // without refetching whenever the parent re-renders with a new closure.
  const reportLoadedRecordingAvailability = useEffectEvent((hasRecording: boolean) => {
    onRecordingAvailabilityChange?.(hasRecording);
  });

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;

      if (reactionTimerRef.current) {
        clearTimeout(reactionTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const abortController = new AbortController();

    fetchTribeEventPostEventRequest({ eventId, originalStartsAt, tribeSlug }, abortController.signal)
      .then((result) => {
        if (abortController.signal.aborted) {
          return;
        }

        if (result.isSuccess) {
          reactionIntentRef.current = null;
          reactionScopeRef.current += 1;
          setVisibleReactions(result.postEvent.reactions);
          setLoadState({
            postEvent: result.postEvent,
            status: TRIBE_EVENT_POST_EVENT_LOAD_STATUS.loaded,
          });
          // The abort guard above drops answers of a superseded load (reload,
          // occurrence change, or unmount), so only the latest state reports.
          reportLoadedRecordingAvailability(result.postEvent.recording !== null);
        } else {
          setLoadState({
            message: result.message ?? COPY.loadFailure,
            status: TRIBE_EVENT_POST_EVENT_LOAD_STATUS.error,
          });
        }
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

  /**
   * Adopts the reactions of a resources save without discarding the viewer's
   * pending reaction. The save can race a debounced or in-flight reaction and
   * answer with the pre-reaction counts, so a pending intent survives: its
   * baseline becomes the saved summary, the optimistic view is kept on top,
   * and the reaction response (same scope) stays the final authority.
   *
   * @param savedReactions - Reaction summary returned by the save.
   */
  const reconcileReactionsAfterSave = (savedReactions: TribeEventReactionSummary) => {
    const pendingIntent = reactionIntentRef.current;

    if (!pendingIntent) {
      reactionScopeRef.current += 1;
      setVisibleReactions(savedReactions);
      return;
    }

    reactionIntentRef.current = {
      baseline: savedReactions,
      intendedReaction: pendingIntent.intendedReaction,
    };
    setVisibleReactions(
      applyOptimisticTribeEventReaction(savedReactions, pendingIntent.intendedReaction)
    );
  };

  const saveResources = async (payload: TribeEventPostEventResourcesPayload): Promise<boolean> => {
    if (isSavingRef.current) {
      return false;
    }

    isSavingRef.current = true;
    setIsSaving(true);

    const request = saveTribeEventPostEventRequest(
      { eventId, originalStartsAt, tribeSlug },
      payload
    ).then((result) => {
      if (!result.isSuccess) {
        throw new Error(result.message ?? COPY.saveFailure);
      }

      return result;
    });

    toast.promise(request, {
      error: (error: unknown) => (error instanceof Error ? error.message : COPY.saveFailure),
      loading: COPY.saveLoading,
      success: (result) => result.message ?? COPY.saveSuccess,
    });

    try {
      const result = await request;

      if (isMountedRef.current) {
        reconcileReactionsAfterSave(result.postEvent.reactions);
        setLoadState({ postEvent: result.postEvent, status: TRIBE_EVENT_POST_EVENT_LOAD_STATUS.loaded });
      }

      onRecordingAvailabilityChange?.(result.postEvent.recording !== null);

      return true;
    } catch {
      // The failure was already shown by toast.promise with safe copy.
      return false;
    } finally {
      isSavingRef.current = false;

      if (isMountedRef.current) {
        setIsSaving(false);
      }
    }
  };

  const flushReactionIntent = async (): Promise<void> => {
    const intent = reactionIntentRef.current;

    // A tap during an in-flight request only replaces the intent: the
    // response handler compares it and sends the latest one again.
    if (!intent || isReactionRequestInFlightRef.current) {
      return;
    }

    if (intent.intendedReaction === intent.baseline.viewerReaction) {
      reactionIntentRef.current = null;
      return;
    }

    const scope = reactionScopeRef.current;

    isReactionRequestInFlightRef.current = true;

    const result = await setTribeEventReactionRequest(
      { eventId, originalStartsAt, tribeSlug },
      intent.intendedReaction
    ).catch(() => ({ isSuccess: false as const, message: null }));

    isReactionRequestInFlightRef.current = false;

    // A reload replaced the reactions meanwhile: this answer is stale.
    if (!isMountedRef.current || reactionScopeRef.current !== scope) {
      return;
    }

    const latestIntent = reactionIntentRef.current ?? intent;

    if (!result.isSuccess) {
      // Roll back to the persisted baseline, never to an inferred value.
      reactionIntentRef.current = null;
      setVisibleReactions(latestIntent.baseline);
      toast.error(result.message ?? COPY.reactionFailure);
      return;
    }

    if (latestIntent.intendedReaction === result.reactions.viewerReaction) {
      reactionIntentRef.current = null;
      setVisibleReactions(result.reactions);
      return;
    }

    // The viewer changed their mind while the request was in flight: the
    // response becomes the new baseline and the latest intent is sent again.
    reactionIntentRef.current = {
      baseline: result.reactions,
      intendedReaction: latestIntent.intendedReaction,
    };
    setVisibleReactions(
      applyOptimisticTribeEventReaction(result.reactions, latestIntent.intendedReaction)
    );
    void flushReactionIntent();
  };

  const react = (tappedReaction: TribeEventOccurrenceReaction) => {
    if (loadState.status !== TRIBE_EVENT_POST_EVENT_LOAD_STATUS.loaded || !visibleReactions) {
      return;
    }

    const baseline = reactionIntentRef.current?.baseline ?? visibleReactions;
    const intendedReaction = getNextTribeEventReaction(
      visibleReactions.viewerReaction,
      tappedReaction
    );

    reactionIntentRef.current = { baseline, intendedReaction };
    setVisibleReactions(applyOptimisticTribeEventReaction(baseline, intendedReaction));

    if (reactionTimerRef.current) {
      clearTimeout(reactionTimerRef.current);
    }

    reactionTimerRef.current = setTimeout(() => {
      reactionTimerRef.current = null;
      void flushReactionIntent();
    }, TRIBE_EVENT_REACTION_FLUSH_DELAY_MS);
  };

  return { isSaving, loadState, react, reload, saveResources, visibleReactions };
}
