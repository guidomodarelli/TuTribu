"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "beez-ui";

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
 * list itself is only fetched when the bell opens. No websockets.
 */
export const NOTIFICATION_UNREAD_POLL_INTERVAL_MS = 60_000;

export const NOTIFICATION_LIST_STATUS = {
  error: "error",
  idle: "idle",
  loaded: "loaded",
  loading: "loading",
} as const;

export type NotificationListStatus =
  (typeof NOTIFICATION_LIST_STATUS)[keyof typeof NOTIFICATION_LIST_STATUS];

export type NotificationCenter = {
  isMarkingAll: boolean;
  listStatus: NotificationListStatus;
  markAllRead: () => Promise<void>;
  markRead: (notificationId: string) => void;
  notifications: NotificationItemResult[];
  /** Loads the fresh list (called when the bell opens). */
  refreshList: () => void;
  unreadCount: number;
};

const COPY = {
  markAllFailure: "No pudimos marcar tus notificaciones como leídas. Intentá de nuevo.",
  markAllLoading: "Marcando como leídas…",
  markAllSuccess: "Listo: no tenés notificaciones sin leer.",
  markReadFailure: "No pudimos marcar la notificación como leída.",
} as const;

const ABORT_ERROR_NAME = "AbortError";
const VISIBLE_DOCUMENT_STATE = "visible";
const VISIBILITY_CHANGE_EVENT = "visibilitychange";

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
 * Reads also race each other (a count poll and a list refresh can observe
 * different server snapshots and resolve out of order), so every read takes a
 * shared, increasing read generation and adopts its unread count only when no
 * newer read already applied one; an older list still renders its items.
 *
 * @param initialInbox - Inbox rendered by the layout, or null when it could
 * not be loaded (the bell then loads on open and polls the count).
 * @returns State and callbacks for the presentational bell.
 */
export function useNotificationCenter(
  initialInbox: NotificationInboxResponse | null
): NotificationCenter {
  const [notifications, setNotifications] = useState<NotificationItemResult[]>(
    initialInbox?.notifications ?? []
  );
  const [unreadCount, setUnreadCount] = useState(initialInbox?.unreadCount ?? 0);
  const [listStatus, setListStatus] = useState<NotificationListStatus>(
    initialInbox ? NOTIFICATION_LIST_STATUS.loaded : NOTIFICATION_LIST_STATUS.idle
  );
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const isMarkingAllRef = useRef(false);
  const listControllerRef = useRef<AbortController | null>(null);
  const mutationVersionRef = useRef(0);
  const pendingMutationCountRef = useRef(0);
  const hasDeferredListRefreshRef = useRef(false);
  const readGenerationRef = useRef(0);
  const appliedCountReadGenerationRef = useRef(0);

  /**
   * Starts a server read (poll or list refresh).
   *
   * @returns The read generation that orders it against every other read.
   */
  const beginRead = useCallback(() => {
    readGenerationRef.current += 1;

    return readGenerationRef.current;
  }, []);

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
  }, []);

  const refreshUnreadCount = useCallback((signal: AbortSignal) => {
    if (pendingMutationCountRef.current > 0) {
      // A pending mark will adopt the server count from its own response; a
      // poll issued now could read the pre-commit count and resolve later.
      return;
    }

    const versionAtStart = mutationVersionRef.current;
    const readGeneration = beginRead();

    fetchUnreadNotificationCountRequest({ signal })
      .then((result) => {
        if (signal.aborted || !result.isSuccess || versionAtStart !== mutationVersionRef.current) {
          return;
        }

        adoptReadUnreadCount(readGeneration, result.unreadCount);
      })
      .catch(() => {
        // Deliberate fallback: an aborted poll was superseded (or the bell
        // unmounted) and a network failure keeps the last known count; the
        // next tick retries. The badge is advisory, so no toast interrupts.
      });
  }, [adoptReadUnreadCount, beginRead]);

  useEffect(() => {
    let pollController: AbortController | null = null;

    const poll = () => {
      if (document.visibilityState !== VISIBLE_DOCUMENT_STATE) {
        return;
      }

      pollController?.abort();
      pollController = new AbortController();
      refreshUnreadCount(pollController.signal);
    };
    const intervalId = window.setInterval(poll, NOTIFICATION_UNREAD_POLL_INTERVAL_MS);

    document.addEventListener(VISIBILITY_CHANGE_EVENT, poll);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener(VISIBILITY_CHANGE_EVENT, poll);
      pollController?.abort();
    };
  }, [refreshUnreadCount]);

  useEffect(() => () => listControllerRef.current?.abort(), []);

  const refreshList = useCallback(() => {
    listControllerRef.current?.abort();
    setListStatus((currentStatus) =>
      currentStatus === NOTIFICATION_LIST_STATUS.loaded
        ? currentStatus
        : NOTIFICATION_LIST_STATUS.loading
    );

    if (pendingMutationCountRef.current > 0) {
      // Deferred: a list read now could observe the server before the pending
      // mark commits and overwrite it once resolved. The last settling mark
      // issues it.
      hasDeferredListRefreshRef.current = true;
      return;
    }

    const controller = new AbortController();
    const versionAtStart = mutationVersionRef.current;
    const readGeneration = beginRead();

    listControllerRef.current = controller;

    fetchNotificationInboxRequest({ signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) {
          return;
        }

        if (!result.isSuccess) {
          setListStatus((currentStatus) =>
            currentStatus === NOTIFICATION_LIST_STATUS.loaded
              ? currentStatus
              : NOTIFICATION_LIST_STATUS.error
          );
          return;
        }

        if (versionAtStart === mutationVersionRef.current) {
          setNotifications(result.inbox.notifications);
          adoptReadUnreadCount(readGeneration, result.inbox.unreadCount);
        }

        setListStatus(NOTIFICATION_LIST_STATUS.loaded);
      })
      .catch((error: unknown) => {
        if (isAbortError(error) || controller.signal.aborted) {
          return;
        }

        setListStatus((currentStatus) =>
          currentStatus === NOTIFICATION_LIST_STATUS.loaded
            ? currentStatus
            : NOTIFICATION_LIST_STATUS.error
        );
      });
  }, [adoptReadUnreadCount, beginRead]);

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
  }, []);

  /**
   * Settles a local mutation and, once no mutation is pending, issues the
   * list refresh deferred while they were in flight.
   */
  const settleMutation = useCallback(() => {
    pendingMutationCountRef.current = Math.max(pendingMutationCountRef.current - 1, 0);

    if (pendingMutationCountRef.current === 0 && hasDeferredListRefreshRef.current) {
      hasDeferredListRefreshRef.current = false;
      refreshList();
    }
  }, [refreshList]);

  const markRead = useCallback(
    (notificationId: string) => {
      const target = notifications.find((notification) => notification.id === notificationId);

      if (!target || target.readAt !== null) {
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

      markNotificationReadRequest({ notificationId })
        .then((result) => {
          if (!result.isSuccess) {
            revert();
            return;
          }

          if (version === mutationVersionRef.current) {
            setUnreadCount(result.unreadCount);
          }
        })
        .catch(revert)
        .finally(settleMutation);
    },
    [beginMutation, notifications, settleMutation]
  );

  const markAllRead = useCallback(async () => {
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

      if (version === mutationVersionRef.current) {
        setUnreadCount(result.unreadCount);
      }
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
  }, [beginMutation, notifications, settleMutation, unreadCount]);

  return {
    isMarkingAll,
    listStatus,
    markAllRead,
    markRead,
    notifications,
    refreshList,
    unreadCount,
  };
}
