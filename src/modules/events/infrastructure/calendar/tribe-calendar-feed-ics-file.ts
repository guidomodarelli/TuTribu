import type { TribeEventCalendarFeedSeriesResult } from "@/src/modules/events/application/results/tribe-event-result";
import {
  TRIBE_EVENT_CALENDAR_FEED_REFRESH,
  TRIBE_EVENT_CALENDAR_FEED_TIME_ZONE,
} from "@/src/modules/events/constants/tribe-event-calendar-feed";
import {
  ICS_DOCUMENT,
  buildIcsCalendarHeaderLines,
  buildTribeEventSeriesIcsLines,
  escapeIcsText,
  serializeIcsLines,
} from "@/src/modules/events/infrastructure/calendar/ics-content-lines";

const ISO_DURATION = {
  hoursSuffix: "H",
  minutesSuffix: "M",
  prefix: "PT",
} as const;
const MINUTES_PER_HOUR = 60;

export type TribeCalendarFeedIcsFile = {
  content: string;
  contentType: string;
};

/**
 * `PT1H` style duration for the refresh hints (whole hours when possible).
 */
function formatRefreshDuration(minutes: number): string {
  return minutes % MINUTES_PER_HOUR === 0
    ? ISO_DURATION.prefix + minutes / MINUTES_PER_HOUR + ISO_DURATION.hoursSuffix
    : ISO_DURATION.prefix + minutes + ISO_DURATION.minutesSuffix;
}

/**
 * Builds the subscribed calendar of a tribe: one VEVENT per series (RRULE,
 * EXDATE for cancelled dates) plus one RECURRENCE-ID override per moved date,
 * reusing the lines of the single-event download.
 *
 * Instants are UTC; `X-WR-TIMEZONE` only sets the calendar's default display
 * zone. DTSTAMP and LAST-MODIFIED come from each series' last change and
 * SEQUENCE from its persisted revision counter (never from "now"), so the same data always produces the same bytes
 * and the route can answer `304 Not Modified` from a content ETag.
 *
 * @param input - Calendar name (the tribe name) and the series to include.
 * @returns The `text/calendar` body.
 */
export function buildTribeCalendarFeedIcsFile(input: {
  calendarName: string;
  series: readonly TribeEventCalendarFeedSeriesResult[];
}): TribeCalendarFeedIcsFile {
  const refreshDuration = formatRefreshDuration(
    TRIBE_EVENT_CALENDAR_FEED_REFRESH.refreshIntervalMinutes
  );
  const lines = [
    ...buildIcsCalendarHeaderLines(),
    `X-WR-CALNAME:${escapeIcsText(input.calendarName)}`,
    `X-WR-TIMEZONE:${TRIBE_EVENT_CALENDAR_FEED_TIME_ZONE}`,
    `REFRESH-INTERVAL;VALUE=DURATION:${refreshDuration}`,
    `X-PUBLISHED-TTL:${refreshDuration}`,
    ...input.series.flatMap((series) =>
      buildTribeEventSeriesIcsLines({
        dateStamp: series.lastModifiedAt,
        event: series.event,
        occurrenceExceptions: series.occurrenceExceptions,
        revision: { lastModifiedAt: series.lastModifiedAt, sequence: series.calendarSequence },
      })
    ),
    "END:VCALENDAR",
  ];

  return {
    content: serializeIcsLines(lines),
    contentType: ICS_DOCUMENT.contentType,
  };
}
