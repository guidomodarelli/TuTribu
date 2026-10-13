"use client";

import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { toast } from "beez-ui";

import {
  trackTribeEventOccurrenceMutation,
  waitForTribeEventOccurrenceMutations,
} from "@/lib/events/tribe-event-occurrence-pending-mutations";
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

type SetReactionResult = Awaited<ReturnType<typeof setTribeEventReactionRequest>>;

/** Reaction request on the wire and the intent it sends. */
type InFlightReactionRequest = {
  intent: PendingReactionIntent;
  request: Promise<SetReactionResult | { isSuccess: false; message: null }>;
};

const COPY = {
  loadFailure: "No pudimos cargar la grabación y los materiales.",
  reactionFailure: "No pudimos guardar tu reacción. Intentá de nuevo.",
  saveFailure: "No pudimos guardar la grabación y los materiales. Intentá de nuevo.",
  saveLoading: "Guardando grabación y materiales…",
  saveSuccess: "Grabación y materiales guardados.",
} as const;

/**
 * Sends the reaction the viewer still wants when the block unmounts (the
 * detail closed) before the debounce flushed it, without touching state. It
 * goes after the request already in flight so the server applies the intents
 * in order, and it is registered so a reopened detail loads after it commits.
 * A failure is still reported, because the tap looked applied.
 *
 * @param teardown - Intent left by the unmounting block, the request it may
 * still have in flight, and the occurrence it belonged to.
 */
function persistReactionIntentOnTeardown({
  inFlightReaction,
  occurrenceTarget,
  pendingIntent,
}: {
  inFlightReaction: InFlightReactionRequest | null;
  occurrenceTarget: TribeEventOccurrenceTarget;
  pendingIntent: PendingReactionIntent | null;
}): void {
  // Already on the wire: the in-flight request is sending this exact intent.
  if (!pendingIntent || pendingIntent === inFlightReaction?.intent) {
    return;
  }

  // Nothing in flight and back to the persisted reaction: nothing to send.
  if (!inFlightReaction && pendingIntent.intendedReaction === pendingIntent.baseline.viewerReaction) {
    return;
  }

  const teardownRequest = (inFlightReaction?.request ?? Promise.resolve())
    .then(() => setTribeEventReactionRequest(occurrenceTarget, pendingIntent.intendedReaction))
    .then(
      (result) => {
        if (!result.isSuccess) {
          toast.error(result.message ?? COPY.reactionFailure);
        }
      },
      () => {
        toast.error(COPY.reactionFailure);
      }
    );

  trackTribeEventOccurrenceMutation(occurrenceTarget, teardownRequest);
}

