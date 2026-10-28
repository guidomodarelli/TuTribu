"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { toast } from "@golfo/ui";
import { useAdmissionNotificationContext } from "./use-admission-notification-context";
import { readAdmissionNotificationRefreshSnapshot } from "@/lib/notifications/admission-notification-refresh-store";
import { useVisibleNotificationRefresh } from "./use-visible-notification-refresh";
import { sameNotificationInboxRows } from "@/lib/notifications/notification-inbox-equality";
import { linkNotificationRefreshCancellation } from "@/lib/notifications/notification-refresh-cancellation";
import { ADMISSION_NOTIFICATION_REFRESH_INTERVAL_MS, NOTIFICATION_CENTER_REFRESH_SCOPE, NOTIFICATION_REFRESH_OUTCOME, ORDINARY_NOTIFICATION_REFRESH_INTERVAL_MS } from "@/src/modules/notifications/constants/admission-notification-refresh";
import { NOTIFICATION_LIST_STATUS } from "@/src/modules/notifications/constants/notification-center";
import type { AdmissionNotificationRefreshOutcome, NotificationListStatus } from "@/src/modules/notifications/application/results/notification-refresh-state";

import {
  fetchNotificationInboxRequest,
  fetchUnreadNotificationCountRequest,
  markAllNotificationsReadRequest,
  markNotificationReadRequest,
} from "@/lib/notifications/notifications-api-client";
import type { NotificationItemResult } from "@/src/modules/notifications/application/results/notification-result";
import type { NotificationInboxResponse } from "@/src/modules/notifications/application/results/notification-public-dto-schemas";

/**
 * Light polling of the unread badge. The platform layout renders the inbox
 * once on the server, but it does not re-render on client navigations and
 * notifications arrive asynchronously (the reminder cron, other members'
 * actions), so the bell refreshes the count (an indexed, capped count) every
 * minute while the tab is visible and when it becomes visible again. The
 * open list also refreshes during focused admission context and after a
 * confirmed own admission action. Ordinary context retains badge-only polling.
 */
export { ORDINARY_NOTIFICATION_REFRESH_INTERVAL_MS as NOTIFICATION_UNREAD_POLL_INTERVAL_MS } from "@/src/modules/notifications/constants/admission-notification-refresh";
export { NOTIFICATION_LIST_STATUS } from "@/src/modules/notifications/constants/notification-center";
export type { NotificationListStatus } from "@/src/modules/notifications/application/results/notification-refresh-state";

export type NotificationCenter = {
  isMarkingAll: boolean;
  listStatus: NotificationListStatus;
  markAllRead: () => Promise<void>;
  markRead: (notificationId: string) => void;
  notifications: NotificationItemResult[];
  /** Loads the fresh list (called when the bell opens). */
  refreshList: () => void;
  /** Explicit stale feedback preserves cached rows after a contextual read failure. */
  refreshUnavailable: boolean;
  unreadCount: number;
};

const COPY = {
  markAllFailure: "No pudimos marcar tus notificaciones como leídas. Intentá de nuevo.",
  markAllLoading: "Marcando como leídas…",
  markAllSuccess: "Listo: no tenés notificaciones sin leer.",
  markReadFailure: "No pudimos marcar la notificación como leída.",
} as const;

const ABORT_ERROR_NAME = "AbortError";

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === ABORT_ERROR_NAME;
}

function markItemRead(
  notifications: NotificationItemResult[],
  notificationId: string,
  readAt: string | null
): NotificationItemResult[] {
  return notifications.map((notification) =>
    notification.id === notificationId ? { ...notification, readAt } : notification
  );
}

/**
 * Cancels the list and count reads still in flight when the bell unmounts.
 *
 * @param listControllerRef - Current list refresh.
 * @param reconcileCountControllerRef - Current count reconciliation.
 */
function abortNotificationReads(
  listControllerRef: RefObject<AbortController | null>,
  reconcileCountControllerRef: RefObject<AbortController | null>
): void {
  listControllerRef.current?.abort();
  reconcileCountControllerRef.current?.abort();
}

type AdmissionNotificationContext = ReturnType<typeof useAdmissionNotificationContext>;

/**
 * @param initialInbox - Inbox rendered by the layout, or null.
 * @param admission - Current admission notification context.
 * @returns Every state, ref and setter of the bell.
 */
