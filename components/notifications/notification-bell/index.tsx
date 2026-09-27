"use client";

import { useState } from "react";
import { BellIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Button, cn, Popover, PopoverContent, PopoverTrigger, Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger, AnimatedCount, MOTION_TIMING, MOTION_EASE, SPRING_POP } from "beez-ui";

import { NotificationPanel } from "@/components/notifications/notification-panel";
import {
  describeUnreadNotifications,
  formatUnreadBadge,
  NOTIFICATION_BADGE_MAX,
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

/** Scale the unread badge grows from and shrinks to when it appears or clears. */
const BADGE_HIDDEN_SCALE = 0.4;

/** Badge entrance and exit: a confident pop in, a quick fade out. */
const BADGE_MOTION = {
  animate: { opacity: 1, scale: 1, transition: SPRING_POP },
  exit: {
    opacity: 0,
    scale: BADGE_HIDDEN_SCALE,
    transition: { duration: MOTION_TIMING.exit, ease: MOTION_EASE },
  },
  initial: { opacity: 0, scale: BADGE_HIDDEN_SCALE },
} as const;

/** Angles, in degrees, of the bell swing: out, back past rest, then settling. */
const BELL_NUDGE_ANGLE_DEGREES = {
  rebound: 10,
  rest: 0,
  settle: -4,
  swing: -14,
} as const;

/**
 * One short swing of the bell, played once when the unread count grows
 * (never on the first render and never in a loop).
 */
const BELL_NUDGE_ROTATION_DEGREES = [
  BELL_NUDGE_ANGLE_DEGREES.rest,
  BELL_NUDGE_ANGLE_DEGREES.swing,
  BELL_NUDGE_ANGLE_DEGREES.rebound,
  BELL_NUDGE_ANGLE_DEGREES.settle,
  BELL_NUDGE_ANGLE_DEGREES.rest,
];

/** Timing of the bell swing, within the product's 320 ms reveal budget. */
const BELL_NUDGE_TRANSITION = {
  duration: MOTION_TIMING.pop,
  ease: MOTION_EASE,
} as const;

/**
 * Highest value the rolling badge animates to. Every count above the visible
 * maximum renders "9+", so they share one value and never roll between
 * identical labels.
 */
const BADGE_ROLL_CEILING = NOTIFICATION_BADGE_MAX + 1;

/**
 * Counts how many times the unread count grew while mounted, adjusting state
 * during render (the React-endorsed alternative to an effect) so the swing
 * starts in the same commit that shows the new badge.
 * @param unreadCount - Current unread notifications.
 * @returns Zero until the count grows, then the number of increases seen.
 */
function useUnreadIncreaseCount(unreadCount: number): number {
  const [previousUnreadCount, setPreviousUnreadCount] = useState(unreadCount);
  const [increaseCount, setIncreaseCount] = useState(0);

  if (previousUnreadCount !== unreadCount) {
    if (unreadCount > previousUnreadCount) {
      setIncreaseCount((currentIncreaseCount) => currentIncreaseCount + 1);
    }

    setPreviousUnreadCount(unreadCount);
  }

  return increaseCount;
}

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
  const unreadIncreaseCount = useUnreadIncreaseCount(unreadCount);
  const trigger = (
    <Button
      aria-label={accessibleLabel}
      className={styles.NotificationBell__trigger}
      size="icon"
      type="button"
      variant="ghost"
    >
      {/* Remounting on each increase replays the swing exactly once. */}
      <motion.span
        animate={unreadIncreaseCount > 0 ? { rotate: BELL_NUDGE_ROTATION_DEGREES } : undefined}
        aria-hidden="true"
        className={styles.NotificationBell__icon}
        key={unreadIncreaseCount}
        transition={BELL_NUDGE_TRANSITION}
      >
        <BellIcon aria-hidden="true" />
      </motion.span>
      <AnimatePresence initial={false}>
        {unreadCount > 0 ? (
          <motion.span
            animate={BADGE_MOTION.animate}
            aria-hidden="true"
            className={styles.NotificationBell__badge}
            exit={BADGE_MOTION.exit}
            initial={BADGE_MOTION.initial}
            key="unread-badge"
          >
            <AnimatedCount
              format={formatUnreadBadge}
              value={Math.min(unreadCount, BADGE_ROLL_CEILING)}
            />
          </motion.span>
        ) : null}
      </AnimatePresence>
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
