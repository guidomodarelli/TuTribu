"use client";

import type { ReactNode } from "react";
import { motion } from "motion/react";
import {
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  InboxIcon,
  LightbulbIcon,
  ListIcon,
  RssIcon,
} from "lucide-react";
import { Button, cn } from "beez-ui";

import type { MonthTransitionDirection } from "@/components/events/tribe-events-calendar/use-month-transition-direction";
import { AnimatedCount } from "@/components/motion/animated-count";
import { Link } from "@/components/navigation/link";
import { formatBuenosAiresMonthTitle } from "@/lib/date-time/buenos-aires-format";
import { SPRING_LAYOUT } from "@/lib/motion/tokens";
import styles from "./styles.module.scss";

/**
 * Views the viewer can pick in the tribe events calendar.
 */
export const TRIBE_EVENTS_VIEW_MODE = {
  calendar: "calendar",
  list: "list",
} as const;

export type TribeEventsViewMode =
  (typeof TRIBE_EVENTS_VIEW_MODE)[keyof typeof TRIBE_EVENTS_VIEW_MODE];

type TribeEventsCalendarHeaderProps = {
  canManageEvents: boolean;
  /** Active members who do not manage events can propose one. */
  canProposeEvents?: boolean;
  /** Visible `YYYY-MM` month. */
  month: string;
  /** Side the month title slides in from after a month change. */
  monthTransitionDirection?: MonthTransitionDirection;
  nextMonthHref: string;
  onChooseViewMode: (viewMode: TribeEventsViewMode) => void;
  onCreateEvent: () => void;
  /** Opens the proposals panel (manager queue or the member's own list). */
  onOpenProposals?: () => void;
  onProposeEvent?: () => void;
  /** Opens the personal calendar subscription (webcal feed) dialog. */
  onSubscribeCalendar?: () => void;
  /** Pending proposals waiting for review (managers). */
  pendingProposalCount?: number;
  previousMonthHref: string;
  /**
   * Glide the active view marker when the view changes. Off while the view
   * still follows the viewport, so hydration does not animate it.
   */
  shouldAnimateViewMode?: boolean;
  /** "HH:MM Buenos Aires" label, or null before hydration. */
  timeLabel: string | null;
  todayHref: string;
  /** Type filter chips, rendered as the last row of the toolbar. */
  typeFilter?: ReactNode;
  viewMode: TribeEventsViewMode;
};

const BUTTON_ATTRIBUTE = {
  sizeIcon: "icon",
  typeButton: "button",
  variantGhost: "ghost",
  variantOutline: "outline",
} as const;
const COPY = {
  createButton: "Crear evento",
  myProposalsButton: "Mis propuestas",
  pendingProposalsButton: "Propuestas",
  pendingProposalsCountClose: ")",
  pendingProposalsCountOpen: " (",
  pendingProposalsLabel: (count: number) => `Propuestas (${count})`,
  proposeButton: "Proponer un encuentro",
  subscribeCalendarButton: "Suscribirme al calendario",
  nextMonth: "Mes siguiente",
  previousMonth: "Mes anterior",
  today: "Hoy",
  viewCalendar: "Ver calendario",
  viewList: "Ver lista",
  viewModeLabel: "Vista de eventos",
} as const;
const ROLE_GROUP = "group";
/** Shared layout id: the active view marker glides between the two buttons. */
const VIEW_MODE_INDICATOR_LAYOUT_ID = "tribe-events-view-mode-indicator";
/** Moves the marker without animation (view picked by the viewport). */
const INSTANT_TRANSITION = { duration: 0 } as const;
/** Buttons of the view toggle, in visual order. */
const VIEW_MODE_OPTIONS = [
  { icon: ListIcon, label: COPY.viewList, viewMode: TRIBE_EVENTS_VIEW_MODE.list },
  { icon: CalendarDaysIcon, label: COPY.viewCalendar, viewMode: TRIBE_EVENTS_VIEW_MODE.calendar },
] as const;

/**
 * Month navigation, "Hoy" shortcut with the Buenos Aires clock, view toggle,
 * the type filter, the create action and "Propuestas (N)" for managers, and
 * "Proponer un encuentro" for members, and "Suscribirme al calendario" for
 * every viewer. The month title slides in from the side the viewer moved to,
 * and a marker glides between the two view buttons.
 */