function useNotificationCenterState(initialInbox: NotificationInboxResponse | null, admission: AdmissionNotificationContext) {
  const [notifications, setNotifications] = useState<NotificationItemResult[]>(
    initialInbox?.notifications ?? []
  );
  const [unreadCount, setUnreadCount] = useState(initialInbox?.unreadCount ?? 0);
  const [listStatus, setListStatus] = useState<NotificationListStatus>(
    initialInbox ? NOTIFICATION_LIST_STATUS.loaded : NOTIFICATION_LIST_STATUS.idle
  );
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const [refreshUnavailable, setRefreshUnavailable] = useState(false);
  const [reconciledOwnRevision, setReconciledOwnRevision] = useState(admission.revision);
  const isMarkingAllRef = useRef(false);
  const listControllerRef = useRef<AbortController | null>(null);
  const mutationVersionRef = useRef(0);
  const pendingMutationCountRef = useRef(0);
  const hasDeferredListRefreshRef = useRef(false);
  const hasDiscardedMutationCountRef = useRef(false);
  const reconcileCountControllerRef = useRef<AbortController | null>(null);
  const readGenerationRef = useRef(0);
  const appliedCountReadGenerationRef = useRef(0);
  const feedbackGenerationRef = useRef(0);
  const listWorkRef = useRef<Promise<AdmissionNotificationRefreshOutcome> | null>(null);
  const inboxAdmissionRevisionRef = useRef<number | null>(null);

  return { notifications, setNotifications, unreadCount, setUnreadCount, listStatus, setListStatus, isMarkingAll, setIsMarkingAll, refreshUnavailable, setRefreshUnavailable, reconciledOwnRevision, setReconciledOwnRevision, isMarkingAllRef, listControllerRef, mutationVersionRef, pendingMutationCountRef, hasDeferredListRefreshRef, hasDiscardedMutationCountRef, reconcileCountControllerRef, readGenerationRef, appliedCountReadGenerationRef, feedbackGenerationRef, listWorkRef, inboxAdmissionRevisionRef };
}
type NotificationCenterState = ReturnType<typeof useNotificationCenterState>;

/**
 * @param state - Bell state.
 * @returns Read ordering, refresh feedback and the unread count reads.
 */
function useNotificationCountReads(state: NotificationCenterState) {
  const { feedbackGenerationRef, readGenerationRef, appliedCountReadGenerationRef, pendingMutationCountRef, mutationVersionRef, listControllerRef, reconcileCountControllerRef, setRefreshUnavailable, setUnreadCount } = state;
  /** @param generation - Actual read order. @param unavailable - Safe outcome; an older failed read cannot replace newer successful feedback. */
  const recordRefreshFeedback = useCallback((generation: number, unavailable: boolean) => {
    if (generation < feedbackGenerationRef.current) return;
    feedbackGenerationRef.current = generation;
    setRefreshUnavailable(unavailable);
  }, [feedbackGenerationRef, setRefreshUnavailable]);

  /**
   * Starts a server read (poll or list refresh).
   *
   * @returns The read generation that orders it against every other read.
   */
  const beginRead = useCallback(() => {
    readGenerationRef.current += 1;

    return readGenerationRef.current;
  }, [readGenerationRef]);

  /**
   * Adopts the unread count of a read unless a newer read already applied
   * its own (read/read race: the older snapshot would restore a stale badge).
   */
  const adoptReadUnreadCount = useCallback((readGeneration: number, readUnreadCount: number) => {
    if (readGeneration <= appliedCountReadGenerationRef.current) {
      return;
    }

    appliedCountReadGenerationRef.current = readGeneration;
    setUnreadCount(readUnreadCount);
  }, [appliedCountReadGenerationRef, setUnreadCount]);

  const refreshUnreadCount = useCallback(async (signal: AbortSignal): Promise<AdmissionNotificationRefreshOutcome> => {
    if (pendingMutationCountRef.current > 0) {
      // A pending mark will adopt the server count from its own response; a
      // poll issued now could read the pre-commit count and resolve later.
      return NOTIFICATION_REFRESH_OUTCOME.skipped;
    }

    const versionAtStart = mutationVersionRef.current;
    const readGeneration = beginRead();

    try {
      const result = await fetchUnreadNotificationCountRequest({ signal });
      if (signal.aborted || versionAtStart !== mutationVersionRef.current) return NOTIFICATION_REFRESH_OUTCOME.skipped;
      if (!result.isSuccess) { recordRefreshFeedback(readGeneration, true); return NOTIFICATION_REFRESH_OUTCOME.failed; }
      adoptReadUnreadCount(readGeneration, result.unreadCount);
      recordRefreshFeedback(readGeneration, false);
      return NOTIFICATION_REFRESH_OUTCOME.refreshed;
    } catch {
      if (signal.aborted || versionAtStart !== mutationVersionRef.current) return NOTIFICATION_REFRESH_OUTCOME.skipped;
      recordRefreshFeedback(readGeneration, true);
      return NOTIFICATION_REFRESH_OUTCOME.failed;
    }
  }, [adoptReadUnreadCount, beginRead, mutationVersionRef, pendingMutationCountRef, recordRefreshFeedback]);

  useEffect(
    () => () => abortNotificationReads(listControllerRef, reconcileCountControllerRef),
    [listControllerRef, reconcileCountControllerRef]
  );

  /** Reads the unread count again after overlapping marks settled. */
  const reconcileUnreadCount = useCallback(() => {
    reconcileCountControllerRef.current?.abort();

    const controller = new AbortController();

    reconcileCountControllerRef.current = controller;
    void refreshUnreadCount(controller.signal);
  }, [reconcileCountControllerRef, refreshUnreadCount]);

  return { recordRefreshFeedback, beginRead, adoptReadUnreadCount, refreshUnreadCount, reconcileUnreadCount };
}
type NotificationCountReads = ReturnType<typeof useNotificationCountReads>;

