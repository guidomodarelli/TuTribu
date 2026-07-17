"use client";

import { useEffect } from "react";

const PRESENCE_HEARTBEAT = {
  apiPrefix: "/api/tribes/",
  intervalMs: 60000,
  method: "POST",
  presenceSegment: "/presence",
  visibleState: "visible",
} as const;

type TribePresenceHeartbeatProps = {
  tribeSlug: string;
};

function buildPresenceEndpoint(tribeSlug: string): string {
  return (
    PRESENCE_HEARTBEAT.apiPrefix +
    tribeSlug +
    PRESENCE_HEARTBEAT.presenceSegment
  );
}

/**
 * Refreshes the viewer membership `last_seen_at` while a tribe page is open,
 * powering the "online" counter of the tribe about page. The touch is a silent
 * best-effort: a failed ping must never disturb the page, and the server
 * no-ops for non-members.
 */
export function TribePresenceHeartbeat({
  tribeSlug,
}: TribePresenceHeartbeatProps) {
  useEffect(() => {
    const touchPresence = () => {
      if (document.visibilityState !== PRESENCE_HEARTBEAT.visibleState) {
        return;
      }

      void fetch(buildPresenceEndpoint(tribeSlug), {
        method: PRESENCE_HEARTBEAT.method,
      }).catch(() => {
        // Deliberate no-op: presence is cosmetic and retries on the next tick.
      });
    };

    touchPresence();

    const intervalId = window.setInterval(
      touchPresence,
      PRESENCE_HEARTBEAT.intervalMs
    );

    document.addEventListener("visibilitychange", touchPresence);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", touchPresence);
    };
  }, [tribeSlug]);

  return null;
}
