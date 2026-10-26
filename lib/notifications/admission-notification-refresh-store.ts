/** Coordinates browser-only admission interests and confirmed own changes, without storing private data. @module admission-notification-refresh-store */
import type { AdmissionNotificationRefreshSnapshot } from "@/src/modules/notifications/application/results/notification-refresh-state";
import { EMPTY_ADMISSION_NOTIFICATION_REFRESH_SNAPSHOT } from "@/src/modules/notifications/constants/admission-notification-refresh";

/** Contains only ephemeral listeners, mount tokens and a change generation in one browser document. */
type AdmissionRefreshStore = { subscribe: (listener: () => void) => () => void; snapshot: () => AdmissionNotificationRefreshSnapshot; register: () => () => void; invalidate: () => void };
/** Mutable browser state is created only after browser access; server renders never share client interests. */
let browserStore: AdmissionRefreshStore | undefined;

/** @returns A single document-local coordinator; listeners receive no resource or account payload. */
function createAdmissionRefreshStore(): AdmissionRefreshStore {
  const owners = new Set<symbol>(), listeners = new Set<() => void>();
  let snapshot = EMPTY_ADMISSION_NOTIFICATION_REFRESH_SNAPSHOT;
  /** Publishes an immutable read generation rather than mutating a subscribed snapshot. */
  const publish = (revision: number) => {
    snapshot = { activeOwners: owners.size, revision };
    for (const listener of listeners) listener();
  };
  return {
    subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    snapshot: () => snapshot,
    register: () => {
      const owner = Symbol();
      owners.add(owner); publish(snapshot.revision);
      return () => { if (owners.delete(owner)) publish(snapshot.revision); };
    },
    invalidate: () => publish(snapshot.revision + 1),
  };
}

/** @returns Browser-local state only; no singleton is allocated or modified during SSR. */
function currentStore(): AdmissionRefreshStore | null {
  if (typeof window === "undefined") return null;
  return browserStore ??= createAdmissionRefreshStore();
}

/** @param listener - React's external-store listener. @returns Its idempotent browser subscription cleanup. */
export function subscribeAdmissionNotificationRefresh(listener: () => void): () => void { return currentStore()?.subscribe(listener) ?? (() => undefined); }
/** @returns The current browser generation, or the deterministic server snapshot. */
export function readAdmissionNotificationRefreshSnapshot(): AdmissionNotificationRefreshSnapshot { return currentStore()?.snapshot() ?? EMPTY_ADMISSION_NOTIFICATION_REFRESH_SNAPSHOT; }
/** @returns The same immutable snapshot for every server render and first hydration render. */
export function readServerAdmissionNotificationRefreshSnapshot(): AdmissionNotificationRefreshSnapshot { return EMPTY_ADMISSION_NOTIFICATION_REFRESH_SNAPSHOT; }
/** @returns Cleanup for this enabled route's interest; another owner's interest remains intact. */
export function registerAdmissionNotificationRefresh(): () => void { return currentStore()?.register() ?? (() => undefined); }
/** Invalidates only client freshness after an actual confirmed own action; it grants no read or mutation authority. */
export function invalidateAdmissionNotificationRefresh(): void { currentStore()?.invalidate(); }