/**
 * @param state - Bell state.
 * @param countReads - Read ordering and feedback.
 * @returns The inbox read, joined by concurrent callers of the same admission revision.
 */
function useNotificationInboxLoad(state: NotificationCenterState, countReads: NotificationCountReads) {
  const { pendingMutationCountRef, listControllerRef, hasDeferredListRefreshRef, listWorkRef, inboxAdmissionRevisionRef, mutationVersionRef, setListStatus, setNotifications } = state;
  const { adoptReadUnreadCount, beginRead, recordRefreshFeedback } = countReads;
  return useCallback(async (signal?: AbortSignal): Promise<AdmissionNotificationRefreshOutcome> => {
    if (pendingMutationCountRef.current > 0) {
      // A pre-mutation read cannot satisfy a refresh requested during the mark.
      // Preserve that intent for the last settling mutation instead of joining it.
      listControllerRef.current?.abort();
      hasDeferredListRefreshRef.current = true;
      setListStatus(NOTIFICATION_LIST_STATUS.loading);
      return NOTIFICATION_REFRESH_OUTCOME.skipped;
    }
    const admissionRevisionAtStart = readAdmissionNotificationRefreshSnapshot().revision;
    if (listWorkRef.current && listControllerRef.current && !listControllerRef.current.signal.aborted && inboxAdmissionRevisionRef.current === admissionRevisionAtStart) {
      const unlink = linkNotificationRefreshCancellation(listControllerRef.current, signal);
      try { return await listWorkRef.current; } finally { unlink(); }
    }
    listControllerRef.current?.abort();
    // The panel renders cached rows whatever the status, so the status only
    // shows when there are none: it must never claim a definitive empty inbox
    // while a refresh is in flight or after it failed.
    setListStatus(NOTIFICATION_LIST_STATUS.loading);

    const controller = new AbortController();
    const versionAtStart = mutationVersionRef.current;
    const readGeneration = beginRead();
    const unlink = linkNotificationRefreshCancellation(controller, signal);

    listControllerRef.current = controller;
    inboxAdmissionRevisionRef.current = admissionRevisionAtStart;

    const work = (async (): Promise<AdmissionNotificationRefreshOutcome> => {
      try {
        if (controller.signal.aborted) return NOTIFICATION_REFRESH_OUTCOME.skipped;
        const result = await fetchNotificationInboxRequest({ signal: controller.signal });
        if (controller.signal.aborted || admissionRevisionAtStart !== readAdmissionNotificationRefreshSnapshot().revision) return NOTIFICATION_REFRESH_OUTCOME.skipped;
        if (!result.isSuccess) { setListStatus(NOTIFICATION_LIST_STATUS.error); recordRefreshFeedback(readGeneration, true); return NOTIFICATION_REFRESH_OUTCOME.failed; }
        if (versionAtStart !== mutationVersionRef.current) { setListStatus(NOTIFICATION_LIST_STATUS.loaded); return NOTIFICATION_REFRESH_OUTCOME.skipped; }
        setNotifications((current) => sameNotificationInboxRows(current, result.inbox.notifications) ? current : result.inbox.notifications);
        adoptReadUnreadCount(readGeneration, result.inbox.unreadCount);
        setListStatus(NOTIFICATION_LIST_STATUS.loaded); recordRefreshFeedback(readGeneration, false);
        return NOTIFICATION_REFRESH_OUTCOME.refreshed;
      } catch (error) {
        if (isAbortError(error) || controller.signal.aborted) return NOTIFICATION_REFRESH_OUTCOME.skipped;
        setListStatus(NOTIFICATION_LIST_STATUS.error); recordRefreshFeedback(readGeneration, true);
        return NOTIFICATION_REFRESH_OUTCOME.failed;
      } finally { unlink(); }
    })();
    listWorkRef.current = work;
    try { return await work; } finally { if (listWorkRef.current === work) listWorkRef.current = null; }
  }, [adoptReadUnreadCount, beginRead, hasDeferredListRefreshRef, inboxAdmissionRevisionRef, listControllerRef, listWorkRef, mutationVersionRef, pendingMutationCountRef, recordRefreshFeedback, setListStatus, setNotifications]);
}

