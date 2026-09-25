"use client";

import { BellOffIcon, CheckCheckIcon } from "lucide-react";
import { Button } from "beez-ui";

import { Link } from "@/components/navigation/link";
import { describeNotification } from "@/lib/notifications/notification-presentation";
import type { NotificationItemResult } from "@/src/modules/notifications/application/results/notification-result";

import styles from "./styles.module.scss";

export const NOTIFICATION_PANEL_STATUS = {
  error: "error",
  idle: "idle",
  loaded: "loaded",
  loading: "loading",
} as const;

type NotificationPanelStatus =
  (typeof NOTIFICATION_PANEL_STATUS)[keyof typeof NOTIFICATION_PANEL_STATUS];

type NotificationPanelProps = {
  isMarkingAll: boolean;
  listStatus: NotificationPanelStatus;
  notifications: NotificationItemResult[];
  onMarkAllRead: () => void;
  onRetry: () => void;
  onSelectNotification: (notificationId: string) => void;
  /** Leaves room for the sheet's close button at the end of the header. */
  reservesCloseButtonSpace?: boolean;
  /** Heading rendered by the surface (popover or sheet title). */
  titleSlot: React.ReactNode;
  unreadCount: number;
};

/**
 * Content of the notification bell (shared by the desktop popover and the
 * mobile sheet): header with "Marcar todas como leídas", the list, and the
 * loading, error, and empty states. Presentational: data and callbacks come
 * from the container.
 */
export function NotificationPanel({
  isMarkingAll,
  listStatus,
  notifications,
  onMarkAllRead,
  onRetry,
  onSelectNotification,
  reservesCloseButtonSpace = false,
  titleSlot,
  unreadCount,
}: NotificationPanelProps) {
  const hasNotifications = notifications.length > 0;

  return (
    <div className={styles.NotificationPanel}>
      <div
        className={
          reservesCloseButtonSpace
            ? `${styles.NotificationPanel__header} ${styles["NotificationPanel__header--withClose"]}`
            : styles.NotificationPanel__header
        }
      >
        {titleSlot}
        {unreadCount > 0 ? (
          <Button
            className={styles.NotificationPanel__markAll}
            disabled={isMarkingAll}
            onClick={onMarkAllRead}
            size="sm"
            type="button"
            variant="ghost"
          >
            <CheckCheckIcon aria-hidden="true" />
            Marcar todas como leídas
          </Button>
        ) : null}
      </div>

      {!hasNotifications && listStatus === NOTIFICATION_PANEL_STATUS.loading ? (
        <p className={styles.NotificationPanel__state} role="status">
          Cargando notificaciones…
        </p>
      ) : null}

      {!hasNotifications && listStatus === NOTIFICATION_PANEL_STATUS.error ? (
        <div className={styles.NotificationPanel__state} role="alert">
          <p className={styles.NotificationPanel__message}>No pudimos cargar tus notificaciones.</p>
          <Button onClick={onRetry} size="sm" type="button" variant="outline">
            Reintentar
          </Button>
        </div>
      ) : null}

      {!hasNotifications && listStatus === NOTIFICATION_PANEL_STATUS.loaded ? (
        <div className={styles.NotificationPanel__empty}>
          <BellOffIcon aria-hidden="true" className={styles.NotificationPanel__emptyIcon} />
          <p className={styles.NotificationPanel__message}>No tenés notificaciones.</p>
          <p className={styles.NotificationPanel__emptyHint}>
            Te avisamos acá antes de tus eventos y cuando cambie algo que te importa.
          </p>
        </div>
      ) : null}

      {hasNotifications ? (
        <ul className={styles.NotificationPanel__list}>
          {notifications.map((notification) => {
            const presentation = describeNotification(notification);
            const isUnread = notification.readAt === null;

            return (
              <li className={styles.NotificationPanel__item} key={notification.id}>
                <Link
                  className={
                    isUnread
                      ? `${styles.NotificationPanel__link} ${styles["NotificationPanel__link--unread"]}`
                      : styles.NotificationPanel__link
                  }
                  href={presentation.href}
                  onClick={() => onSelectNotification(notification.id)}
                >
                  <span
                    aria-hidden="true"
                    className={
                      isUnread
                        ? `${styles.NotificationPanel__dot} ${styles["NotificationPanel__dot--unread"]}`
                        : styles.NotificationPanel__dot
                    }
                  />
                  <span className={styles.NotificationPanel__body}>
                    {isUnread ? <span className={styles.NotificationPanel__srOnly}>No leída: </span> : null}
                    <span className={styles.NotificationPanel__title}>{presentation.title}</span>
                    <span className={styles.NotificationPanel__detail}>{presentation.detail}</span>
                    <span className={styles.NotificationPanel__sentAt}>{presentation.sentAtLabel}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
