"use client";

import type { ReactNode } from "react";
import { Badge } from "beez-ui";

import { formatBuenosAiresLongDate } from "@/lib/date-time/buenos-aires-format";
import type { TribeEventOccurrenceResult } from "@/src/modules/events/application/results/tribe-event-result";
import styles from "./styles.module.scss";

type TribeEventsAgendaDayProps = {
  /** Accessible name that exposes the day block as a landmark region. */
  "aria-label"?: string;
  /** Rendered agenda rows of the day, in start order. */
  children: ReactNode;
  /** Parent-owned placement or visibility class merged into the block root. */
  className?: string;
  dayKey: string;
  /** First occurrence of the day, used to format the heading. */
  firstOccurrence: TribeEventOccurrenceResult;
  /** Buenos Aires `YYYY-MM-DD` of today, or null before hydration. */
  todayKey: string | null;
};

const BADGE_VARIANT_SECONDARY = "secondary";
const COPY = {
  todayBadge: "Hoy",
} as const;

/**
 * Day block of the agenda: a `<section>` root with the long date heading (with
 * the "Hoy" badge) followed by the ordered list of that day's occurrences.
 * Parents pass `className` only for their own placement or visibility rules.
 */
export function TribeEventsAgendaDay({
  "aria-label": ariaLabel,
  children,
  className,
  dayKey,
  firstOccurrence,
  todayKey,
}: TribeEventsAgendaDayProps) {
  return (
    <section
      aria-label={ariaLabel}
      className={
        className
          ? `${styles.TribeEventsAgendaDay} ${className}`
          : styles.TribeEventsAgendaDay
      }
    >
      <h2 className={styles.TribeEventsAgendaDay__title}>
        {formatBuenosAiresLongDate(firstOccurrence.startsAt)}
        {dayKey === todayKey ? (
          <Badge variant={BADGE_VARIANT_SECONDARY}>{COPY.todayBadge}</Badge>
        ) : null}
      </h2>
      <ol className={styles.TribeEventsAgendaDay__list}>{children}</ol>
    </section>
  );
}
