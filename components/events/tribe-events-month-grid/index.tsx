"use client";

import type { ReactNode } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, cn, PresenceSwap } from "@golfo/ui";

import {
  TRIBE_EVENT_TYPE_BADGE_VARIANT,
  TribeEventTypeBadge,
} from "@/components/events/tribe-event-type-badge";
import { TribeEventsAgendaDay } from "@/components/events/tribe-events-agenda-day";
import {
  formatBuenosAiresLongDate,
  formatBuenosAiresTime,
} from "@/lib/date-time/buenos-aires-format";
import {
  TRIBE_EVENT_OCCURRENCE_EXCEPTION_COPY,
  isOccurrenceCancelled,
} from "@/lib/events/tribe-event-occurrence-exception-copy";
import { isOccurrencePast } from "@/lib/events/tribe-event-occurrence-timing";
import {
  splitCalendarWeeks,
  type TribeEventsCalendarDay,
} from "@/lib/events/tribe-events-calendar-grid";
import type { TribeEventOccurrenceResult } from "@/src/modules/events/application/results/tribe-event-result";
import styles from "./styles.module.scss";

type TribeEventsMonthGridProps = {
  /** Day whose events are listed under the grid on phones. */
  activeDayKey: string | null;
  calendarDays: TribeEventsCalendarDay[];
  /** Current time (epoch ms) or null before hydration. */
  nowTime: number | null;
  occurrencesByDay: Record<string, TribeEventOccurrenceResult[]>;
  onSelectDay: (dayKey: string) => void;
  onSelectOccurrence: (occurrence: TribeEventOccurrenceResult) => void;
  /** Renders one row of the phone day summary. */
  renderOccurrence: (occurrence: TribeEventOccurrenceResult) => ReactNode;
  todayKey: string | null;
};

const CALENDAR_DAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
/** Dots shown per day on phones before the "+N" overflow indicator. */
const DAY_DOTS_MAX = 3;
const ARIA_CURRENT_DATE = "date";
const BUTTON_TYPE = "button";
const KEY_PREFIX_WEEK = "week-";
const PILL_SEPARATOR = " ";
const OVERFLOW_PREFIX = "+";
const NO_OCCURRENCES: TribeEventOccurrenceResult[] = [];
const COPY = {
  calendarTableLabel: "Calendario mensual de eventos",
  dayButtonLabel: (dayLabel: string, eventCount: number) =>
    `${dayLabel}: ${eventCount} ${eventCount === 1 ? "evento" : "eventos"}`,
  dayEventsLabel: "Eventos del día",
  todayBadge: "Hoy",
} as const;

/** Whether the occurrence already ended; unknown before hydration. */
function isPastOccurrence(occurrence: TribeEventOccurrenceResult, nowTime: number | null) {
  return nowTime !== null && isOccurrencePast(occurrence, nowTime);
}

// The root class always stays next to its modifiers (BEM); a cancelled date
// is declared after the past one in the stylesheet, so it wins when both apply.
function resolveDotClassName(occurrence: TribeEventOccurrenceResult, nowTime: number | null) {
  return cn(
    styles.TribeEventsMonthGrid__dayDot,
    isPastOccurrence(occurrence, nowTime) && styles["TribeEventsMonthGrid__dayDot--past"],
    isOccurrenceCancelled(occurrence) && styles["TribeEventsMonthGrid__dayDot--cancelled"]
  );
}

function resolvePillClassName(occurrence: TribeEventOccurrenceResult, nowTime: number | null) {
  return cn(
    styles.TribeEventsMonthGrid__eventPill,
    isPastOccurrence(occurrence, nowTime) && styles["TribeEventsMonthGrid__eventPill--past"],
    isOccurrenceCancelled(occurrence) && styles["TribeEventsMonthGrid__eventPill--cancelled"]
  );
}

type TribeEventsMonthGridDayButtonProps = {
  /** Occurrences of the day; never empty. */
  dayOccurrences: TribeEventOccurrenceResult[];
  isActive: boolean;
  nowTime: number | null;
  onSelect: () => void;
};

/** Phone day button: one dot per occurrence up to the "+N" overflow. */
function TribeEventsMonthGridDayButton({
  dayOccurrences,
  isActive,
  nowTime,
  onSelect,
}: TribeEventsMonthGridDayButtonProps) {
  return (
    <button
      aria-label={COPY.dayButtonLabel(
        formatBuenosAiresLongDate(dayOccurrences[0].startsAt),
        dayOccurrences.length
      )}
      aria-pressed={isActive}
      className={styles.TribeEventsMonthGrid__dayButton}
      type={BUTTON_TYPE}
      onClick={onSelect}
    >
      {dayOccurrences.slice(0, DAY_DOTS_MAX).map((occurrence) => (
        <span
          aria-hidden
          className={resolveDotClassName(occurrence, nowTime)}
          data-event-type={occurrence.eventType}
          key={occurrence.occurrenceKey}
        />
      ))}
      {dayOccurrences.length > DAY_DOTS_MAX ? (
        <span aria-hidden className={styles.TribeEventsMonthGrid__dayOverflow}>
          {OVERFLOW_PREFIX}
          {dayOccurrences.length - DAY_DOTS_MAX}
        </span>
      ) : null}
    </button>
  );
}

type TribeEventsMonthGridDayEventsProps = {
  dayOccurrences: TribeEventOccurrenceResult[];
  nowTime: number | null;
  onSelectOccurrence: (occurrence: TribeEventOccurrenceResult) => void;
};