type NotificationVisibleRefreshInput = {
  admission: AdmissionNotificationContext;
  isOpen: boolean;
  loadInbox: (signal?: AbortSignal) => Promise<AdmissionNotificationRefreshOutcome>;
  refreshUnreadCount: (signal: AbortSignal) => Promise<AdmissionNotificationRefreshOutcome>;
};

/**
 * @param state - Bell state.
 * @param input - Admission context, whether the bell is open and the two reads.
 * @returns The explicit list refresh, the visible refresh and whether a confirmed own action still awaits its read.
 */
function useNotificationVisibleRefresh(state: NotificationCenterState, { admission, isOpen, loadInbox, refreshUnreadCount }: NotificationVisibleRefreshInput) {
  const { reconciledOwnRevision, setReconciledOwnRevision } = state;
  const refreshList = useCallback(() => { void loadInbox(); }, [loadInbox]);
  const ownActionPending = reconciledOwnRevision !== admission.revision;
  /** A confirmed original remains pending until its current inbox/count read succeeds, independently of hidden route data. */
  const refreshVisible = useCallback(async (signal: AbortSignal): Promise<AdmissionNotificationRefreshOutcome> => {
    const outcome = await (isOpen && (admission.active || ownActionPending) ? loadInbox(signal) : refreshUnreadCount(signal));
    if (ownActionPending && outcome === NOTIFICATION_REFRESH_OUTCOME.refreshed) setReconciledOwnRevision((current) => Math.max(current, admission.revision));
    return outcome;
  }, [admission.active, admission.revision, ownActionPending, isOpen, loadInbox, refreshUnreadCount, setReconciledOwnRevision]);
  return { refreshList, refreshVisible, ownActionPending };
}

/**
 * @param state - Bell state.
 * @param reads - The deferred list refresh and the count reconciliation.
 * @returns The version, count adoption and settling of local mutations.
 */
