"use client";

import { BellOffIcon, CheckCheckIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Button, AnimatedListItem, cn } from "@golfo/ui";

import { Link } from "@/components/navigation/link";
import { describeNotification } from "@/lib/notifications/notification-presentation";
import type { NotificationItemResult } from "@/src/modules/notifications/application/results/notification-result";
import type { NotificationListStatus } from "@/src/modules/notifications/application/results/notification-refresh-state";
import { NOTIFICATION_LIST_STATUS as NOTIFICATION_PANEL_STATUS } from "@/src/modules/notifications/constants/notification-center";
import { MARK_ALL_FADE, NOTIFICATION_PANEL_VIEW } from "./constants";

import styles from "./styles.module.scss";

export { NOTIFICATION_LIST_STATUS as NOTIFICATION_PANEL_STATUS } from "@/src/modules/notifications/constants/notification-center";
type NotificationPanelStatus = NotificationListStatus;
type NotificationPanelView = "empty" | "error" | "idle" | "list" | "loading";

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
    case NOTIFICATION_PANEL_STATUS.idle:
      return NOTIFICATION_PANEL_VIEW.idle;
  }
}

type NotificationPanelProps = {
  isMarkingAll: boolean;
  listStatus: NotificationPanelStatus;
  notifications: NotificationItemResult[];
  /** Keeps cached rows visible while the latest contextual observation is unavailable. */
  refreshUnavailable?: boolean;
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
 * Header of the panel: the surface title and, while something is unread, "Marcar todas como leídas".
 * @param props - Title slot, unread count, mark-all state and callback, and close button spacing.
 * @returns The panel header.
 */
function NotificationPanelHeader({
  isMarkingAll,
  onMarkAllRead,
  reservesCloseButtonSpace,
  titleSlot,
  unreadCount,
}: Pick<NotificationPanelProps, "isMarkingAll" | "onMarkAllRead" | "titleSlot" | "unreadCount"> & { reservesCloseButtonSpace: boolean }) {
  return (
    <div
      className={cn(
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
  );
}

/**
 * One inbox row that opens its target and marks it read.
 * @param props - The notification and the selection callback.
 * @returns The animated list item.
 */
function NotificationListItem({ notification, onSelectNotification }: { notification: NotificationItemResult; onSelectNotification: (notificationId: string) => void }) {
  const presentation = describeNotification(notification);
  const isUnread = notification.readAt === null;

  return (
    <AnimatedListItem className={styles.NotificationPanel__item}>
      <Link
        className={cn(
          styles.NotificationPanel__link,
          isUnread && styles["NotificationPanel__link--unread"]
        )}
        href={presentation.href}
        onClick={() => onSelectNotification(notification.id)}
      >
        <span
          aria-hidden="true"
          className={cn(
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
}

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
  refreshUnavailable = false,
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
      <NotificationPanelHeader isMarkingAll={isMarkingAll} onMarkAllRead={onMarkAllRead} reservesCloseButtonSpace={reservesCloseButtonSpace} titleSlot={titleSlot} unreadCount={unreadCount} />

      {panelView === NOTIFICATION_PANEL_VIEW.loading ? (
        <p className={styles.NotificationPanel__state} role="status">
          Cargando notificaciones…
        </p>
      ) : null}

      {panelView === NOTIFICATION_PANEL_VIEW.error ? (
        <div className={styles.NotificationPanel__state} role="alert">
          <p className={styles.NotificationPanel__message}>No pudimos cargar tus notificaciones.</p>
          <Button onClick={onRetry} size="sm" type="button" variant="secondary">
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

      {panelView === NOTIFICATION_PANEL_VIEW.list && (refreshUnavailable || listStatus === NOTIFICATION_PANEL_STATUS.error) ? (
        <div className={styles.NotificationPanel__state} role="alert">
          <p className={styles.NotificationPanel__message}>No pudimos actualizar tus avisos. Mostramos la última información disponible.</p>
          <Button onClick={onRetry} size="sm" type="button" variant="secondary">Reintentar</Button>
        </div>
      ) : null}

      {panelView === NOTIFICATION_PANEL_VIEW.list ? (
        <ul className={styles.NotificationPanel__list}>
          <AnimatePresence initial={false}>
            {notifications.map((notification) => (
              <NotificationListItem key={notification.id} notification={notification} onSelectNotification={onSelectNotification} />
            ))}
          </AnimatePresence>
        </ul>
      ) : null}
    </div>
  );
}
