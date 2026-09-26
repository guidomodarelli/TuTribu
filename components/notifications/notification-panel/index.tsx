"use client";

import { BellOffIcon, CheckCheckIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "beez-ui";

import { AnimatedListItem } from "@/components/motion/animated-list-item";
import { Link } from "@/components/navigation/link";
import { joinClassNames } from "@/lib/motion/join-class-names";
import { MOTION_DURATION_SECONDS, MOTION_EASE_OUT } from "@/lib/motion/tokens";
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

/**
 * Region the panel body shows. Each region fades in with CSS when it mounts,
 * so the new state is in the DOM at once (no JS exit to wait for).
 */
const NOTIFICATION_PANEL_VIEW = {
  empty: "empty",
  error: "error",
  idle: "idle",
  list: "list",
  loading: "loading",
} as const;

type NotificationPanelView = (typeof NOTIFICATION_PANEL_VIEW)[keyof typeof NOTIFICATION_PANEL_VIEW];

/** Opacity-only fade for the header action, which sits next to the title. */
const MARK_ALL_FADE = {
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  initial: { opacity: 0 },
  transition: { duration: MOTION_DURATION_SECONDS.enter, ease: MOTION_EASE_OUT },
} as const;

/**
 * Picks the body region: the list whenever there are items (a background
 * refresh never hides them), otherwise the state of the last load.
 * @param hasNotifications - Whether the inbox has at least one item.
 * @param listStatus - Status of the latest list load.
 * @returns The region to render.
 */
function resolvePanelView(hasNotifications: boolean, listStatus: NotificationPanelStatus): NotificationPanelView {
  if (hasNotifications) {
    return NOTIFICATION_PANEL_VIEW.list;
  }

  switch (listStatus) {
    case NOTIFICATION_PANEL_STATUS.loading:
      return NOTIFICATION_PANEL_VIEW.loading;
    case NOTIFICATION_PANEL_STATUS.error:
      return NOTIFICATION_PANEL_VIEW.error;
    case NOTIFICATION_PANEL_STATUS.loaded:
      return NOTIFICATION_PANEL_VIEW.empty;
    default:
      return NOTIFICATION_PANEL_VIEW.idle;
  }
}

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
  const panelView = resolvePanelView(notifications.length > 0, listStatus);

  return (
    <div className={styles.NotificationPanel}>
      <div
        className={joinClassNames(
          styles.NotificationPanel__header,
          reservesCloseButtonSpace && styles["NotificationPanel__header--withClose"]
        )}
      >
        {titleSlot}
        <AnimatePresence initial={false}>
          {unreadCount > 0 ? (
            <motion.span
              animate={MARK_ALL_FADE.animate}
              className={styles.NotificationPanel__markAllSlot}
              exit={MARK_ALL_FADE.exit}
              initial={MARK_ALL_FADE.initial}
              key="mark-all"
              transition={MARK_ALL_FADE.transition}
            >
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
            </motion.span>
          ) : null}
        </AnimatePresence>
      </div>

      {panelView === NOTIFICATION_PANEL_VIEW.loading ? (
        <p className={styles.NotificationPanel__state} role="status">
          Cargando notificaciones…
        </p>
      ) : null}

      {panelView === NOTIFICATION_PANEL_VIEW.error ? (
        <div className={styles.NotificationPanel__state} role="alert">
          <p className={styles.NotificationPanel__message}>No pudimos cargar tus notificaciones.</p>
          <Button onClick={onRetry} size="sm" type="button" variant="outline">
            Reintentar
          </Button>
        </div>
      ) : null}

      {panelView === NOTIFICATION_PANEL_VIEW.empty ? (
        <div className={styles.NotificationPanel__empty}>
          <BellOffIcon aria-hidden="true" className={styles.NotificationPanel__emptyIcon} />
          <p className={styles.NotificationPanel__message}>No tenés notificaciones.</p>
          <p className={styles.NotificationPanel__emptyHint}>
            Te avisamos acá antes de tus eventos y cuando cambie algo que te importa.
          </p>
        </div>
      ) : null}

      {panelView === NOTIFICATION_PANEL_VIEW.list ? (
        <ul className={styles.NotificationPanel__list}>
          <AnimatePresence initial={false}>
            {notifications.map((notification) => {
              const presentation = describeNotification(notification);
              const isUnread = notification.readAt === null;

              return (
                <AnimatedListItem className={styles.NotificationPanel__item} key={notification.id}>
                  <Link
                    className={joinClassNames(
                      styles.NotificationPanel__link,
                      isUnread && styles["NotificationPanel__link--unread"]
                    )}
                    href={presentation.href}
                    onClick={() => onSelectNotification(notification.id)}
                  >
                    <span
                      aria-hidden="true"
                      className={joinClassNames(
                        styles.NotificationPanel__dot,
                        isUnread && styles["NotificationPanel__dot--unread"]
                      )}
                    />
                    <span className={styles.NotificationPanel__body}>
                      {isUnread ? <span className={styles.NotificationPanel__srOnly}>No leída: </span> : null}
                      <span className={styles.NotificationPanel__title}>{presentation.title}</span>
                      <span className={styles.NotificationPanel__detail}>{presentation.detail}</span>
                      <span className={styles.NotificationPanel__sentAt}>{presentation.sentAtLabel}</span>
                    </span>
                  </Link>
                </AnimatedListItem>
              );
            })}
          </AnimatePresence>
        </ul>
      ) : null}
    </div>
  );
}