/** Wide screen pills of the day, one per occurrence. */
function TribeEventsMonthGridDayEvents({
  dayOccurrences,
  nowTime,
  onSelectOccurrence,
}: TribeEventsMonthGridDayEventsProps) {
  return (
    <div className={styles.TribeEventsMonthGrid__dayEvents}>
      {dayOccurrences.map((occurrence) => (
        <button
          className={resolvePillClassName(occurrence, nowTime)}
          data-event-type={occurrence.eventType}
          key={occurrence.occurrenceKey}
          type={BUTTON_TYPE}
          onClick={() => onSelectOccurrence(occurrence)}
        >
          <TribeEventTypeBadge
            eventType={occurrence.eventType}
            variant={TRIBE_EVENT_TYPE_BADGE_VARIANT.compact}
          />
          <span className={styles.TribeEventsMonthGrid__eventPillTime}>
            {PILL_SEPARATOR}
            {formatBuenosAiresTime(occurrence.startsAt)}
          </span>
          <span
            className={cn(
              styles.TribeEventsMonthGrid__eventPillTitle,
              isOccurrenceCancelled(occurrence) &&
                styles["TribeEventsMonthGrid__eventPillTitle--cancelled"]
            )}
          >
            {PILL_SEPARATOR}
            {occurrence.title}
          </span>
          {isOccurrenceCancelled(occurrence) ? (
            <span className={styles.TribeEventsMonthGrid__eventPillStatus}>
              {TRIBE_EVENT_OCCURRENCE_EXCEPTION_COPY.cancelledBadge}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

/** Weekday names of the Monday-first grid. */
function TribeEventsMonthGridHeader() {
  return (
    <TableHeader>
      <TableRow>
        {CALENDAR_DAY_LABELS.map((dayLabel) => (
          <TableHead className={styles.TribeEventsMonthGrid__dayHeader} key={dayLabel}>
            {dayLabel}
          </TableHead>
        ))}
      </TableRow>
    </TableHeader>
  );
}

type TribeEventsMonthGridDayNumberProps = {
  day: TribeEventsCalendarDay;
  isToday: boolean;
};

/** Day number, muted outside the month and announced as today when it is. */
function TribeEventsMonthGridDayNumber({ day, isToday }: TribeEventsMonthGridDayNumberProps) {
  return (
    <span
      className={cn(
        styles.TribeEventsMonthGrid__dayNumber,
        !day.isCurrentMonth && styles["TribeEventsMonthGrid__dayNumber--muted"],
        isToday && styles["TribeEventsMonthGrid__dayNumber--today"]
      )}
    >
      {day.dayNumber}
      {isToday ? (
        <span className={styles.TribeEventsMonthGrid__srOnly}>
          {PILL_SEPARATOR}
          {COPY.todayBadge}
        </span>
      ) : null}
    </span>
  );
}

/**
 * Monday-first month grid. Wide screens show one pill per occurrence, marked
 * with the color and icon of its type (the type name is kept for assistive
 * technology and as a tooltip); phones show one dot per occurrence in its
 * type color and list the selected day under the grid. Cancelled dates are
 * struck through with a visible "Cancelado" label and a hollow dot.
 */
export function TribeEventsMonthGrid({
  activeDayKey,
  calendarDays,
  nowTime,
  occurrencesByDay,
  onSelectDay,
  onSelectOccurrence,
  renderOccurrence,
  todayKey,
}: TribeEventsMonthGridProps) {
  const activeDayEvents = activeDayKey
    ? (occurrencesByDay[activeDayKey] ?? NO_OCCURRENCES)
    : NO_OCCURRENCES;

  return (
    <div className={styles.TribeEventsMonthGrid}>
      <Table
        aria-label={COPY.calendarTableLabel}
        className={styles.TribeEventsMonthGrid__table}
      >
        <TribeEventsMonthGridHeader />
        <TableBody>
          {splitCalendarWeeks(calendarDays).map((week, weekIndex) => (
            <TableRow key={`${KEY_PREFIX_WEEK}${weekIndex}`}>
              {week.map((day) => {
                const isToday = day.dateKey === todayKey;
                const dayOccurrences = occurrencesByDay[day.dateKey] ?? NO_OCCURRENCES;

                return (
                  <TableCell
                    aria-current={isToday ? ARIA_CURRENT_DATE : undefined}
                    className={cn(
                      styles.TribeEventsMonthGrid__dayCell,
                      isToday && styles["TribeEventsMonthGrid__dayCell--today"]
                    )}
                    key={day.dateKey}
                  >
                    <TribeEventsMonthGridDayNumber day={day} isToday={isToday} />
                    {dayOccurrences.length > 0 ? (
                      <TribeEventsMonthGridDayButton
                        dayOccurrences={dayOccurrences}
                        isActive={activeDayKey === day.dateKey}
                        nowTime={nowTime}
                        onSelect={() => onSelectDay(day.dateKey)}
                      />
                    ) : null}
                    <TribeEventsMonthGridDayEvents
                      dayOccurrences={dayOccurrences}
                      nowTime={nowTime}
                      onSelectOccurrence={onSelectOccurrence}
                    />
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {/* Phones only (hidden by CSS on wider screens): tapping another day
          cross-fades the summary instead of swapping it in a single frame. */}
      <div className={styles.TribeEventsMonthGrid__daySummary}>
        {activeDayKey && activeDayEvents.length > 0 ? (
          <PresenceSwap presenceKey={activeDayKey}>
            <TribeEventsAgendaDay
              aria-label={COPY.dayEventsLabel}
              dayKey={activeDayKey}
              firstOccurrence={activeDayEvents[0]}
              todayKey={todayKey}
            >
              {activeDayEvents.map(renderOccurrence)}
            </TribeEventsAgendaDay>
          </PresenceSwap>
        ) : null}
      </div>
    </div>
  );
}
