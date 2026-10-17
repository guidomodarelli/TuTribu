"use client";
/** Exposes admission interest to the single notification-center owner without reading routes during SSR. @module use-admission-notification-context */
import { useEffect, useSyncExternalStore } from "react";
import { readAdmissionNotificationRefreshSnapshot, readServerAdmissionNotificationRefreshSnapshot, registerAdmissionNotificationRefresh, subscribeAdmissionNotificationRefresh } from "@/lib/notifications/admission-notification-refresh-store";

/** @param enabled - Whether the current authorized route owns admission visibility. @param scopeKey - Current route scope; changing it releases the previous interest. */
export function useAdmissionNotificationInterest(enabled: boolean, scopeKey: string): void {
  useEffect(() => { if (enabled) return registerAdmissionNotificationRefresh(); }, [enabled, scopeKey]);
}

/** @returns Whether a route currently needs admission refresh and the generation of confirmed own actions. */
export function useAdmissionNotificationContext(): { readonly active: boolean; readonly revision: number } {
  const snapshot = useSyncExternalStore(subscribeAdmissionNotificationRefresh, readAdmissionNotificationRefreshSnapshot, readServerAdmissionNotificationRefreshSnapshot);
  return { active: snapshot.activeOwners > 0, revision: snapshot.revision };
}