function useNotificationMutationTracking(state: NotificationCenterState, reads: { refreshList: () => void; reconcileUnreadCount: () => void }) {
  const { mutationVersionRef, pendingMutationCountRef, hasDiscardedMutationCountRef, hasDeferredListRefreshRef, setUnreadCount } = state;
  const { refreshList, reconcileUnreadCount } = reads;
  /**
   * Starts a local mutation: bumps the version (so in-flight reads discard
   * their results) and counts it as pending (so new reads are not issued).
   *
   * @returns The version that identifies this mutation.
   */
  const beginMutation = useCallback(() => {
    mutationVersionRef.current += 1;
    pendingMutationCountRef.current += 1;

    return mutationVersionRef.current;
  }, [mutationVersionRef, pendingMutationCountRef]);

  /**
   * Adopts the unread count returned by a successful mutation, or records
   * that it was discarded because a newer mutation superseded it (the newer
   * response may have committed first and still count this mark).
   */
  const adoptMutationUnreadCount = useCallback((version: number, mutationUnreadCount: number) => {
    if (version !== mutationVersionRef.current) {
      hasDiscardedMutationCountRef.current = true;
      return;
    }

    setUnreadCount(mutationUnreadCount);
  }, [hasDiscardedMutationCountRef, mutationVersionRef, setUnreadCount]);

  /**
   * Settles a local mutation and, once no mutation is pending, issues the
   * list refresh deferred while they were in flight and reconciles the count
   * when a superseded mutation's count was discarded.
   */
  const settleMutation = useCallback(() => {
    pendingMutationCountRef.current = Math.max(pendingMutationCountRef.current - 1, 0);

    if (pendingMutationCountRef.current > 0) {
      return;
    }

    if (hasDeferredListRefreshRef.current) {
      hasDeferredListRefreshRef.current = false;
      refreshList();
    }

    if (hasDiscardedMutationCountRef.current) {
      hasDiscardedMutationCountRef.current = false;
      reconcileUnreadCount();
    }
  }, [hasDeferredListRefreshRef, hasDiscardedMutationCountRef, pendingMutationCountRef, reconcileUnreadCount, refreshList]);

  return { beginMutation, adoptMutationUnreadCount, settleMutation };
}
type NotificationMutationTracking = ReturnType<typeof useNotificationMutationTracking>;

/**
 * @param state - Bell state.
 * @param tracking - Local mutation tracking.
 * @returns The optimistic mark of one notification.
 */
function useNotificationReadMark(state: NotificationCenterState, tracking: NotificationMutationTracking) {
  const { notifications, setNotifications, setUnreadCount, mutationVersionRef, hasDeferredListRefreshRef } = state;
  const { adoptMutationUnreadCount, beginMutation, settleMutation } = tracking;
  return useCallback(
    (notificationId: string) => {
      const target = notifications.find((notification) => notification.id === notificationId);

      if (target?.readAt !== null) {
        return;
      }

      const version = beginMutation();

      setNotifications((current) => markItemRead(current, notificationId, new Date().toISOString()));
      setUnreadCount((current) => Math.max(current - 1, 0));

      const revert = () => {
        if (version !== mutationVersionRef.current) {
          // A newer mutation (another read or "mark all") already rewrote this
          // state, so rolling back would undo it (e.g. an item the server
          // already marked read would turn unread again). Reconcile from the
          // server instead, once every pending mutation settles so their own
          // outcome is not overwritten by an older list.
          hasDeferredListRefreshRef.current = true;
          return;
        }

        setNotifications((current) => markItemRead(current, notificationId, null));
        setUnreadCount((current) => current + 1);
        toast.error(COPY.markReadFailure);
      };

      /** Sends the mark; a failed or rejected request reverts it, and the mutation always settles afterwards. */
      const send = async () => {
        try {
          const result = await markNotificationReadRequest({ notificationId });

          if (!result.isSuccess) {
            revert();
            return;
          }

          adoptMutationUnreadCount(version, result.unreadCount);
        } catch {
          revert();
        } finally {
          settleMutation();
        }
      };

      void send();
    },
    [adoptMutationUnreadCount, beginMutation, hasDeferredListRefreshRef, mutationVersionRef, notifications, setNotifications, setUnreadCount, settleMutation]
  );
}

/**
 * @param state - Bell state.
 * @param tracking - Local mutation tracking.
 * @returns The optimistic mark of every notification, announced by its own toast.
 */
function useNotificationMarkAll(state: NotificationCenterState, tracking: NotificationMutationTracking) {
  const { notifications, unreadCount, setNotifications, setUnreadCount, setIsMarkingAll, isMarkingAllRef, mutationVersionRef } = state;
  const { adoptMutationUnreadCount, beginMutation, settleMutation } = tracking;
  return useCallback(async () => {
    if (isMarkingAllRef.current) {
      return;
    }

    isMarkingAllRef.current = true;
    setIsMarkingAll(true);

    const version = beginMutation();
    const previousNotifications = notifications;
    const previousUnreadCount = unreadCount;
    const readAt = new Date().toISOString();

    setNotifications((current) =>
      current.map((notification) =>
        notification.readAt === null ? { ...notification, readAt } : notification
      )
    );
    setUnreadCount(0);

    const pendingRequest = markAllNotificationsReadRequest().then((result) => {
      if (!result.isSuccess) {
        throw new Error(result.message ?? COPY.markAllFailure);
      }

      return result;
    });

    toast.promise(pendingRequest, {
      error: (error: unknown) => (error instanceof Error ? error.message : COPY.markAllFailure),
      loading: COPY.markAllLoading,
      success: COPY.markAllSuccess,
    });

    try {
      const result = await pendingRequest;

      adoptMutationUnreadCount(version, result.unreadCount);
    } catch {
      // The error toast is shown by `toast.promise`; restore the inbox.
      if (version === mutationVersionRef.current) {
        setNotifications(previousNotifications);
        setUnreadCount(previousUnreadCount);
      }
    } finally {
      isMarkingAllRef.current = false;
      setIsMarkingAll(false);
      settleMutation();
    }
  }, [adoptMutationUnreadCount, beginMutation, isMarkingAllRef, mutationVersionRef, notifications, setIsMarkingAll, setNotifications, setUnreadCount, settleMutation, unreadCount]);
}

