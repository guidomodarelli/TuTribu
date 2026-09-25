"use client";

import { BellIcon } from "lucide-react";
import {
  Button,
  cn,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "beez-ui";

import { NotificationPanel } from "@/components/notifications/notification-panel";
import {
  describeUnreadNotifications,
  formatUnreadBadge,
} from "@/lib/notifications/notification-presentation";

import styles from "./styles.module.scss";

/**
 * Surfaces the bell can render. `responsive` ships both until hydration so a
 * media query (same 768px breakpoint as `useIsMobile`) shows the right one and
 * no surface is swapped once the client knows the viewport.
 */
export const NOTIFICATION_BELL_SURFACE = {
  popover: "popover",
  responsive: "responsive",
  sheet: "sheet",
} as const;

export type NotificationBellSurface =
  (typeof NOTIFICATION_BELL_SURFACE)[keyof typeof NOTIFICATION_BELL_SURFACE];

type NotificationBellProps = Omit<React.ComponentProps<typeof NotificationPanel>, "titleSlot"> & {
  /** Desktop popover, mobile bottom sheet, or both before hydration. */
  surface: NotificationBellSurface;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

const PANEL_TITLE = "Notificaciones";
const PANEL_TITLE_ID = "notification-panel-title";

/**
 * Header bell with the unread badge. The accessible name carries the count
 * ("Notificaciones, 3 sin leer") and a polite live region announces changes
 * while the page is open. It opens a popover on desktop and a bottom sheet on
 * mobile; both trap focus while open and return it to the bell on close
 * (Radix). Each surface keeps a fixed slot in the tree, so dropping the
 * inactive one after hydration never remounts the active one. The root block
 * uses `display: contents` so the triggers stay direct header items.
 * Presentational: all state and callbacks come from the container.
 */
export function NotificationBell({
  isOpen,
  onOpenChange,
  surface,
  unreadCount,
  ...panelProps
}: NotificationBellProps) {
  const isResponsive = surface === NOTIFICATION_BELL_SURFACE.responsive;
  const showsSheet = isResponsive || surface === NOTIFICATION_BELL_SURFACE.sheet;
  const showsPopover = isResponsive || surface === NOTIFICATION_BELL_SURFACE.popover;
  const accessibleLabel = describeUnreadNotifications(unreadCount);
  const trigger = (
    <Button
      aria-label={accessibleLabel}
      className={styles.NotificationBell__trigger}
      size="icon"
      type="button"
      variant="ghost"
    >
      <BellIcon aria-hidden="true" />
      {unreadCount > 0 ? (
        <span aria-hidden="true" className={styles.NotificationBell__badge}>
          {formatUnreadBadge(unreadCount)}
        </span>
      ) : null}
    </Button>
  );
  const liveRegion = (
    <span aria-live="polite" className={styles.NotificationBell__srOnly} role="status">
      {unreadCount > 0 ? accessibleLabel : ""}
    </span>
  );

  return (
    <span className={styles.NotificationBell}>
      {liveRegion}
      {showsPopover ? (
        <span
          className={cn(
            styles.NotificationBell__surface,
            isResponsive && styles["NotificationBell__surface--popoverOnly"]
          )}
        >
          <Popover onOpenChange={onOpenChange} open={isOpen}>
            <PopoverTrigger asChild>{trigger}</PopoverTrigger>
            <PopoverContent
              align="end"
              aria-labelledby={PANEL_TITLE_ID}
              className={styles.NotificationBell__popover}
            >
              <NotificationPanel
                {...panelProps}
                titleSlot={
                  <h2 className={styles.NotificationBell__title} id={PANEL_TITLE_ID}>
                    {PANEL_TITLE}
                  </h2>
                }
                unreadCount={unreadCount}
              />
            </PopoverContent>
          </Popover>
        </span>
      ) : null}
      {showsSheet ? (
        <span
          className={cn(
            styles.NotificationBell__surface,
            isResponsive && styles["NotificationBell__surface--sheetOnly"]
          )}
        >
          <Sheet onOpenChange={onOpenChange} open={isOpen}>
            <SheetTrigger asChild>{trigger}</SheetTrigger>
            <SheetContent className={styles.NotificationBell__sheet} side="bottom">
              <SheetDescription className={styles.NotificationBell__srOnly}>
                Avisos de tus eventos y propuestas.
              </SheetDescription>
              <NotificationPanel
                {...panelProps}
                reservesCloseButtonSpace
                titleSlot={
                  <SheetTitle className={styles.NotificationBell__title}>{PANEL_TITLE}</SheetTitle>
                }
                unreadCount={unreadCount}
              />
            </SheetContent>
          </Sheet>
        </span>
      ) : null}
    </span>
  );
}