export function TribeEventsCalendarHeader({
  canManageEvents,
  canProposeEvents = false,
  month,
  monthTransitionDirection,
  nextMonthHref,
  onChooseViewMode,
  onCreateEvent,
  onOpenProposals,
  onProposeEvent,
  onSubscribeCalendar,
  pendingProposalCount = 0,
  previousMonthHref,
  shouldAnimateViewMode = true,
  timeLabel,
  todayHref,
  typeFilter = null,
  viewMode,
}: TribeEventsCalendarHeaderProps) {
  return (
    <header className={styles.TribeEventsCalendarHeader}>
      <div className={styles.TribeEventsCalendarHeader__monthNavigation}>
        <Link
          aria-label={COPY.previousMonth}
          className={cn(
            styles.TribeEventsCalendarHeader__iconLink,
            styles["TribeEventsCalendarHeader__iconLink--previous"]
          )}
          href={previousMonthHref}
        >
          <ChevronLeftIcon aria-hidden />
        </Link>
        {/* Keyed by month so the title replays its entrance on every change. */}
        <h1
          className={styles.TribeEventsCalendarHeader__title}
          data-month-transition={monthTransitionDirection}
          key={month}
        >
          {formatBuenosAiresMonthTitle(month)}
        </h1>
        <Link
          aria-label={COPY.nextMonth}
          className={cn(
            styles.TribeEventsCalendarHeader__iconLink,
            styles["TribeEventsCalendarHeader__iconLink--next"]
          )}
          href={nextMonthHref}
        >
          <ChevronRightIcon aria-hidden />
        </Link>
      </div>
      <div className={styles.TribeEventsCalendarHeader__toolbar}>
        <div className={styles.TribeEventsCalendarHeader__todayGroup}>
          <Link className={styles.TribeEventsCalendarHeader__todayLink} href={todayHref}>
            {COPY.today}
          </Link>
          {timeLabel ? (
            <p className={styles.TribeEventsCalendarHeader__timeLabel}>{timeLabel}</p>
          ) : null}
        </div>
        <div className={styles.TribeEventsCalendarHeader__actions}>
          <div
            aria-label={COPY.viewModeLabel}
            className={styles.TribeEventsCalendarHeader__viewToggle}
            role={ROLE_GROUP}
          >
            {VIEW_MODE_OPTIONS.map((option) => {
              const isActive = viewMode === option.viewMode;
              const ViewModeIcon = option.icon;

              return (
                <Button
                  aria-pressed={isActive}
                  className={cn(
                    styles.TribeEventsCalendarHeader__viewButton,
                    isActive && styles["TribeEventsCalendarHeader__viewButton--active"]
                  )}
                  key={option.viewMode}
                  size={BUTTON_ATTRIBUTE.sizeIcon}
                  type={BUTTON_ATTRIBUTE.typeButton}
                  variant={BUTTON_ATTRIBUTE.variantGhost}
                  onClick={() => onChooseViewMode(option.viewMode)}
                >
                  {isActive ? (
                    <motion.span
                      aria-hidden
                      className={styles.TribeEventsCalendarHeader__viewIndicator}
                      layoutId={VIEW_MODE_INDICATOR_LAYOUT_ID}
                      transition={shouldAnimateViewMode ? SPRING_LAYOUT : INSTANT_TRANSITION}
                    />
                  ) : null}
                  <ViewModeIcon
                    aria-hidden
                    className={styles.TribeEventsCalendarHeader__viewIcon}
                  />
                  <span className={styles.TribeEventsCalendarHeader__srOnly}>{option.label}</span>
                </Button>
              );
            })}
          </div>
          {canManageEvents && pendingProposalCount > 0 && onOpenProposals ? (
            // The count rolls when it changes; the label keeps the exact
            // number for assistive technology while both digits overlap.
            <Button
              aria-label={COPY.pendingProposalsLabel(pendingProposalCount)}
              type={BUTTON_ATTRIBUTE.typeButton}
              variant={BUTTON_ATTRIBUTE.variantOutline}
              onClick={onOpenProposals}
            >
              <InboxIcon aria-hidden />
              {COPY.pendingProposalsButton}
              {COPY.pendingProposalsCountOpen}
              <AnimatedCount value={pendingProposalCount} />
              {COPY.pendingProposalsCountClose}
            </Button>
          ) : null}
          {canManageEvents ? (
            <Button type={BUTTON_ATTRIBUTE.typeButton} onClick={onCreateEvent}>
              {COPY.createButton}
            </Button>
          ) : null}
          {canProposeEvents && onOpenProposals ? (
            <Button
              type={BUTTON_ATTRIBUTE.typeButton}
              variant={BUTTON_ATTRIBUTE.variantGhost}
              onClick={onOpenProposals}
            >
              {COPY.myProposalsButton}
            </Button>
          ) : null}
          {onSubscribeCalendar ? (
            <Button
              type={BUTTON_ATTRIBUTE.typeButton}
              variant={BUTTON_ATTRIBUTE.variantGhost}
              onClick={onSubscribeCalendar}
            >
              <RssIcon aria-hidden />
              {COPY.subscribeCalendarButton}
            </Button>
          ) : null}
          {canProposeEvents && onProposeEvent ? (
            <Button
              type={BUTTON_ATTRIBUTE.typeButton}
              variant={BUTTON_ATTRIBUTE.variantOutline}
              onClick={onProposeEvent}
            >
              <LightbulbIcon aria-hidden />
              {COPY.proposeButton}
            </Button>
          ) : null}
        </div>
      </div>
      {typeFilter ? (
        <div className={styles.TribeEventsCalendarHeader__filters}>{typeFilter}</div>
      ) : null}
    </header>
  );
}
