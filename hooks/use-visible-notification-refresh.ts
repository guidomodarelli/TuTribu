"use client";
/** Schedules one visible original read at a time and keeps cancellation separate from failure. @module use-visible-notification-refresh */
import { useCallback, useEffect, useRef, useState } from "react";
import type { AdmissionNotificationRefreshOutcome } from "@/src/modules/notifications/application/results/notification-refresh-state";
import { NOTIFICATION_REFRESH_OUTCOME } from "@/src/modules/notifications/constants/admission-notification-refresh";

/** Own readers retain data and expose only an explicit freshness outcome. */
export type VisibleNotificationRefreshOptions = { readonly enabled: boolean; readonly scopeKey: string; readonly intervalMilliseconds: number; readonly requireFocus: boolean; readonly refresh: (signal: AbortSignal) => Promise<AdmissionNotificationRefreshOutcome> };

/** @param options - Current own read and browser lifecycle policy; callback changes do not restart a stable timer. @returns A coalesced explicit reconciliation and a safe persistent freshness failure. */
export function useVisibleNotificationRefresh({ enabled, scopeKey, intervalMilliseconds, requireFocus, refresh }: VisibleNotificationRefreshOptions) {
  const reader = useRef(refresh), request = useRef<() => void>(() => undefined);
  const [failure, setFailure] = useState<{ readonly scopeKey: string; readonly unavailable: boolean } | null>(null);
  useEffect(() => { reader.current = refresh; }, [refresh]);

  useEffect(() => {
    if (!enabled) { request.current = () => undefined; return; }
    let active = true, inFlight = false, queued = false;
    let controller: AbortController | null = null;
    let interval: number | undefined;
    /** @param unavailable - Current own read evidence; identical observations retain the existing render state. */
    const publishFailure = (unavailable: boolean) => setFailure((current) => current?.scopeKey === scopeKey && current.unavailable === unavailable ? current : { scopeKey, unavailable });
    /** @returns Current actual visibility; admission additionally requires foreground focus. */
    const visible = () => document.visibilityState === "visible" && (!requireFocus || document.hasFocus());
    /** @param replace - A confirmed own change supersedes an older read but starts only one successor. */
    const run = (replace: boolean) => {
      if (!active || !visible()) return;
      if (inFlight) { if (replace || controller?.signal.aborted) { queued = true; if (replace) controller?.abort(); } return; }
      inFlight = true;
      const original = new AbortController();
      controller = original;
      void (async () => {
        try {
          const outcome = await reader.current(original.signal);
          if (active && !original.signal.aborted && outcome !== NOTIFICATION_REFRESH_OUTCOME.skipped) publishFailure(outcome === NOTIFICATION_REFRESH_OUTCOME.failed);
        } catch {
          if (active && !original.signal.aborted) publishFailure(true);
        } finally {
          inFlight = false;
          if (controller === original) controller = null;
          if (active && queued && visible()) { queued = false; run(false); }
        }
      })();
    };
    /** Stops interval wakeups and cancels only the original read, without declaring its work undone. */
    const pause = () => { if (interval !== undefined) window.clearInterval(interval); interval = undefined; queued = false; controller?.abort(); };
    /** Resumes the original cadence; initial server data does not trigger a duplicate initial fetch. */
    const start = () => { if (interval === undefined) interval = window.setInterval(() => run(false), intervalMilliseconds); };
    /** Reconciles once when the document becomes usable again; background documents issue no reads. */
    const lifecycleChanged = () => { if (visible()) { start(); run(false); } else pause(); };
    request.current = () => run(true);
    if (visible()) start();
    document.addEventListener("visibilitychange", lifecycleChanged);
    if (requireFocus) { window.addEventListener("focus", lifecycleChanged); window.addEventListener("blur", lifecycleChanged); }
    return () => {
      active = false; pause(); request.current = () => undefined;
      document.removeEventListener("visibilitychange", lifecycleChanged);
      if (requireFocus) { window.removeEventListener("focus", lifecycleChanged); window.removeEventListener("blur", lifecycleChanged); }
    };
  }, [enabled, scopeKey, intervalMilliseconds, requireFocus]);

  const refreshNow = useCallback(() => { request.current(); }, []);
  /** Clears stale feedback only after a caller has independently confirmed the current scope's data. */
  const clearRefreshFailure = useCallback(() => setFailure((current) => current?.scopeKey === scopeKey && current.unavailable ? { scopeKey, unavailable: false } : current), [scopeKey]);
  return { refreshNow, clearRefreshFailure, refreshUnavailable: enabled && failure?.scopeKey === scopeKey && failure.unavailable };
}
