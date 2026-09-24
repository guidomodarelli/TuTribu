"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "beez-ui";

import {
  approveTribeEventProposalRequest,
  createTribeEventProposalRequest,
  decideTribeEventProposalRequest,
  fetchTribeEventProposalsRequest,
  type TribeEventProposalPayload,
} from "@/lib/events/tribe-event-proposals-api-client";
import type { TribeEventSavePayload } from "@/lib/events/tribe-events-api-client";
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
  /** Pending proposals counted by the server for managers (0 otherwise). */
  initialPendingCount: number;
  /** Visible `YYYY-MM` month, sent so an approval returns its occurrences. */
  month: string;
  /** Patches the calendar with the slots of the event an approval created. */
  onEventCreated: (eventId: string, occurrences: TribeEventOccurrenceResult[]) => void;
  tribeSlug: string;
};

export type TribeEventProposals = {
  approveProposal: (
    proposal: TribeEventProposalResult,
    payload: TribeEventSavePayload
  ) => Promise<boolean>;
  createProposal: (payload: TribeEventProposalPayload) => Promise<boolean>;
  isSubmitting: boolean;
  loadProposals: () => void;
  loadState: TribeEventProposalsLoadState;
  pendingCount: number;
  rejectProposal: (proposal: TribeEventProposalResult, reviewNote: string) => Promise<boolean>;
  withdrawProposal: (proposal: TribeEventProposalResult) => Promise<boolean>;
};

const COPY = {
  approveFailure: "No pudimos aprobar la propuesta.",
  createFailure: "No pudimos enviar la propuesta.",
  decisionFailure: "No pudimos actualizar la propuesta.",
  loadFailure: "No pudimos cargar las propuestas.",
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
 * Client state of member proposals: the panel list (loaded on demand with an
 * AbortController so a stale load never overwrites a newer one), the
 * manager pending counter, and the create/approve/reject/withdraw mutations
 * with a ref guard against double submits. Mutations patch local state from
 * the route response instead of refreshing the route; when a review fails
 * (for example another manager resolved the proposal first) the list is
 * reloaded so it never shows a stale pending proposal.
 *
 * @param input - Tribe, visible month, server pending count, and the calendar
 * patch callback.
 * @returns List state, pending count, and mutation callbacks resolving to
 * `true` when the change was stored.
 */
export function useTribeEventProposals({
  initialPendingCount,
  month,
  onEventCreated,
  tribeSlug,
}: UseTribeEventProposalsInput): TribeEventProposals {
  const [loadState, setLoadState] = useState<TribeEventProposalsLoadState>({
    status: TRIBE_EVENT_PROPOSALS_LOAD_STATUS.idle,
  });
  const [pendingCountState, setPendingCountState] = useState({
    count: initialPendingCount,
    source: initialPendingCount,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);
  const loadControllerRef = useRef<AbortController | null>(null);
  const visibleMonthRef = useRef(month);
  // A new server count (month navigation) replaces the local one.
  const pendingCount =
    pendingCountState.source === initialPendingCount
      ? pendingCountState.count
      : initialPendingCount;

  useEffect(() => {
    visibleMonthRef.current = month;
  }, [month]);

  useEffect(() => () => loadControllerRef.current?.abort(), []);

  const updatePendingCount = (updater: (count: number) => number) => {
    setPendingCountState((currentState) => ({
      count: updater(
        currentState.source === initialPendingCount ? currentState.count : initialPendingCount
      ),
      source: initialPendingCount,
    }));
  };

  const loadProposals = () => {
    loadControllerRef.current?.abort();

    const controller = new AbortController();

    loadControllerRef.current = controller;
    setLoadState({ status: TRIBE_EVENT_PROPOSALS_LOAD_STATUS.loading });

    fetchTribeEventProposalsRequest({ signal: controller.signal, tribeSlug })
      .then((result) => {
        if (controller.signal.aborted) {
          return;
        }

        if (!result.isSuccess) {
          setLoadState({
            message: result.message ?? COPY.loadFailure,
            status: TRIBE_EVENT_PROPOSALS_LOAD_STATUS.error,
          });
          return;
        }

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

        setLoadState({ message: COPY.loadFailure, status: TRIBE_EVENT_PROPOSALS_LOAD_STATUS.error });
      });
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
   * Shared guard, toasts, and failure recovery of every proposal mutation.
   */
  const runMutation = async <TResult extends { isSuccess: boolean; message: string | null }>(
    request: () => Promise<TResult>,
    failureCopy: string,
    onSuccess: (result: TResult) => void,
    shouldReloadOnFailure: boolean
  ): Promise<boolean> => {
    if (isSubmittingRef.current) {
      return false;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);

    try {
      const result = await request();

      if (!result.isSuccess) {
        toast.error(result.message ?? failureCopy);

        if (shouldReloadOnFailure) {
          loadProposals();
        }

        return false;
      }

      onSuccess(result);
      toast.success(result.message ?? COPY.saved);
      return true;
    } catch {
      // Network failure: the route never answered, so show the safe fallback.
      toast.error(failureCopy);
      return false;
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const createProposal: TribeEventProposals["createProposal"] = (payload) =>
    runMutation(
      () => createTribeEventProposalRequest({ payload, tribeSlug }),
      COPY.createFailure,
      (result) => {
        if (result.isSuccess) {
          updateLoadedProposals((proposals) => [result.proposal, ...proposals]);
        }
      },
      false
    );

  const approveProposal: TribeEventProposals["approveProposal"] = (proposal, payload) => {
    const requestMonth = month;

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
        if (!result.isSuccess) {
          return;
        }

        updateLoadedProposals((proposals) =>
          proposals.filter((currentProposal) => currentProposal.id !== proposal.id)
        );
        updatePendingCount((count) => Math.max(count - 1, 0));

        if (visibleMonthRef.current === requestMonth) {
          onEventCreated(result.eventId, result.occurrences);
        }
      },
      true
    );
  };

  const rejectProposal: TribeEventProposals["rejectProposal"] = (proposal, reviewNote) =>
    runMutation(
      () =>
        decideTribeEventProposalRequest({
          body: { decision: PROPOSAL_DECISION.rejected, reviewNote },
          proposalId: proposal.id,
          tribeSlug,
        }),
      COPY.decisionFailure,
      () => {
        updateLoadedProposals((proposals) =>
          proposals.filter((currentProposal) => currentProposal.id !== proposal.id)
        );
        updatePendingCount((count) => Math.max(count - 1, 0));
      },
      true
    );

  const withdrawProposal: TribeEventProposals["withdrawProposal"] = (proposal) =>
    runMutation(
      () =>
        decideTribeEventProposalRequest({
          body: { decision: PROPOSAL_DECISION.withdrawn },
          proposalId: proposal.id,
          tribeSlug,
        }),
      COPY.decisionFailure,
      (result) => {
        if (result.isSuccess) {
          updateLoadedProposals((proposals) =>
            proposals.map((currentProposal) =>
              currentProposal.id === proposal.id ? result.proposal : currentProposal
            )
          );
        }
      },
      true
    );

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
