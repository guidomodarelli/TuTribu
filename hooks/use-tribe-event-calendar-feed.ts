"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "beez-ui";

import { copyTextToClipboard } from "@/lib/browser-clipboard";
import {
  fetchTribeEventCalendarFeedRequest,
  issueTribeEventCalendarFeedRequest,
  revokeTribeEventCalendarFeedRequest,
} from "@/lib/events/tribe-event-calendar-feed-api-client";
import type { TribeEventCalendarFeedSubscriptionResult } from "@/src/modules/events/application/results/tribe-event-result";

/**
 * Lifecycle of the subscription state shown by the calendar feed dialog.
 */
export const TRIBE_EVENT_CALENDAR_FEED_LOAD_STATUS = {
  error: "error",
  idle: "idle",
  loaded: "loaded",
  loading: "loading",
} as const;

export type TribeEventCalendarFeedLoadState =
  | { status: typeof TRIBE_EVENT_CALENDAR_FEED_LOAD_STATUS.idle }
  | { status: typeof TRIBE_EVENT_CALENDAR_FEED_LOAD_STATUS.loading }
  | { message: string; status: typeof TRIBE_EVENT_CALENDAR_FEED_LOAD_STATUS.error }
  | {
      status: typeof TRIBE_EVENT_CALENDAR_FEED_LOAD_STATUS.loaded;
      subscription: TribeEventCalendarFeedSubscriptionResult | null;
    };

export type TribeEventCalendarFeed = {
  copyFeedUrl: () => Promise<void>;
  /** Link issued in this dialog session; shown once and forgotten on `reset`. */
  feedUrl: string | null;
  generateLink: () => Promise<boolean>;
  isSubmitting: boolean;
  loadState: TribeEventCalendarFeedLoadState;
  loadSubscription: () => void;
  /**
   * Forgets the issued link, aborts a pending load and invalidates pending
   * mutations so a late response cannot reveal the link (dialog closed).
   */
  reset: () => void;
  revokeLink: () => Promise<boolean>;
};

const COPY = {
  copied: "Link copiado.",
  copyFailure: "No pudimos copiar el link.",
  generateFailure: "No pudimos generar tu link. Intentá de nuevo.",
  generateSuccess: "Link listo.",
  generating: "Generando tu link…",
  loadFailure: "No pudimos cargar tu suscripción al calendario.",
  revokeFailure: "No pudimos desactivar la suscripción. Intentá de nuevo.",
  revokeSuccess: "Suscripción desactivada.",
  revoking: "Desactivando la suscripción…",
} as const;
const ABORT_ERROR_NAME = "AbortError";

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === ABORT_ERROR_NAME;
}

/**
 * Error thrown into `toast.promise` so a failed request shows the safe route
 * message (or the fallback) in the error toast.
 */
function toRequestError(message: string | null, fallback: string): Error {
  return new Error(message ?? fallback);
}

/**
 * Client state of the personal calendar subscription: loads whether a link
 * exists (on demand, with an AbortController so a stale load never
 * overwrites a newer one), generates or regenerates it (the plain link lives
 * only in this state and disappears on `reset`), revokes it, and copies it
 * with the WebKit-safe clipboard fallback. Mutations update the local state
 * from the response and never refresh the route; a ref guards against double
 * submits, and a dialog session counter drops mutation results that arrive
 * after `reset` so a forgotten link never comes back.
 *
 * @param input - Tribe of the calendar.
 * @returns State and callbacks for the presentational dialog.
 */
