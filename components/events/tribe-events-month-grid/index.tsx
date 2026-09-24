"use client";

import type { ReactNode } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, cn } from "beez-ui";

import { TribeEventsAgendaDay } from "@/components/events/tribe-events-agenda-day";
import {
  formatBuenosAiresLongDate,
  formatBuenosAiresTime,
} from "@/lib/date-time/buenos-aires-format";
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

/**
 * Monday-first month grid. Wide screens show one pill per occurrence; phones
 * show one dot per occurrence and list the selected day under the grid.
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
  const isPast = (occurrence: TribeEventOccurrenceResult) =>
    nowTime !== null && isOccurrencePast(occurrence, nowTime);
  const activeDayEvents = activeDayKey
    ? (occurrencesByDay[activeDayKey] ?? NO_OCCURRENCES)
    : NO_OCCURRENCES;

  return (
    <div className={styles.TribeEventsMonthGrid}>
      <Table
        aria-label={COPY.calendarTableLabel}
        className={styles.TribeEventsMonthGrid__table}
      >
        <TableHeader>
          <TableRow>
            {CALENDAR_DAY_LABELS.map((dayLabel) => (
              <TableHead className={styles.TribeEventsMonthGrid__dayHeader} key={dayLabel}>
                {dayLabel}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {splitCalendarWeeks(calendarDays).map((week, weekIndex) => (
            <TableRow key={KEY_PREFIX_WEEK + weekIndex}>
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
                    <span
                      className={cn(
                        styles.TribeEventsMonthGrid__dayNumber,
                        !day.isCurrentMonth && styles["TribeEventsMonthGrid__dayNumber--muted"]
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
                    {dayOccurrences.length > 0 ? (
                      <button
                        aria-label={COPY.dayButtonLabel(
                          formatBuenosAiresLongDate(dayOccurrences[0].startsAt),
                          dayOccurrences.length
                        )}
                        aria-pressed={activeDayKey === day.dateKey}
                        className={styles.TribeEventsMonthGrid__dayButton}
                        type={BUTTON_TYPE}
                        onClick={() => onSelectDay(day.dateKey)}
                      >
                        {dayOccurrences.slice(0, DAY_DOTS_MAX).map((occurrence) => (
                          <span
                            aria-hidden
                            className={cn(
                              styles.TribeEventsMonthGrid__dayDot,
                              isPast(occurrence) && styles["TribeEventsMonthGrid__dayDot--past"]
                            )}
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
                    ) : null}
                    <div className={styles.TribeEventsMonthGrid__dayEvents}>
                      {dayOccurrences.map((occurrence) => (
                        <button
                          className={cn(
                            styles.TribeEventsMonthGrid__eventPill,
                            isPast(occurrence) && styles["TribeEventsMonthGrid__eventPill--past"]
                          )}
                          key={occurrence.occurrenceKey}
                          type={BUTTON_TYPE}
                          onClick={() => onSelectOccurrence(occurrence)}
                        >
                          <span className={styles.TribeEventsMonthGrid__eventPillTime}>
                            {formatBuenosAiresTime(occurrence.startsAt)}
                          </span>
                          <span className={styles.TribeEventsMonthGrid__eventPillTitle}>
                            {PILL_SEPARATOR}
                            {occurrence.title}
                          </span>
                        </button>
                      ))}
                    </div>
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {activeDayKey && activeDayEvents.length > 0 ? (
        <TribeEventsAgendaDay
          aria-label={COPY.dayEventsLabel}
          className={styles.TribeEventsMonthGrid__daySummary}
          dayKey={activeDayKey}
          firstOccurrence={activeDayEvents[0]}
          todayKey={todayKey}
        >
          {activeDayEvents.map(renderOccurrence)}
        </TribeEventsAgendaDay>
      ) : null}
    </div>
  );
}
