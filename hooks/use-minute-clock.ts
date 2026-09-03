import { useSyncExternalStore } from "react";

const MILLISECONDS_PER_MINUTE = 60_000;

function subscribe(onStoreChange: () => void): () => void {
  const intervalId = window.setInterval(onStoreChange, MILLISECONDS_PER_MINUTE);

  return () => window.clearInterval(intervalId);
}

function getSnapshot(): number {
  return Math.floor(Date.now() / MILLISECONDS_PER_MINUTE) * MILLISECONDS_PER_MINUTE;
}

function getServerSnapshot(): null {
  return null;
}

/**
 * Current time truncated to the minute, refreshed every minute. Returns null
 * during server rendering and hydration so time-dependent UI never produces a
 * server/client markup mismatch; it settles to a number right after mount.
 */
export function useMinuteClock(): number | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
