"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { toast } from "beez-ui";

import { pushCurrentUrlSearchParams } from "@/lib/browser-navigation";
import {
  fetchTribeEventMonthListingRequest,
  type TribeEventMonthListing,
} from "@/lib/events/tribe-events-api-client";
import { parseMonth } from "@/src/modules/events/application/services/buenos-aires-month";
import { TRIBE_EVENTS_ROUTE_QUERY } from "@/src/modules/events/constants/tribe-events";

type UseTribeEventsMonthNavigationInput = {
  /**
   * Runs after another month replaced the one on screen, so the caller can
   * drop state that belongs to the previous month (the open detail).
   */
  onMonthLoaded: () => void;
  /** Month listing rendered by the server; a new one replaces client state. */
  serverListing: TribeEventMonthListing;
  tribeSlug: string;
};

export type TribeEventsMonthNavigation = {
  /** Month on screen: the server listing or the last month loaded here. */
  listing: TribeEventMonthListing;
  /** Month whose listing is being loaded, or null when none is. */
  loadingMonth: string | null;
  /** Loads `month` in place and adds it to the history (month links, swipe). */
  navigateToMonth: (month: string) => void;
};

/** Listing on screen and the server listing it was loaded on top of. */
type MonthListingState = {
  listing: TribeEventMonthListing;
  sourceListing: TribeEventMonthListing;
};

type MonthLoadingState = {
  month: string;
  sourceListing: TribeEventMonthListing;
};

const POPSTATE_EVENT = "popstate";
const ABORT_ERROR_NAME = "AbortError";
const COPY = {
  loadFailure: "No pudimos cargar los eventos de ese mes. Probá de nuevo.",
} as const;

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === ABORT_ERROR_NAME;
}

/**
 * Reads a valid `month` query of the current address, if any.
 *
 * @returns The `YYYY-MM` month of the address, or null when absent or malformed.
 */
function readAddressMonth(): string | null {
  const month = new URL(window.location.href).searchParams.get(TRIBE_EVENTS_ROUTE_QUERY.month);

  return month !== null && parseMonth(month) !== null ? month : null;
}

/**
 * Changes the visible month of the tribe events calendar without rendering
 * the page again on the server: the page renders the first month (deep links
 * and sign-in callbacks included) and every later month comes from
 * `GET /api/tribes/[slug]/events?month=`. Only the month listing changes, so
 * the streak, permissions, pending proposals, and type filter stay as they are.
 *
 * A month link, "Hoy", or a swipe adds a history entry with the new `month`
 * once the listing arrives (`pushState`, the address is never ahead of the
 * screen); Back and Forward (`popstate`) load the month of the entry the
 * browser moved to, or the server month when the entry has none. Each load
 * aborts the one in flight, so a slower answer for a month the viewer already
 * left never lands, and a new server listing replaces the client month and
 * aborts its load. A failed load keeps the month on screen and shows the
 * route's safe message, or a fallback, in a toast.
 *
 * @param input - Server listing, tribe slug, and the month change callback.
 * @returns The listing on screen, the month being loaded, and the navigation callback.
 */
export function useTribeEventsMonthNavigation({
  onMonthLoaded,
  serverListing,
  tribeSlug,
}: UseTribeEventsMonthNavigationInput): TribeEventsMonthNavigation {
  const [listingState, setListingState] = useState<MonthListingState>({
    listing: serverListing,
    sourceListing: serverListing,
  });
  const [loadingState, setLoadingState] = useState<MonthLoadingState | null>(null);
  const requestControllerRef = useRef<AbortController | null>(null);
  const listing =
    listingState.sourceListing === serverListing ? listingState.listing : serverListing;
  const loadingMonth =
    loadingState?.sourceListing === serverListing ? loadingState.month : null;

  const abortMonthRequest = () => {
    requestControllerRef.current?.abort();
    requestControllerRef.current = null;
  };

  /**
   * Requests one month listing, replacing the request in flight. State only
   * changes once the answer settles, so a mount effect may call it too.
   *
   * @param month - Requested `YYYY-MM` month.
   * @param shouldPushHistoryEntry - Whether the loaded month adds a history
   * entry (a month link, "Hoy", or a swipe) or follows the one the browser
   * already shows (Back, Forward, or a restored page).
   */
  const requestMonth = (month: string, shouldPushHistoryEntry: boolean) => {
    abortMonthRequest();

    const controller = new AbortController();
    const requestSourceListing = serverListing;
    const settleRequest = (): boolean => {
      if (controller.signal.aborted) {
        return false;
      }

      requestControllerRef.current = null;
      setLoadingState(null);

      return true;
    };

    requestControllerRef.current = controller;

    fetchTribeEventMonthListingRequest({ month, signal: controller.signal, tribeSlug })
      .then((result) => {
        if (!settleRequest()) {
          return;
        }

        if (!result.isSuccess) {
          toast.error(result.message ?? COPY.loadFailure);
          return;
        }

        setListingState({ listing: result.listing, sourceListing: requestSourceListing });

        if (shouldPushHistoryEntry) {
          pushCurrentUrlSearchParams({
            [TRIBE_EVENTS_ROUTE_QUERY.event]: null,
            [TRIBE_EVENTS_ROUTE_QUERY.month]: result.listing.month.current,
          });
        }

        onMonthLoaded();
      })
      .catch((error: unknown) => {
        // An abort means a newer month or server listing took over; any other
        // rejection is a network failure shown with the safe fallback copy.
        if (isAbortError(error) || !settleRequest()) {
          return;
        }

        toast.error(COPY.loadFailure);
      });
  };

  /**
   * Loads `month` with loading feedback, from a month link or the history.
   * A month already on screen ("Hoy" on the current month, or Back to it
   * while another one loads) only cancels the pending load.
   */
  const loadMonth = (month: string, shouldPushHistoryEntry: boolean) => {
    if (month === listing.month.current) {
      abortMonthRequest();
      setLoadingState(null);
      return;
    }

    setLoadingState({ month, sourceListing: serverListing });
    requestMonth(month, shouldPushHistoryEntry);
  };

  const followHistoryEntry = useEffectEvent(() => {
    loadMonth(readAddressMonth() ?? serverListing.month.current, false);
  });

  const syncRestoredAddressMonth = useEffectEvent(() => {
    const addressMonth = readAddressMonth();
    const hasDeepLink = new URL(window.location.href).searchParams.has(
      TRIBE_EVENTS_ROUTE_QUERY.event
    );

    // A page restored for a history entry the calendar pushed can render the
    // server month of an older entry; the address tells which month belongs
    // there. A deep link is exempt: the route may list its occurrence in
    // another month than the link says, and the calendar rewrites the address.
    // The server month stays on screen, without the loading state, until the
    // answer arrives: state cannot change synchronously from a mount effect.
    if (!hasDeepLink && addressMonth !== null && addressMonth !== serverListing.month.current) {
      requestMonth(addressMonth, false);
    }
  });

  useEffect(() => {
    const handlePopState = () => followHistoryEntry();

    syncRestoredAddressMonth();
    window.addEventListener(POPSTATE_EVENT, handlePopState);

    return () => window.removeEventListener(POPSTATE_EVENT, handlePopState);
  }, []);

  // A new server listing wins over the month loaded here, so a load still in
  // flight for the previous listing must not land on top of it. The cleanup
  // also runs on unmount, which cancels the load in flight.
  useEffect(() => {
    return () => {
      requestControllerRef.current?.abort();
      requestControllerRef.current = null;
    };
  }, [serverListing]);

  return {
    listing,
    loadingMonth,
    navigateToMonth: (month) => loadMonth(month, true),
  };
}
