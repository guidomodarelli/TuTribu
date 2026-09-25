"use client";

import type { ReactNode } from "react";
import {
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  InboxIcon,
  LightbulbIcon,
  ListIcon,
} from "lucide-react";
import { Button } from "beez-ui";

import { Link } from "@/components/navigation/link";
import { formatBuenosAiresMonthTitle } from "@/lib/date-time/buenos-aires-format";
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
  nextMonthHref: string;
  onChooseViewMode: (viewMode: TribeEventsViewMode) => void;
  onCreateEvent: () => void;
  /** Opens the proposals panel (manager queue or the member's own list). */
  onOpenProposals?: () => void;
  onProposeEvent?: () => void;
  /** Pending proposals waiting for review (managers). */
  pendingProposalCount?: number;
  previousMonthHref: string;
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
  variantSecondary: "secondary",
} as const;
const COPY = {
  createButton: "Crear evento",
  myProposalsButton: "Mis propuestas",
  pendingProposalsButton: (count: number) => `Propuestas (${count})`,
  proposeButton: "Proponer un encuentro",
  nextMonth: "Mes siguiente",
  previousMonth: "Mes anterior",
  today: "Hoy",
  viewCalendar: "Ver calendario",
  viewList: "Ver lista",
  viewModeLabel: "Vista de eventos",
} as const;

/**
 * Month navigation, "Hoy" shortcut with the Buenos Aires clock, view toggle,
 * the type filter, the create action and "Propuestas (N)" for managers, and
 * "Proponer un encuentro" for members.
 */
export function TribeEventsCalendarHeader({
  canManageEvents,
  canProposeEvents = false,
  month,
  nextMonthHref,
  onChooseViewMode,
  onCreateEvent,
  onOpenProposals,
  onProposeEvent,
  pendingProposalCount = 0,
  previousMonthHref,
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
          className={styles.TribeEventsCalendarHeader__iconLink}
          href={previousMonthHref}
        >
          <ChevronLeftIcon aria-hidden />
        </Link>
        <h1 className={styles.TribeEventsCalendarHeader__title}>
          {formatBuenosAiresMonthTitle(month)}
        </h1>
        <Link
          aria-label={COPY.nextMonth}
          className={styles.TribeEventsCalendarHeader__iconLink}
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
          >
            <Button
              aria-pressed={viewMode === TRIBE_EVENTS_VIEW_MODE.list}
              size={BUTTON_ATTRIBUTE.sizeIcon}
              type={BUTTON_ATTRIBUTE.typeButton}
              variant={
                viewMode === TRIBE_EVENTS_VIEW_MODE.list
                  ? BUTTON_ATTRIBUTE.variantSecondary
                  : BUTTON_ATTRIBUTE.variantGhost
              }
              onClick={() => onChooseViewMode(TRIBE_EVENTS_VIEW_MODE.list)}
            >
              <ListIcon aria-hidden />
              <span className={styles.TribeEventsCalendarHeader__srOnly}>{COPY.viewList}</span>
            </Button>
            <Button
              aria-pressed={viewMode === TRIBE_EVENTS_VIEW_MODE.calendar}
              size={BUTTON_ATTRIBUTE.sizeIcon}
              type={BUTTON_ATTRIBUTE.typeButton}
              variant={
                viewMode === TRIBE_EVENTS_VIEW_MODE.calendar
                  ? BUTTON_ATTRIBUTE.variantSecondary
                  : BUTTON_ATTRIBUTE.variantGhost
              }
              onClick={() => onChooseViewMode(TRIBE_EVENTS_VIEW_MODE.calendar)}
            >
              <CalendarDaysIcon aria-hidden />
              <span className={styles.TribeEventsCalendarHeader__srOnly}>
                {COPY.viewCalendar}
              </span>
            </Button>
          </div>
          {canManageEvents && pendingProposalCount > 0 && onOpenProposals ? (
            <Button
              type={BUTTON_ATTRIBUTE.typeButton}
              variant={BUTTON_ATTRIBUTE.variantOutline}
              onClick={onOpenProposals}
            >
              <InboxIcon aria-hidden />
              {COPY.pendingProposalsButton(pendingProposalCount)}
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
