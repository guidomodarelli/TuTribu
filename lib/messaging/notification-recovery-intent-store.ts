"use client";
/** Stores only original notification references under a verified viewer/route without restoring confirmation. @module notification-recovery-intent-store */
import type { NotificationRecoveryIntentStore } from "@/src/modules/messaging/application/ports/notification-recovery-intent-store";
import { NOTIFICATION_RECOVERY_INTENT_STORAGE_PREFIX, notificationRecoveryStorageSchema } from "@/src/modules/messaging/constants/notification-recovery-intent";

/** @param options - Native browser storage or an owned persistence boundary; construction performs no I/O. @returns Metadata-only persistence whose failure cannot silently permit another write. */
export function createNotificationRecoveryIntentStore(options: { storage?: Pick<Storage, "getItem" | "setItem"> } = {}): NotificationRecoveryIntentStore {
  /** @param viewerId - Current verified own viewer. @param slug - Exact route. @returns A disjoint storage key with no session/token/recipient data. */
  const key = (viewerId: string, slug: string) => `${NOTIFICATION_RECOVERY_INTENT_STORAGE_PREFIX}:${encodeURIComponent(viewerId)}:${encodeURIComponent(slug)}`;
  return {
    /** @param viewerId - Current verified own viewer. @param slug - Exact route. @returns Guarded own metadata or safe unavailability; malformed originals are never silently discarded. */
    read(viewerId, slug) {
      try {
        const value = (options.storage ?? window.sessionStorage).getItem(key(viewerId, slug));
        if (value === null) return { state: "ready", value: { draft: null, reference: null, history: [] } };
        const parsed = notificationRecoveryStorageSchema.safeParse(JSON.parse(value));
        if (!parsed.success || parsed.data.viewerId !== viewerId || parsed.data.slug !== slug) return { state: "unavailable" };
        return { state: "ready", value: { draft: parsed.data.draft, reference: parsed.data.reference, history: parsed.data.history } };
      } catch { return { state: "unavailable" }; }
    },
    /** @param viewerId - Current verified own viewer. @param slug - Exact route. @param snapshot - Metadata only, without fresh confirmation or authority. @returns Whether the exact original was preserved before the owning container sends/navigates. */
    save(viewerId, slug, snapshot) {
      const parsed = notificationRecoveryStorageSchema.safeParse({ viewerId, slug, ...snapshot });
      if (!parsed.success) return false;
      try { (options.storage ?? window.sessionStorage).setItem(key(viewerId, slug), JSON.stringify(parsed.data)); return true; }
      catch { return false; }
    },
  };
}
/** The route checks the actual current viewer before reading or preserving its draft/reference. */
export const notificationRecoveryIntentStore = createNotificationRecoveryIntentStore();
