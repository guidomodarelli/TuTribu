"use client";
/** Restores only verified-viewer external storage without effect-driven state cascades or hydration drift. @module notification-recovery-local-snapshot */
import { useMemo, useSyncExternalStore } from "react";
import type { NotificationRecoveryIntentStore } from "@/src/modules/messaging/application/ports/notification-recovery-intent-store";
import { createNotificationRecoveryLocalSnapshotSource } from "@/lib/messaging/notification-recovery-local-snapshot-store";

/** @param store - Owned guarded metadata persistence. @param viewerId - Actual verified current viewer. @param slug - Exact owning route. @param verified - Whether the parent completed its shared viewer check. @returns Guarded own snapshot, storage unavailability or deterministic pre-verification absence. */
export function useNotificationRecoveryLocalSnapshot(store: NotificationRecoveryIntentStore, viewerId: string, slug: string, verified: boolean) {
  const source = useMemo(() => createNotificationRecoveryLocalSnapshotSource(store, viewerId, slug, verified), [store, viewerId, slug, verified]);
  return useSyncExternalStore(source.subscribe, source.read, source.server);
}
