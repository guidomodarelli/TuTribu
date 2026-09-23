"use client";

import type { ReactNode } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "beez-ui";

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
  const isPast = (occurrence: TribeEventOccurrenceResult) =>
    nowTime !== null && isOccurrencePast(occurrence, nowTime);
  const resolveDotClassName = (occurrence: TribeEventOccurrenceResult) => {
    if (isOccurrenceCancelled(occurrence)) {
      return styles["TribeEventsMonthGrid__dayDot--cancelled"];
    }

    return isPast(occurrence)
      ? styles["TribeEventsMonthGrid__dayDot--past"]
      : styles.TribeEventsMonthGrid__dayDot;
  };
  const resolvePillClassName = (occurrence: TribeEventOccurrenceResult) => {
    if (isOccurrenceCancelled(occurrence)) {
      return styles["TribeEventsMonthGrid__eventPill--cancelled"];
    }

    return isPast(occurrence)
      ? styles["TribeEventsMonthGrid__eventPill--past"]
      : styles.TribeEventsMonthGrid__eventPill;
  };
  const activeDayEvents = activeDayKey
    ? (occurrencesByDay[activeDayKey] ?? NO_OCCURRENCES)
    : NO_OCCURRENCES;

  return (
    <>
      <Table aria-label={COPY.calendarTableLabel} className={styles.TribeEventsMonthGrid}>
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
                    className={
                      isToday
                        ? styles["TribeEventsMonthGrid__dayCell--today"]
                        : styles.TribeEventsMonthGrid__dayCell
                    }
                    key={day.dateKey}
                  >
                    <span
                      className={
                        day.isCurrentMonth
                          ? styles.TribeEventsMonthGrid__dayNumber
                          : styles["TribeEventsMonthGrid__dayNumber--muted"]
                      }
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
                            className={resolveDotClassName(occurrence)}
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
                    ) : null}
                    <div className={styles.TribeEventsMonthGrid__dayEvents}>
                      {dayOccurrences.map((occurrence) => (
                        <button
                          className={resolvePillClassName(occurrence)}
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
                            className={
                              isOccurrenceCancelled(occurrence)
                                ? styles["TribeEventsMonthGrid__eventPillTitle--cancelled"]
                                : styles.TribeEventsMonthGrid__eventPillTitle
                            }
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
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {activeDayKey && activeDayEvents.length > 0 ? (
        <section
          aria-label={COPY.dayEventsLabel}
          className={styles.TribeEventsMonthGrid__daySummary}
        >
          <TribeEventsAgendaDay
            dayKey={activeDayKey}
            firstOccurrence={activeDayEvents[0]}
            todayKey={todayKey}
          >
            {activeDayEvents.map(renderOccurrence)}
          </TribeEventsAgendaDay>
        </section>
      ) : null}
    </>
  );
}
