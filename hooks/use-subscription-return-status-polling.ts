"use client";

import { useCallback, useEffect, useState } from "react";

import { replaceCurrentPageWithUrl } from "@/lib/browser-navigation";
import { buildSubscriptionReturnPath } from "@/lib/subscriptions/subscription-return-path";
import {
  SUBSCRIPTION_RETURN_POLLING,
  SUBSCRIPTION_RETURN_POLLING_PHASE,
  getSubscriptionReturnPollDelayMs,
  type SubscriptionReturnPollingPhase,
} from "@/lib/subscriptions/subscription-return-polling";
import {
  SUBSCRIPTION_RETURN_STATUS_REQUEST_RESULT,
  fetchSubscriptionReturnStatusRequest,
} from "@/lib/subscriptions/subscription-return-status-api-client";

const VISIBLE_DOCUMENT_STATE = "visible";
const VISIBILITY_CHANGE_EVENT = "visibilitychange";
const MANUAL_RETRY_DELAY_MS = 0;
const INITIAL_POLLING_RUN_ID = 0;

export type SubscriptionReturnStatusPolling = {
  phase: SubscriptionReturnPollingPhase;
  /** Starts a new run of automatic checks, the first one immediately. */
  retry: () => void;
};

/**
 * Polls the Mercado Pago return status (container side) until the server
 * resolves a destination, then performs a real navigation there: activating
 * a subscription changes the member's access, so the next page must render
 * from scratch (`location.replace`, so Back does not return to this screen).
 *
 * Checks back off exponentially (3 s → 30 s) and stop after
 * `SUBSCRIPTION_RETURN_POLLING.maxAttempts`, when the phase becomes
 * `exhausted` and `retry` starts a new run. Only one check is in flight at a
 * time; a hidden tab defers the next check until it becomes visible again.
 * Unmounting (or a new run) aborts the in-flight request and clears the timer,
 * so a stale response never navigates or updates state.
 *
 * @param input - Tribe slug and Mercado Pago preapproval id of the return.
 * @returns Current phase and the manual retry callback.
 */
export function useSubscriptionReturnStatusPolling(input: {
  providerSubscriptionId: string;
  tribeSlug: string;
}): SubscriptionReturnStatusPolling {
  const { providerSubscriptionId, tribeSlug } = input;
  const [phase, setPhase] = useState<SubscriptionReturnPollingPhase>(
    SUBSCRIPTION_RETURN_POLLING_PHASE.checking
  );
  const [pollingRunId, setPollingRunId] = useState(INITIAL_POLLING_RUN_ID);

  useEffect(() => {
    const controller = new AbortController();
    let completedAttempts = 0;
    let pollTimeoutId: number | null = null;
    let isWaitingForVisibleDocument = false;

    const scheduleCheck = (delayMs: number) => {
      pollTimeoutId = window.setTimeout(() => {
        pollTimeoutId = null;
        void runCheck();
      }, delayMs);
    };

    const runCheck = async () => {
      if (document.visibilityState !== VISIBLE_DOCUMENT_STATE) {
        isWaitingForVisibleDocument = true;
        return;
      }

      completedAttempts += 1;

      const result = await fetchSubscriptionReturnStatusRequest({
        providerSubscriptionId,
        signal: controller.signal,
        tribeSlug,
      });

      if (controller.signal.aborted) {
        return;
      }

      if (result.kind === SUBSCRIPTION_RETURN_STATUS_REQUEST_RESULT.resolved) {
        replaceCurrentPageWithUrl(result.redirectPath);
        return;
      }

      if (
        result.kind === SUBSCRIPTION_RETURN_STATUS_REQUEST_RESULT.reauthenticate
      ) {
        // The tribe page owns the sign-in handoff (including the in-app
        // browser escape), so a lost session goes back to it.
        replaceCurrentPageWithUrl(
          buildSubscriptionReturnPath(tribeSlug, providerSubscriptionId)
        );
        return;
      }

      if (completedAttempts >= SUBSCRIPTION_RETURN_POLLING.maxAttempts) {
        setPhase(SUBSCRIPTION_RETURN_POLLING_PHASE.exhausted);
        return;
      }

      scheduleCheck(getSubscriptionReturnPollDelayMs(completedAttempts));
    };

    const handleVisibilityChange = () => {
      if (
        !isWaitingForVisibleDocument ||
        document.visibilityState !== VISIBLE_DOCUMENT_STATE
      ) {
        return;
      }

      isWaitingForVisibleDocument = false;
      void runCheck();
    };

    document.addEventListener(VISIBILITY_CHANGE_EVENT, handleVisibilityChange);
    scheduleCheck(
      pollingRunId === INITIAL_POLLING_RUN_ID
        ? getSubscriptionReturnPollDelayMs(completedAttempts)
        : MANUAL_RETRY_DELAY_MS
    );

    return () => {
      controller.abort();

      if (pollTimeoutId !== null) {
        window.clearTimeout(pollTimeoutId);
      }

      document.removeEventListener(
        VISIBILITY_CHANGE_EVENT,
        handleVisibilityChange
      );
    };
  }, [pollingRunId, providerSubscriptionId, tribeSlug]);

  const retry = useCallback(() => {
    setPhase(SUBSCRIPTION_RETURN_POLLING_PHASE.checking);
    setPollingRunId((currentRunId) => currentRunId + 1);
  }, []);

  return { phase, retry };
}
