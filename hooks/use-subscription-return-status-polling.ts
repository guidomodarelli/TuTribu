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

type ReturnStatusRequest = {
  providerSubscriptionId: string;
  tribeSlug: string;
};

/**
 * Leaves the return screen when the check ended it: to the resolved
 * destination, or back to the tribe page when the session was lost (the tribe
 * page owns the sign-in handoff, including the in-app browser escape).
 *
 * @returns Whether the page is navigating away.
 */
function navigateToResolvedReturn(
  result: Awaited<ReturnType<typeof fetchSubscriptionReturnStatusRequest>>,
  { providerSubscriptionId, tribeSlug }: ReturnStatusRequest
): boolean {
  if (result.kind === SUBSCRIPTION_RETURN_STATUS_REQUEST_RESULT.resolved) {
    replaceCurrentPageWithUrl(result.redirectPath);
    return true;
  }

  if (result.kind === SUBSCRIPTION_RETURN_STATUS_REQUEST_RESULT.reauthenticate) {
    replaceCurrentPageWithUrl(
      buildSubscriptionReturnPath(tribeSlug, providerSubscriptionId)
    );
    return true;
  }

  return false;
}

type ReturnStatusPollingRun = ReturnStatusRequest & {
  /** A manual retry checks immediately; the first run waits the first delay. */
  isManualRetry: boolean;
  setPhase: (phase: SubscriptionReturnPollingPhase) => void;
};

/**
 * Runs the checks of one polling run.
 *
 * @returns Cleanup that aborts the in-flight check and clears the timer.
 */
function startReturnStatusPolling({
  isManualRetry,
  providerSubscriptionId,
  setPhase,
  tribeSlug,
}: ReturnStatusPollingRun): () => void {
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

    if (
      controller.signal.aborted ||
      navigateToResolvedReturn(result, { providerSubscriptionId, tribeSlug })
    ) {
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
    isManualRetry
      ? MANUAL_RETRY_DELAY_MS
      : getSubscriptionReturnPollDelayMs(completedAttempts)
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
}

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

  useEffect(
    () =>
      startReturnStatusPolling({
        isManualRetry: pollingRunId !== INITIAL_POLLING_RUN_ID,
        providerSubscriptionId,
        setPhase,
        tribeSlug,
      }),
    [pollingRunId, providerSubscriptionId, tribeSlug]
  );

  const retry = useCallback(() => {
    setPhase(SUBSCRIPTION_RETURN_POLLING_PHASE.checking);
    setPollingRunId((currentRunId) => currentRunId + 1);
  }, []);

  return { phase, retry };
}
