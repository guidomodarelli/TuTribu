import { useSyncExternalStore } from "react";

function subscribeToNothing(): () => void {
  return () => undefined;
}

function getViewerTimeZoneSnapshot(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function getServerViewerTimeZoneSnapshot(): null {
  return null;
}

/**
 * IANA time zone of the browser (for example "Europe/Madrid"). Returns null on
 * the server and during hydration so zone-dependent copy never causes a
 * markup mismatch; it settles right after hydration without an effect.
 */
export function useViewerTimeZone(): string | null {
  return useSyncExternalStore(
    subscribeToNothing,
    getViewerTimeZoneSnapshot,
    getServerViewerTimeZoneSnapshot
  );
}