export function useTribeEventCalendarFeed({
  tribeSlug,
}: {
  tribeSlug: string;
}): TribeEventCalendarFeed {
  const [loadState, setLoadState] = useState<TribeEventCalendarFeedLoadState>({
    status: TRIBE_EVENT_CALENDAR_FEED_LOAD_STATUS.idle,
  });
  const [feedUrl, setFeedUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);
  const loadControllerRef = useRef<AbortController | null>(null);
  // Bumped on `reset`: a mutation started in a previous dialog session must
  // not write its result into the current one.
  const dialogSessionRef = useRef(0);

  useEffect(() => () => loadControllerRef.current?.abort(), []);

  const loadSubscription = () => {
    loadControllerRef.current?.abort();

    const controller = new AbortController();

    loadControllerRef.current = controller;
    setFeedUrl(null);
    setLoadState({ status: TRIBE_EVENT_CALENDAR_FEED_LOAD_STATUS.loading });

    fetchTribeEventCalendarFeedRequest({ signal: controller.signal, tribeSlug })
      .then((result) => {
        if (controller.signal.aborted) {
          return;
        }

        setLoadState(
          result.isSuccess
            ? {
                status: TRIBE_EVENT_CALENDAR_FEED_LOAD_STATUS.loaded,
                subscription: result.subscription,
              }
            : {
                message: result.message ?? COPY.loadFailure,
                status: TRIBE_EVENT_CALENDAR_FEED_LOAD_STATUS.error,
              }
        );
      })
      .catch((error: unknown) => {
        // An aborted load was replaced by a newer one (or the dialog closed).
        if (isAbortError(error) || controller.signal.aborted) {
          return;
        }

        setLoadState({ message: COPY.loadFailure, status: TRIBE_EVENT_CALENDAR_FEED_LOAD_STATUS.error });
      });
  };

  /**
   * Shared guard and `toast.promise` lifecycle of both mutations. The request
   * promise rejects on a failed response so the toast shows the error copy.
   */
  const runMutation = async <TResult extends { isSuccess: boolean; message: string | null }>(
    request: () => Promise<TResult>,
    copy: { failure: string; loading: string; success: string },
    onSuccess: (result: Extract<TResult, { isSuccess: true }>) => void,
    onRejected?: (result: Extract<TResult, { isSuccess: false }>) => void
  ): Promise<boolean> => {
    if (isSubmittingRef.current) {
      return false;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);

    const dialogSession = dialogSessionRef.current;

    const pendingRequest = request().then((result) => {
      if (!result.isSuccess) {
        if (dialogSession === dialogSessionRef.current) {
          onRejected?.(result as Extract<TResult, { isSuccess: false }>);
        }

        throw toRequestError(result.message, copy.failure);
      }

      return result as Extract<TResult, { isSuccess: true }>;
    });

    toast.promise(pendingRequest, {
      error: (error: unknown) => (error instanceof Error ? error.message : copy.failure),
      loading: copy.loading,
      success: copy.success,
    });

    try {
      const result = await pendingRequest;

      // The dialog was closed (and maybe reopened) while the request was in
      // flight: the issued link must stay forgotten.
      if (dialogSession !== dialogSessionRef.current) {
        return false;
      }

      onSuccess(result);
      return true;
    } catch {
      // The error toast is already shown by `toast.promise`; keep the state.
      return false;
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  /**
   * Sends the subscription on screen as the precondition. When the server
   * answers that it changed (another tab or a retry won), the state is
   * reloaded so the next attempt starts from the active link.
   */
  const generateLink = () => {
    const expectedSubscriptionId =
      loadState.status === TRIBE_EVENT_CALENDAR_FEED_LOAD_STATUS.loaded
        ? (loadState.subscription?.id ?? null)
        : null;

    return runMutation(
      () => issueTribeEventCalendarFeedRequest({ expectedSubscriptionId, tribeSlug }),
      { failure: COPY.generateFailure, loading: COPY.generating, success: COPY.generateSuccess },
      (result) => {
        setFeedUrl(result.feedUrl);
        setLoadState({
          status: TRIBE_EVENT_CALENDAR_FEED_LOAD_STATUS.loaded,
          subscription: result.subscription,
        });
      },
      (result) => {
        if (result.isSubscriptionChanged) {
          loadSubscription();
        }
      }
    );
  };

  const revokeLink = () =>
    runMutation(
      () => revokeTribeEventCalendarFeedRequest({ tribeSlug }),
      { failure: COPY.revokeFailure, loading: COPY.revoking, success: COPY.revokeSuccess },
      () => {
        setFeedUrl(null);
        setLoadState({ status: TRIBE_EVENT_CALENDAR_FEED_LOAD_STATUS.loaded, subscription: null });
      }
    );

  const copyFeedUrl = async () => {
    if (!feedUrl) {
      return;
    }

    if (await copyTextToClipboard(feedUrl)) {
      toast.success(COPY.copied);
    } else {
      toast.error(COPY.copyFailure);
    }
  };

  const reset = () => {
    dialogSessionRef.current += 1;
    loadControllerRef.current?.abort();
    setFeedUrl(null);
    setLoadState({ status: TRIBE_EVENT_CALENDAR_FEED_LOAD_STATUS.idle });
  };

  return {
    copyFeedUrl,
    feedUrl,
    generateLink,
    isSubmitting,
    loadState,
    loadSubscription,
    reset,
    revokeLink,
  };
}
