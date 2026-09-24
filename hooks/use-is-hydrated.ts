import { useSyncExternalStore } from "react";

function subscribeToNothing(): () => void {
  return () => undefined;
}

function getHydratedSnapshot(): boolean {
  return true;
}

function getServerHydratedSnapshot(): boolean {
  return false;
}

/**
 * Hydration store: the server snapshot is `false` and the client snapshot is
 * `true`, so the first client render still matches the server markup and the
 * component learns it is hydrated on the very next render without an effect.
 */
export function useIsHydrated(): boolean {
  return useSyncExternalStore(
    subscribeToNothing,
    getHydratedSnapshot,
    getServerHydratedSnapshot
  );
}
