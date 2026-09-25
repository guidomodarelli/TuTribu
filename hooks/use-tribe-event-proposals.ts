"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "beez-ui";

import type { TribeEventSeriesMutationSettler } from "@/hooks/use-tribe-event-mutations";
import type { TribeEventProposalSubmission } from "@/lib/events/tribe-event-form-submissions";
import {
  OCCURRENCES_MUTATION_OUTCOME,
  type OccurrencesMutationOutcome,
} from "@/lib/events/tribe-event-occurrences-freshness";
import {
  approveTribeEventProposalRequest,
  createTribeEventProposalRequest,
  decideTribeEventProposalRequest,
  fetchTribeEventProposalsRequest,
  toTribeEventProposalRequestBody,
} from "@/lib/events/tribe-event-proposals-api-client";
import type {
  TribeEventMutationFailure,
  TribeEventSavePayload,
} from "@/lib/events/tribe-events-api-client";
import type {
  TribeEventOccurrenceResult,
  TribeEventProposalResult,
} from "@/src/modules/events/application/results/tribe-event-result";
import { TRIBE_EVENT_PROPOSAL_STATUS } from "@/src/modules/events/constants/tribe-events";

/**
 * Lifecycle of the proposals panel list.
 */
export const TRIBE_EVENT_PROPOSALS_LOAD_STATUS = {
  error: "error",
  idle: "idle",
  loaded: "loaded",
  loading: "loading",
} as const;

export type TribeEventProposalsLoadState =
  | { status: typeof TRIBE_EVENT_PROPOSALS_LOAD_STATUS.idle }
  | { status: typeof TRIBE_EVENT_PROPOSALS_LOAD_STATUS.loading }
  | { message: string; status: typeof TRIBE_EVENT_PROPOSALS_LOAD_STATUS.error }
  | {
      canReviewProposals: boolean;
      proposals: TribeEventProposalResult[];
      status: typeof TRIBE_EVENT_PROPOSALS_LOAD_STATUS.loaded;
    };

type UseTribeEventProposalsInput = {
  /**
   * Registers an approval (it creates an event) in the calendar freshness
   * state machines, so the streak, and the visible month when the outcome is
   * ambiguous, are read again once it settles.
   */
  beginSeriesMutation: () => TribeEventSeriesMutationSettler;
  /** Pending proposals counted by the server for managers (0 otherwise). */
  initialPendingCount: number;
  /** Visible `YYYY-MM` month, sent so an approval returns its occurrences. */
  month: string;
  /** Patches the calendar with the slots of the event an approval created. */
  onEventCreated: (eventId: string, occurrences: TribeEventOccurrenceResult[]) => void;
  /**
   * Token of the server render that counted `initialPendingCount` (for
   * example `attendanceStreakComputedAt`). A new token always replaces the
   * local count, even when the server count repeats the previous render's.
   */
  pendingCountSourceVersion: string | null;
  tribeSlug: string;
};

export type TribeEventProposals = {
  approveProposal: (
    proposal: TribeEventProposalResult,
    payload: TribeEventSavePayload
  ) => Promise<boolean>;
  /** Sends the proposal form submission, translated to the route body. */
  createProposal: (submission: TribeEventProposalSubmission) => Promise<boolean>;
  isSubmitting: boolean;
  loadProposals: () => void;
  loadState: TribeEventProposalsLoadState;
  pendingCount: number;
  rejectProposal: (proposal: TribeEventProposalResult, reviewNote: string) => Promise<boolean>;
  withdrawProposal: (proposal: TribeEventProposalResult) => Promise<boolean>;
};

/** Server render the local pending count derives from. */
type PendingCountSource = {
  count: number;
  version: string | null;
};

type PendingCountState = {
  count: number;
  source: PendingCountSource;
};

/** Response every proposal mutation request resolves to. */
type ProposalMutationResult =
  | { isSuccess: true; message: string | null }
  | TribeEventMutationFailure;

type ProposalMutationOptions = {
  /**
   * Receives how the mutation ended, exactly once, after the duplicate guard
   * is released.
   */
  onSettled?: (outcome: OccurrencesMutationOutcome) => void;
  /** Reloads the list when the route cleanly rejected the mutation. */
  shouldReloadOnRejection: boolean;
};

