import type { CSSProperties } from "react";

import { formatBuenosAiresShortDate } from "@/lib/date-time/buenos-aires-format";
import type { TribeEventAttendanceReportResult } from "@/src/modules/events/application/results/tribe-event-result";
import styles from "./styles.module.scss";

type TribeEventAttendanceTrendProps = {
  trend: TribeEventAttendanceReportResult["trend"];
};

/**
 * CSS custom property with the bar height ratio (0–1), the only runtime
 * value of the chart.
 */
const BAR_RATIO_PROPERTY = "--tribe-event-trend-ratio";
const COPY = {
  heading: "Van en las últimas fechas",
  pointLabel: (date: string, count: number) =>
    `${date}: ${count} ${count === 1 ? "persona" : "personas"}`,
} as const;

/**
 * Mini bar chart of "going" answers in the last finished occurrences of a
 * series, oldest first, each labelled with the date it was held (a moved
 * date shows its new day). Each bar is an ordered list item whose visible date
 * and count are also its accessible text, so no information lives only in
 * the bar height.
 */
export function TribeEventAttendanceTrend({ trend }: TribeEventAttendanceTrendProps) {
  if (trend.length === 0) {
    return null;
  }

  const maxGoingCount = Math.max(...trend.map((point) => point.goingCount), 1);

  return (
    <figure className={styles.TribeEventAttendanceTrend}>
      <figcaption className={styles.TribeEventAttendanceTrend__caption}>{COPY.heading}</figcaption>
      <ol className={styles.TribeEventAttendanceTrend__bars}>
        {trend.map((point) => {
          const dateLabel = formatBuenosAiresShortDate(point.occurrenceStartsAt);
          const barStyle = {
            [BAR_RATIO_PROPERTY]: point.goingCount / maxGoingCount,
          } as CSSProperties;

          return (
            <li
              aria-label={COPY.pointLabel(dateLabel, point.goingCount)}
              className={styles.TribeEventAttendanceTrend__point}
              key={point.originalOccurrenceStartsAt}
            >
              <span aria-hidden className={styles.TribeEventAttendanceTrend__count}>
                {point.goingCount}
              </span>
              <span aria-hidden className={styles.TribeEventAttendanceTrend__track}>
                <span className={styles.TribeEventAttendanceTrend__bar} style={barStyle} />
              </span>
              <span aria-hidden className={styles.TribeEventAttendanceTrend__date}>
                {dateLabel}
              </span>
            </li>
          );
        })}
      </ol>
    </figure>
  );
}
