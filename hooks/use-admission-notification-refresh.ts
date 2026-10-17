"use client";
/** Owns the visible admission cadence and publishes confirmed own changes to the notification center. @module use-admission-notification-refresh */
import { useCallback } from "react";
import { invalidateAdmissionNotificationRefresh } from "@/lib/notifications/admission-notification-refresh-store";
import { ADMISSION_NOTIFICATION_REFRESH_INTERVAL_MS } from "@/src/modules/notifications/constants/admission-notification-refresh";
import { useVisibleNotificationRefresh } from "./use-visible-notification-refresh";
import { useAdmissionNotificationInterest } from "./use-admission-notification-context";
import type { AdmissionNotificationRefreshOutcome } from "@/src/modules/notifications/application/results/notification-refresh-state";

export type { AdmissionNotificationRefreshOutcome } from "@/src/modules/notifications/application/results/notification-refresh-state";

/** @param options - Authorized visible context, independent reader pause and existing own reader; interest never grants authority. @returns Quiet refresh feedback and reconciliation after confirmed own actions. */
export function useAdmissionNotificationRefresh({ enabled, paused = false, scopeKey, refresh }: { readonly enabled: boolean; readonly paused?: boolean; readonly scopeKey: string; readonly refresh: (signal: AbortSignal) => Promise<AdmissionNotificationRefreshOutcome> }) {
  const { refreshNow, refreshUnavailable, clearRefreshFailure } = useVisibleNotificationRefresh({ enabled: enabled && !paused, scopeKey, refresh, requireFocus: true, intervalMilliseconds: ADMISSION_NOTIFICATION_REFRESH_INTERVAL_MS });
  useAdmissionNotificationInterest(enabled, scopeKey);
  const confirmOwnAction = useCallback(() => {
    invalidateAdmissionNotificationRefresh();
    refreshNow();
  }, [refreshNow]);
  return { refreshNow, refreshUnavailable, clearRefreshFailure, confirmOwnAction };
}
