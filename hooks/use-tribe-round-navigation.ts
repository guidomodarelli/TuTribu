"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { fetchTribeRoundPageRequest } from "@/lib/messages/tribe-round-api-client";
import {
  buildTribeRoundPageHref,
  isSameTribeRoundLocation,
  readTribeRoundLocation,
  type TribeRoundLocation,
} from "@/lib/messages/tribe-round-location";
import { ROUTES } from "@/src/constants/routes";
import type { TribeRoundResult } from "@/src/modules/messages/application/results/tribe-round-result";

/**
 * In-place navigation between round pages (channel chips and pagination) of
 * the tribe home. Instead of a server navigation, which re-renders the whole
 * page (access checks, events agenda) and remounts the round, it loads only
 * the requested page from `GET /api/tribes/[slug]/messages`, hands it to the
 * round, and mirrors `?channel=&page=` in the URL through the History API so
 * the page stays shareable and Back/Forward keep working.
 *
 * - A newer navigation (or Back/Forward) aborts the previous request, and a
 *   response that is no longer the latest request is ignored.
 * - The URL only changes after the page loaded, so it always describes what
 *   is shown; a failed load keeps the previous page and exposes a Spanish
 *   error with a retry.
 */

const HISTORY_MODE = {
  /** Back/Forward already moved the URL: load without touching history. */
  none: "none",
  /** A click: add a history entry once the page loaded. */
  push: "push",
} as const;

type HistoryMode = (typeof HISTORY_MODE)[keyof typeof HISTORY_MODE];

type RoundNavigationRequest = {
  historyMode: HistoryMode;
  location: TribeRoundLocation;
};

const POPSTATE_EVENT = "popstate";
const HISTORY_UNUSED_TITLE = "";

export const TRIBE_ROUND_NAVIGATION_COPY = {
  loadFailure: "No pudimos cargar los mensajes. Intentá de nuevo.",
} as const;

export type TribeRoundNavigation = {
  /** Safe Spanish error of the last failed load, or `null`. */
  errorMessage: string | null;
  /** Whether a round page is loading (previous content stays visible). */
  isLoading: boolean;
  /**
   * Loads a round page and, once loaded, adds it to the browser history.
   * Resolves when that navigation settles (loaded, failed, or superseded).
   */
  navigateToLocation: (location: TribeRoundLocation) => Promise<void>;
  /** Requested location while it loads, or `null`. */
  pendingLocation: TribeRoundLocation | null;
  /** Repeats the last failed load. */
  retry: () => void;
};

type UseTribeRoundNavigationInput = {
  /** Location of the round rendered by the server. */
  initialLocation: TribeRoundLocation;
  /** Applies a loaded round page to the view. */
  onRoundLoaded: (round: TribeRoundResult, location: TribeRoundLocation) => void;
  tribeSlug: string;
};

/**
 * @param input - Tribe slug, the server-rendered location, and the callback
 * that applies a loaded page.
 * @returns Navigation state and actions for the round controls.
 */
export function useTribeRoundNavigation({
  initialLocation,
  onRoundLoaded,
  tribeSlug,
}: UseTribeRoundNavigationInput): TribeRoundNavigation {
  const [pendingLocation, setPendingLocation] = useState<TribeRoundLocation | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const displayedLocationRef = useRef(initialLocation);
  const abortControllerRef = useRef<AbortController | null>(null);
  const requestSequenceRef = useRef(0);
  const failedRequestRef = useRef<RoundNavigationRequest | null>(null);
  const onRoundLoadedRef = useRef(onRoundLoaded);

  useEffect(() => {
    onRoundLoadedRef.current = onRoundLoaded;
  });

  const loadRoundPage = useCallback(
    async ({ historyMode, location }: RoundNavigationRequest): Promise<void> => {
      abortControllerRef.current?.abort();
      requestSequenceRef.current += 1;
      const requestSequence = requestSequenceRef.current;

      if (isSameTribeRoundLocation(location, displayedLocationRef.current)) {
        // Selecting the page already shown only cancels a pending load.
        abortControllerRef.current = null;
        failedRequestRef.current = null;
        setPendingLocation(null);
        setErrorMessage(null);
        return;
      }

      const abortController = new AbortController();
      abortControllerRef.current = abortController;
      setPendingLocation(location);
      setErrorMessage(null);

      const isLatestRequest = () =>
        requestSequenceRef.current === requestSequence && !abortController.signal.aborted;

      try {
        const result = await fetchTribeRoundPageRequest({
          ...location,
          signal: abortController.signal,
          tribeSlug,
        });

        if (!isLatestRequest()) {
          return;
        }

        if (!result.isSuccess) {
          failedRequestRef.current = { historyMode, location };
          setErrorMessage(result.message ?? TRIBE_ROUND_NAVIGATION_COPY.loadFailure);
          return;
        }

        displayedLocationRef.current = location;
        failedRequestRef.current = null;
        onRoundLoadedRef.current(result.round, location);

        if (historyMode === HISTORY_MODE.push) {
          window.history.pushState(
            null,
            HISTORY_UNUSED_TITLE,
            buildTribeRoundPageHref({ ...location, tribeSlug })
          );
        }
      } catch {
        // An aborted request was superseded on purpose (newer navigation or
        // unmount): the newer flow owns the view. Any other rejection is a
        // network failure, reported with the safe fallback copy.
        if (isLatestRequest()) {
          failedRequestRef.current = { historyMode, location };
          setErrorMessage(TRIBE_ROUND_NAVIGATION_COPY.loadFailure);
        }
      } finally {
        if (requestSequenceRef.current === requestSequence) {
          abortControllerRef.current = null;
          setPendingLocation(null);
        }
      }
    },
    [tribeSlug]
  );

  const navigateToLocation = useCallback(
    (location: TribeRoundLocation) =>
      loadRoundPage({ historyMode: HISTORY_MODE.push, location }),
    [loadRoundPage]
  );

  const retry = useCallback(() => {
    if (failedRequestRef.current) {
      void loadRoundPage(failedRequestRef.current);
    }
  }, [loadRoundPage]);

  // Back/Forward only change the URL (the History API entries share the
  // server-rendered tree), so the round follows the query of the entry.
  useEffect(() => {
    const handlePopState = () => {
      if (window.location.pathname !== ROUTES.tribes.bySlug(tribeSlug)) {
        return;
      }

      void loadRoundPage({
        historyMode: HISTORY_MODE.none,
        location: readTribeRoundLocation(window.location.search),
      });
    };

    window.addEventListener(POPSTATE_EVENT, handlePopState);

    return () => window.removeEventListener(POPSTATE_EVENT, handlePopState);
  }, [loadRoundPage, tribeSlug]);

  useEffect(
    () => () => {
      abortControllerRef.current?.abort();
    },
    []
  );

  return {
    errorMessage,
    isLoading: pendingLocation !== null,
    navigateToLocation,
    pendingLocation,
    retry,
  };
}