const COPY = {
  approveFailure: "No pudimos aprobar la propuesta.",
  createFailure: "No pudimos enviar la propuesta.",
  decisionFailure: "No pudimos actualizar la propuesta.",
  loadFailure: "No pudimos cargar las propuestas.",
  refillFailure: "No pudimos actualizar la lista de propuestas: puede haber más pendientes.",
  retry: "Reintentar",
  saved: "Listo.",
} as const;
const ABORT_ERROR_NAME = "AbortError";
const PROPOSAL_DECISION = {
  rejected: TRIBE_EVENT_PROPOSAL_STATUS.rejected,
  withdrawn: TRIBE_EVENT_PROPOSAL_STATUS.withdrawn,
} as const;

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === ABORT_ERROR_NAME;
}

/**
 * Tells whether two pending count sources come from the same server render:
 * same render token and the same server count.
 */
function isSamePendingCountSource(
  source: PendingCountSource,
  otherSource: PendingCountSource
): boolean {
  return source.count === otherSource.count && source.version === otherSource.version;
}

/**
 * Client state of member proposals: the panel list (loaded on demand with an
 * AbortController so a stale load never overwrites a newer one), the
 * manager pending counter, and the create/approve/reject/withdraw mutations
 * with a ref guard against double submits. Mutations patch local state from
 * the route response instead of refreshing the route; when a review is
 * rejected (for example another manager resolved the proposal first) the list
 * is reloaded so it never shows a stale pending proposal.
 *
 * A mutation whose outcome is ambiguous (network failure, timeout, 5xx, or an
 * unusable body) may have committed without its response landing, so the
 * list (and, for managers, the pending counter) is always reloaded; retrying
 * a committed creation from a stale list could duplicate the proposal. Every
 * approval creates an event, so it settles in the calendar freshness state
 * machines too: the streak is read again once it settles, and an ambiguous
 * approval also reads the visible month again.
 *
 * The pending counter is keyed by the server render (render token plus
 * count): a new render replaces the local count even when it repeats the
 * previous render's value.
 *
 * The manager queue is capped by the server, so a successful review of a
 * truncated queue (the last load counted more pending proposals than it
 * returned) reloads it in the background, keeping the visible list, so the
 * next oldest pending proposal replaces the reviewed one and the panel never
 * runs empty while the counter still reports pending proposals. If that
 * background read fails, the loaded queue stays visible and actionable and a
 * warning toast offers a retry, since the queue may be incomplete.
 *
 * @param input - Tribe, visible month, server pending count and its render
 * token, the calendar patch callback, and the series mutation registration.
 * @returns List state, pending count, and mutation callbacks resolving to
 * `true` when the change was stored.
 */