/**
 * Client state of the notification bell (container side): server-first
 * initial inbox, list refresh on open (AbortController, stale responses
 * ignored), unread polling, and incremental read marks. Every mutation
 * patches the local state and adopts the unread count returned by the
 * server; no route refresh happens. A version of local mutations makes a
 * read that started before a mark discard its (older) result. Reads that
 * would start while a mark is still pending are not issued, because they
 * could observe the server before the mark commits and resolve after it:
 * a poll is skipped (the mark's response carries the fresh count) and a list
 * refresh is deferred until the last pending mark settles. A failed read
 * mark that a newer mutation superseded reconciles from the server (through
 * the same deferred refresh) instead of rolling back over the newer state.
 * Overlapping marks can commit out of order, so a mark's count may still
 * include an older uncommitted mark; when a successful mark's count is
 * discarded because a newer mutation superseded it, the unread count is read
 * again once the last pending mark settles.
 * Reads also race each other (a count poll and a list refresh can observe
 * different server snapshots and resolve out of order), so every read takes a
 * shared, increasing read generation and adopts its unread count only when no
 * newer read already applied one; an older list still renders its items.
 * The list status only matters when there are no rows (the panel keeps
 * rendering cached rows), so it always reflects the latest refresh: an empty
 * cached inbox shows the loading and error states instead of a definitive
 * empty state.
 *
 * @param initialInbox - Inbox rendered by the layout, or null when it could
 * not be loaded (the bell then loads on open and polls the count).
 * @returns State and callbacks for the presentational bell.
 */
export function useNotificationCenter(
  initialInbox: NotificationInboxResponse | null,
  { isOpen = false }: { readonly isOpen?: boolean } = {},
): NotificationCenter {
  const admission = useAdmissionNotificationContext();
  const ownRevisionRef = useRef(admission.revision);
  const state = useNotificationCenterState(initialInbox, admission);
  const countReads = useNotificationCountReads(state);
  const loadInbox = useNotificationInboxLoad(state, countReads);
  const { refreshList, refreshVisible, ownActionPending } = useNotificationVisibleRefresh(state, { admission, isOpen, loadInbox, refreshUnreadCount: countReads.refreshUnreadCount });
  const { refreshNow } = useVisibleNotificationRefresh({ enabled: true, scopeKey: NOTIFICATION_CENTER_REFRESH_SCOPE, intervalMilliseconds: admission.active || ownActionPending ? ADMISSION_NOTIFICATION_REFRESH_INTERVAL_MS : ORDINARY_NOTIFICATION_REFRESH_INTERVAL_MS, requireFocus: admission.active || ownActionPending, refresh: refreshVisible });
  useEffect(() => {
    if (ownRevisionRef.current === admission.revision) return;
    ownRevisionRef.current = admission.revision;
    refreshNow();
  }, [admission.revision, refreshNow]);
  const tracking = useNotificationMutationTracking(state, { refreshList, reconcileUnreadCount: countReads.reconcileUnreadCount });
  const markRead = useNotificationReadMark(state, tracking);
  const markAllRead = useNotificationMarkAll(state, tracking);

  return {
    isMarkingAll: state.isMarkingAll,
    listStatus: state.listStatus,
    markAllRead,
    markRead,
    notifications: state.notifications,
    refreshList,
    refreshUnavailable: admission.active && state.refreshUnavailable,
    unreadCount: state.unreadCount,
  };
}
