"use client";
/** Owns one verified-viewer external snapshot cache and its native storage-event lifetime. @module notification-recovery-local-snapshot-store */
import type { NotificationRecoveryIntentStore } from "@/src/modules/messaging/application/ports/notification-recovery-intent-store";

/** @param store - Guarded own persistence. @param viewerId - Current verified viewer. @param slug - Exact route. @param verified - Whether the shared actual-viewer check completed. @returns Stable external-store callbacks with deterministic server absence and no I/O during construction. */
export function createNotificationRecoveryLocalSnapshotSource(store: NotificationRecoveryIntentStore, viewerId: string, slug: string, verified: boolean) {
  let cached: ReturnType<NotificationRecoveryIntentStore["read"]> | undefined;
  return {
    /** @returns Stable guarded metadata; native storage is accessed only after current-viewer verification. */
    read: () => {
      if (!verified) return null;
      cached ??= store.read(viewerId, slug);
      return cached;
    },
    /** @returns The same absence for server HTML and first hydration. */
    server: () => null,
    /** @param listener - External-store observer. @returns Native listener cleanup without another request or mutation. */
    subscribe(listener: () => void) {
      /** @returns Nothing after invalidating only this own scope's cached public metadata. */
      const changed = () => { cached = undefined; listener(); };
      window.addEventListener("storage", changed);
      return () => window.removeEventListener("storage", changed);
    },
  };
}