/**
 * Container logic of the post-event block of one occurrence: loads the
 * resources once per mount (the container remounts per occurrence), saves
 * them incrementally (no route refresh), reports the recording availability
 * of every successful load or save to the parent, and applies reactions
 * optimistically with debounce, coalescing, and rollback to the persisted
 * baseline. Saves and reaction requests are registered per occurrence and a
 * load waits for them, so reopening the detail while one is pending shows its
 * outcome; a reaction still waiting for the debounce is sent on unmount.
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
  const inFlightReactionRef = useRef<InFlightReactionRequest | null>(null);
  // Bumped whenever a load (or a save with no pending reaction) replaces the
  // reactions, so an older reaction answer never overwrites them. A save that
  // races a pending reaction keeps the scope: that reaction answer is newer.
  const reactionScopeRef = useRef(0);
  // Bumped whenever a reaction request persists. A save captures it when it
  // starts: if it changed by the time the save answers, the save may have read
  // the counts before that reaction committed, so its reactions are stale.
  const completedReactionGenerationRef = useRef(0);
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
    };
  }, []);

  useEffect(() => {
    const occurrenceTarget = { eventId, originalStartsAt, tribeSlug };

    return () => {
      if (reactionTimerRef.current) {
        clearTimeout(reactionTimerRef.current);
        reactionTimerRef.current = null;
      }

      const pendingIntent = reactionIntentRef.current;

      reactionIntentRef.current = null;
      persistReactionIntentOnTeardown({
        inFlightReaction: inFlightReactionRef.current,
        occurrenceTarget,
        pendingIntent,
      });
    };
  }, [eventId, originalStartsAt, tribeSlug]);

  useEffect(() => {
    const abortController = new AbortController();
    const occurrenceTarget = { eventId, originalStartsAt, tribeSlug };

    // A save or reaction started by a previous opening of this occurrence may
    // still be committing: load after it so the detail never shows the state
    // it is about to replace.
    waitForTribeEventOccurrenceMutations(occurrenceTarget)
      .then(() =>
        abortController.signal.aborted
          ? null
          : fetchTribeEventPostEventRequest(occurrenceTarget, abortController.signal)
      )
      .then((result) => {
        if (!result || abortController.signal.aborted) {
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
   * reactions. A reaction that persisted after the save started wins: the save
   * may have read the counts before that reaction committed, so its reactions
   * are ignored (resources and recording still apply). Otherwise the save can
   * still race a debounced or in-flight reaction and answer with the
   * pre-reaction counts, so a pending intent survives: its baseline becomes the
   * saved summary, the optimistic view is kept on top, and the reaction
   * response (same scope) stays the final authority.
   *
   * @param savedReactions - Reaction summary returned by the save.
   * @param reactionGenerationAtSaveStart - Completed reaction generation read
   * when the save started.
   */
  const reconcileReactionsAfterSave = (
    savedReactions: TribeEventReactionSummary,
    reactionGenerationAtSaveStart: number
  ) => {
    if (completedReactionGenerationRef.current !== reactionGenerationAtSaveStart) {
      return;
    }

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

    const reactionGenerationAtSaveStart = completedReactionGenerationRef.current;

    const request = saveTribeEventPostEventRequest(
      { eventId, originalStartsAt, tribeSlug },
      payload
    ).then((result) => {
      if (!result.isSuccess) {
        throw new Error(result.message ?? COPY.saveFailure);
      }

      return result;
    });

    trackTribeEventOccurrenceMutation({ eventId, originalStartsAt, tribeSlug }, request);

    toast.promise(request, {
      error: (error: unknown) => (error instanceof Error ? error.message : COPY.saveFailure),
      loading: COPY.saveLoading,
      success: (result) => result.message ?? COPY.saveSuccess,
    });

    try {
      const result = await request;

      if (isMountedRef.current) {
        reconcileReactionsAfterSave(result.postEvent.reactions, reactionGenerationAtSaveStart);
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

    const occurrenceTarget = { eventId, originalStartsAt, tribeSlug };
    const request = setTribeEventReactionRequest(occurrenceTarget, intent.intendedReaction).catch(
      () => ({ isSuccess: false as const, message: null })
    );

    inFlightReactionRef.current = { intent, request };
    trackTribeEventOccurrenceMutation(occurrenceTarget, request);

    const result = await request;

    isReactionRequestInFlightRef.current = false;
    inFlightReactionRef.current = null;

    const isCurrentScope = isMountedRef.current && reactionScopeRef.current === scope;

    if (!result.isSuccess) {
      // The tap looked applied, so its failure is reported even when the
      // detail closed or a reload replaced the reactions meanwhile; the global
      // toast does not depend on this instance.
      toast.error(result.message ?? COPY.reactionFailure);

      if (!isCurrentScope) {
        return;
      }

      const latestIntent = reactionIntentRef.current;

      // The viewer tapped again while the failed request was on the wire: that
      // newer intent was never sent, so only the failed request rolls back.
      // The newer intent keeps the persisted baseline and is sent now (a
      // debounce that is still pending finds it on the wire and waits).
      if (latestIntent && latestIntent !== intent) {
        void flushReactionIntent();
        return;
      }

      // Roll back to the persisted baseline, never to an inferred value.
      reactionIntentRef.current = null;
      setVisibleReactions(intent.baseline);

      return;
    }

    // A reload replaced the reactions meanwhile (or the block unmounted): the
    // successful answer is stale for this instance.
    if (!isCurrentScope) {
      return;
    }

    const latestIntent = reactionIntentRef.current ?? intent;

    completedReactionGenerationRef.current += 1;

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
