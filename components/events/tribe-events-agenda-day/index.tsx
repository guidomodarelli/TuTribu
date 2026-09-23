"use client";

import type { ReactNode } from "react";
import { Badge } from "beez-ui";

import { formatBuenosAiresLongDate } from "@/lib/date-time/buenos-aires-format";
import type { TribeEventOccurrenceResult } from "@/src/modules/events/application/results/tribe-event-result";
import styles from "./styles.module.scss";

type TribeEventsAgendaDayProps = {
  /** Rendered agenda rows of the day, in start order. */
  children: ReactNode;
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
 * Day block of the agenda: long date heading (with the "Hoy" badge) followed
 * by the ordered list of that day's occurrences.
 */
export function TribeEventsAgendaDay({
  children,
  dayKey,
  firstOccurrence,
  todayKey,
}: TribeEventsAgendaDayProps) {
  return (
    <>
      <h2 className={styles.TribeEventsAgendaDay__title}>
        {formatBuenosAiresLongDate(firstOccurrence.startsAt)}
        {dayKey === todayKey ? (
          <Badge variant={BADGE_VARIANT_SECONDARY}>{COPY.todayBadge}</Badge>
        ) : null}
      </h2>
      <ol className={styles.TribeEventsAgendaDay__list}>{children}</ol>
    </>
  );
}
