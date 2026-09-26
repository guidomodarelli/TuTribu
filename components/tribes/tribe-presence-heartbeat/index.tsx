"use client";

import { useParams } from "next/navigation";
import { useEffect } from "react";

const PRESENCE_HEARTBEAT = {
  apiPrefix: "/api/tribes/",
  intervalMs: 60000,
  method: "POST",
  /**
   * Minimum time between a tab becoming visible and the previous touch, so
   * quickly switching tabs back and forth does not flood the endpoint.
   */
  minimumVisibilityGapMs: 30000,
  presenceSegment: "/presence",
  visibleState: "visible",
} as const;

type TribeRouteParams = {
  slug?: string;
};

function buildPresenceEndpoint(tribeSlug: string): string {
  return (
    PRESENCE_HEARTBEAT.apiPrefix +
    encodeURIComponent(tribeSlug) +
    PRESENCE_HEARTBEAT.presenceSegment
  );
}

/**
 * Refreshes the viewer membership `last_seen_at` while a tribe page is open,
 * powering the "online" counter of the tribe about page. The touch is a silent
 * best-effort: a failed ping must never disturb the page, and the server
 * no-ops for non-members.
 *
 * The tribe slug comes from the route through `useParams` rather than from a
 * server prop: reading `params` in the tribe layout would tie its App Shell to
 * one URL and block instant navigation for every tribe route, while the
 * client router already knows the slug on both page loads and navigations.
 */
export function TribePresenceHeartbeat() {
  const routeParams = useParams<TribeRouteParams>();
  const tribeSlug = routeParams?.slug ?? null;

  useEffect(() => {
    if (!tribeSlug) {
      return undefined;
    }

    let lastTouchAt: number | null = null;

    const touchPresence = () => {
      if (document.visibilityState !== PRESENCE_HEARTBEAT.visibleState) {
        return;
      }

      lastTouchAt = Date.now();
      void fetch(buildPresenceEndpoint(tribeSlug), {
        method: PRESENCE_HEARTBEAT.method,
      }).catch(() => {
        // Deliberate no-op: presence is cosmetic and retries on the next tick.
      });
    };

    const touchPresenceWhenVisibleAgain = () => {
      if (
        lastTouchAt !== null &&
        Date.now() - lastTouchAt < PRESENCE_HEARTBEAT.minimumVisibilityGapMs
      ) {
        return;
      }

      touchPresence();
    };

    touchPresence();

    const intervalId = window.setInterval(
      touchPresence,
      PRESENCE_HEARTBEAT.intervalMs
    );

    document.addEventListener("visibilitychange", touchPresenceWhenVisibleAgain);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener(
        "visibilitychange",
        touchPresenceWhenVisibleAgain
      );
    };
  }, [tribeSlug]);

  return null;
}