export function useTribeEventProposals({
  beginSeriesMutation,
  initialPendingCount,
  month,
  onEventCreated,
  pendingCountSourceVersion,
  tribeSlug,
}: UseTribeEventProposalsInput): TribeEventProposals {
  const pendingCountSource: PendingCountSource = {
    count: initialPendingCount,
    version: pendingCountSourceVersion,
  };
  const [loadState, setLoadState] = useState<TribeEventProposalsLoadState>({
    status: TRIBE_EVENT_PROPOSALS_LOAD_STATUS.idle,
  });
  const [pendingCountState, setPendingCountState] = useState<PendingCountState>({
    count: initialPendingCount,
    source: pendingCountSource,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);
  const loadControllerRef = useRef<AbortController | null>(null);
  // Whether the last load left pending proposals out of the capped queue.
  const hasUnloadedPendingProposalsRef = useRef(false);
  const visibleMonthRef = useRef(month);
  // A new server render (month navigation) replaces the local count, even
  // when it counts the same number as the previous render.
  const pendingCount = isSamePendingCountSource(pendingCountState.source, pendingCountSource)
    ? pendingCountState.count
    : initialPendingCount;

  useEffect(() => {
    visibleMonthRef.current = month;
  }, [month]);

  useEffect(() => () => loadControllerRef.current?.abort(), []);

  const updatePendingCount = (updater: (count: number) => number) => {
    setPendingCountState((currentState) => ({
      count: updater(
        isSamePendingCountSource(currentState.source, pendingCountSource)
          ? currentState.count
          : initialPendingCount
      ),
      source: pendingCountSource,
    }));
  };

  /**
   * Reads the proposals, aborting any older read so a stale response never
   * overwrites a newer one. A background read keeps the current list visible
   * until the response lands.
   */
  const requestProposals = (isBackgroundRefresh: boolean) => {
    loadControllerRef.current?.abort();

    const controller = new AbortController();

    loadControllerRef.current = controller;

    if (!isBackgroundRefresh) {
      setLoadState({ status: TRIBE_EVENT_PROPOSALS_LOAD_STATUS.loading });
    }

    /**
     * A failed background refill keeps the loaded queue, whose proposals are
     * still actionable, and warns with a retry instead of hiding them behind
     * the error state; a foreground load has nothing to keep and shows it.
     */
    const handleLoadFailure = (message: string) => {
      if (isBackgroundRefresh) {
        toast.warning(COPY.refillFailure, {
          action: { label: COPY.retry, onClick: () => requestProposals(true) },
        });
        return;
      }

      setLoadState({ message, status: TRIBE_EVENT_PROPOSALS_LOAD_STATUS.error });
    };

    fetchTribeEventProposalsRequest({ signal: controller.signal, tribeSlug })
      .then((result) => {
        if (controller.signal.aborted) {
          return;
        }

        if (!result.isSuccess) {
          handleLoadFailure(result.message ?? COPY.loadFailure);
          return;
        }

        hasUnloadedPendingProposalsRef.current =
          result.canReviewProposals && result.pendingCount > result.proposals.length;
        setLoadState({
          canReviewProposals: result.canReviewProposals,
          proposals: result.proposals,
          status: TRIBE_EVENT_PROPOSALS_LOAD_STATUS.loaded,
        });

        if (result.canReviewProposals) {
          // The queue is capped; the badge follows the uncapped server total.
          updatePendingCount(() => result.pendingCount);
        }
      })
      .catch((error: unknown) => {
        // An aborted load was replaced by a newer one (or the panel closed).
        if (isAbortError(error) || controller.signal.aborted) {
          return;
        }

        handleLoadFailure(COPY.loadFailure);
      });
  };

  const loadProposals = () => {
    requestProposals(false);
  };

  const updateLoadedProposals = (
    updater: (proposals: TribeEventProposalResult[]) => TribeEventProposalResult[]
  ) => {
    setLoadState((currentState) =>
      currentState.status === TRIBE_EVENT_PROPOSALS_LOAD_STATUS.loaded
        ? { ...currentState, proposals: updater(currentState.proposals) }
        : currentState
    );
  };

  /**
   * Removes a reviewed proposal from the queue and decrements the counter.
   * When the capped queue left pending proposals out, it is read again in the
   * background so the next oldest one takes the reviewed one's place.
   */
  const removeReviewedProposal = (proposalId: string) => {
    updateLoadedProposals((proposals) =>
      proposals.filter((currentProposal) => currentProposal.id !== proposalId)
    );
    updatePendingCount((count) => Math.max(count - 1, 0));

    if (hasUnloadedPendingProposalsRef.current) {
      requestProposals(true);
    }
  };

  /**
   * Shared guard, toasts, and failure recovery of every proposal mutation.
   * An ambiguous outcome always reloads the list, since the mutation may have
   * committed; a clean rejection reloads it only when asked. The caller must
   * hold the duplicate-submit guard (`acquireSubmitGuard`); it is released
   * here once the request settles.
   */
  const runMutation = async <TResult extends ProposalMutationResult>(
    request: () => Promise<TResult>,
    failureCopy: string,
    onSuccess: (result: Extract<TResult, { isSuccess: true }>) => void,
    options: ProposalMutationOptions
  ): Promise<boolean> => {
    // Stays ambiguous unless the route answers: a network failure or timeout
    // may still have committed the mutation.
    let outcome: OccurrencesMutationOutcome = OCCURRENCES_MUTATION_OUTCOME.ambiguous;

    try {
      const result = await request();

      if (!result.isSuccess) {
        outcome = result.isOutcomeAmbiguous
          ? OCCURRENCES_MUTATION_OUTCOME.ambiguous
          : OCCURRENCES_MUTATION_OUTCOME.rejected;
        toast.error(result.message ?? failureCopy);
        return false;
      }

      onSuccess(result as Extract<TResult, { isSuccess: true }>);
      outcome = OCCURRENCES_MUTATION_OUTCOME.applied;
      toast.success(result.message ?? COPY.saved);
      return true;
    } catch {
      // Network failure: the route never answered, so show the safe fallback;
      // the outcome stays ambiguous and the list is reconciled below.
      toast.error(failureCopy);
      return false;
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);

      if (
        outcome === OCCURRENCES_MUTATION_OUTCOME.ambiguous ||
        (outcome === OCCURRENCES_MUTATION_OUTCOME.rejected && options.shouldReloadOnRejection)
      ) {
        loadProposals();
      }

      options.onSettled?.(outcome);
    }
  };

  /**
   * Takes the duplicate-submit guard. Returns false when a mutation is
   * already in flight, so the caller drops this one.
   */
  const acquireSubmitGuard = (): boolean => {
    if (isSubmittingRef.current) {
      return false;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    return true;
  };

  const createProposal: TribeEventProposals["createProposal"] = async (submission) => {
    if (!acquireSubmitGuard()) {
      return false;
    }

    return runMutation(
      () =>
        createTribeEventProposalRequest({
          payload: toTribeEventProposalRequestBody(submission),
          tribeSlug,
        }),
      COPY.createFailure,
      (result) => {
        updateLoadedProposals((proposals) => [result.proposal, ...proposals]);
      },
      { shouldReloadOnRejection: false }
    );
  };

  const approveProposal: TribeEventProposals["approveProposal"] = async (proposal, payload) => {
    if (!acquireSubmitGuard()) {
      return false;
    }

    const requestMonth = month;
    // The approval creates an event, so it takes part in the calendar
    // freshness state machines like any creation.
    const settleSeriesMutation = beginSeriesMutation();

    return runMutation(
      () =>
        approveTribeEventProposalRequest({
          month: requestMonth,
          payload,
          proposalId: proposal.id,
          tribeSlug,
        }),
      COPY.approveFailure,
      (result) => {
        removeReviewedProposal(proposal.id);

        if (visibleMonthRef.current === requestMonth) {
          onEventCreated(result.eventId, result.occurrences);
        }
      },
      { onSettled: settleSeriesMutation, shouldReloadOnRejection: true }
    );
  };

  const rejectProposal: TribeEventProposals["rejectProposal"] = async (proposal, reviewNote) => {
    if (!acquireSubmitGuard()) {
      return false;
    }

    return runMutation(
      () =>
        decideTribeEventProposalRequest({
          body: { decision: PROPOSAL_DECISION.rejected, reviewNote },
          proposalId: proposal.id,
          tribeSlug,
        }),
      COPY.decisionFailure,
      () => {
        removeReviewedProposal(proposal.id);
      },
      { shouldReloadOnRejection: true }
    );
  };

  const withdrawProposal: TribeEventProposals["withdrawProposal"] = async (proposal) => {
    if (!acquireSubmitGuard()) {
      return false;
    }

    return runMutation(
      () =>
        decideTribeEventProposalRequest({
          body: { decision: PROPOSAL_DECISION.withdrawn },
          proposalId: proposal.id,
          tribeSlug,
        }),
      COPY.decisionFailure,
      (result) => {
        updateLoadedProposals((proposals) =>
          proposals.map((currentProposal) =>
            currentProposal.id === proposal.id ? result.proposal : currentProposal
          )
        );
      },
      { shouldReloadOnRejection: true }
    );
  };

  return {
    approveProposal,
    createProposal,
    isSubmitting,
    loadProposals,
    loadState,
    pendingCount,
    rejectProposal,
    withdrawProposal,
  };
}
