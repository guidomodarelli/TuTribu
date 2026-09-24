import { BUENOS_AIRES_UTC_OFFSET_HOURS } from "@/src/constants/date-time";
import {
  TRIBE_EVENT_RANGE_MATCH,
  TRIBE_EVENT_RECURRENCE_EXPANSION_LIMIT,
  TRIBE_EVENT_RECURRENCE_FREQUENCY,
} from "@/src/modules/events/constants/tribe-events";
import type {
  TribeEventDateRange,
  TribeEventOccurrenceWindow,
  TribeEventRangeMatch,
  TribeEventRecurrenceFrequency,
  TribeEventSchedule,
} from "@/src/modules/events/domain/entities/tribe-event";
import { getTribeEventOccurrenceEndTime } from "@/src/modules/events/domain/services/tribe-event-occurrence-timing";

const MILLISECONDS_PER_HOUR = 3_600_000;
const MILLISECONDS_PER_DAY = 86_400_000;
const DAYS_PER_WEEK = 7;
const MONTHS_PER_YEAR = 12;
const WEEKS_PER_BIWEEKLY_INTERVAL = 2;
const SINGLE_OCCURRENCE_RANGE_MS = 1;
const BUENOS_AIRES_OFFSET_MS =
  BUENOS_AIRES_UTC_OFFSET_HOURS * MILLISECONDS_PER_HOUR;
const RECURRENCE_RULE = {
  [TRIBE_EVENT_RECURRENCE_FREQUENCY.weekly]: "FREQ=WEEKLY",
  [TRIBE_EVENT_RECURRENCE_FREQUENCY.biweekly]: "FREQ=WEEKLY;INTERVAL=2",
  [TRIBE_EVENT_RECURRENCE_FREQUENCY.monthly]: "FREQ=MONTHLY",
} as const;
const RECURRENCE_RULE_UNTIL_PREFIX = ";UNTIL=";
const ICS_DATE_TIME_STRIP_PATTERN = /[-:]|\.\d{3}/g;

type WeeklyLikeFrequency =
  | typeof TRIBE_EVENT_RECURRENCE_FREQUENCY.weekly
  | typeof TRIBE_EVENT_RECURRENCE_FREQUENCY.biweekly;

function isWeeklyLike(
  frequency: TribeEventRecurrenceFrequency
): frequency is WeeklyLikeFrequency {
  return (
    frequency === TRIBE_EVENT_RECURRENCE_FREQUENCY.weekly ||
    frequency === TRIBE_EVENT_RECURRENCE_FREQUENCY.biweekly
  );
}

function getWeeklyIntervalMs(frequency: WeeklyLikeFrequency): number {
  const weeks =
    frequency === TRIBE_EVENT_RECURRENCE_FREQUENCY.biweekly
      ? WEEKS_PER_BIWEEKLY_INTERVAL
      : 1;

  return weeks * DAYS_PER_WEEK * MILLISECONDS_PER_DAY;
}

/**
 * Returns the start time of the n-th monthly occurrence, keeping the Buenos
 * Aires wall-clock day and time. Months that lack the anchor day (for example
 * the 31st) are skipped and return null, matching RFC 5545 semantics.
 */
function getMonthlyOccurrenceTime(
  seriesStartTime: number,
  monthOffset: number
): number | null {
  const localAnchor = new Date(seriesStartTime + BUENOS_AIRES_OFFSET_MS);
  const anchorDay = localAnchor.getUTCDate();
  const localOccurrenceTime = Date.UTC(
    localAnchor.getUTCFullYear(),
    localAnchor.getUTCMonth() + monthOffset,
    anchorDay,
    localAnchor.getUTCHours(),
    localAnchor.getUTCMinutes(),
    localAnchor.getUTCSeconds(),
    localAnchor.getUTCMilliseconds()
  );

  if (new Date(localOccurrenceTime).getUTCDate() !== anchorDay) {
    return null;
  }

  return localOccurrenceTime - BUENOS_AIRES_OFFSET_MS;
}

function getOccurrenceTime(
  frequency: TribeEventRecurrenceFrequency,
  seriesStartTime: number,
  index: number
): number | null {
  if (frequency === TRIBE_EVENT_RECURRENCE_FREQUENCY.monthly) {
    return getMonthlyOccurrenceTime(seriesStartTime, index);
  }

  if (isWeeklyLike(frequency)) {
    return seriesStartTime + index * getWeeklyIntervalMs(frequency);
  }

  return index === 0 ? seriesStartTime : null;
}

/**
 * Estimates the first occurrence index that could fall inside the range so the
 * expansion does not walk through every past occurrence of a long series. The
 * estimate is deliberately one step early; the loop skips what is out of range.
 */
function estimateFirstCandidateIndex(
  frequency: TribeEventRecurrenceFrequency,
  seriesStartTime: number,
  rangeStartTime: number
): number {
  if (rangeStartTime <= seriesStartTime) {
    return 0;
  }

  if (frequency === TRIBE_EVENT_RECURRENCE_FREQUENCY.monthly) {
    const localSeriesStart = new Date(seriesStartTime + BUENOS_AIRES_OFFSET_MS);
    const localRangeStart = new Date(rangeStartTime + BUENOS_AIRES_OFFSET_MS);
    const wholeMonths =
      (localRangeStart.getUTCFullYear() - localSeriesStart.getUTCFullYear()) *
        MONTHS_PER_YEAR +
      (localRangeStart.getUTCMonth() - localSeriesStart.getUTCMonth());

    return Math.max(0, wholeMonths - 1);
  }

  if (isWeeklyLike(frequency)) {
    const intervalMs = getWeeklyIntervalMs(frequency);

    return Math.max(
      0,
      Math.floor((rangeStartTime - seriesStartTime) / intervalMs) - 1
    );
  }

  return 0;
}

/**
 * Expands an event series into its concrete occurrences inside a range. Single
 * events yield at most one occurrence.
 *
 * @param schedule - Scheduling facts of the series.
 * @param range - Half-open `[rangeStart, rangeEnd)` range.
 * @param rangeMatch - `startsWithin` (default) keeps occurrences whose start
 *   falls in the range; `overlaps` keeps every occurrence that starts before
 *   `rangeEnd` and whose effective end (explicit or implied by the default
 *   duration) is after `rangeStart`, so a running occurrence that began before
 *   the range is kept no matter how long it lasts.
 * @returns The matching occurrences sorted by start.
 */
export function expandTribeEventOccurrences(
  schedule: TribeEventSchedule,
  range: TribeEventDateRange,
  rangeMatch: TribeEventRangeMatch = TRIBE_EVENT_RANGE_MATCH.startsWithin
): TribeEventOccurrenceWindow[] {
  const seriesStartTime = Date.parse(schedule.startsAt);
  const rangeStartTime = Date.parse(range.rangeStart);
  const rangeEndTime = Date.parse(range.rangeEnd);

  if (
    !Number.isFinite(seriesStartTime) ||
    !Number.isFinite(rangeStartTime) ||
    !Number.isFinite(rangeEndTime) ||
    rangeEndTime <= rangeStartTime
  ) {
    return [];
  }

  const isSingleEvent =
    schedule.recurrenceFrequency === TRIBE_EVENT_RECURRENCE_FREQUENCY.none;
  const durationMs =
    schedule.endsAt === null
      ? null
      : Date.parse(schedule.endsAt) - seriesStartTime;
  const untilTime =
    isSingleEvent || schedule.recurrenceUntil === null
      ? null
      : Date.parse(schedule.recurrenceUntil);
  const matchesByOverlap = rangeMatch === TRIBE_EVENT_RANGE_MATCH.overlaps;
  const effectiveDurationMs = Math.max(
    0,
    getTribeEventOccurrenceEndTime(schedule) - seriesStartTime
  );
  // An overlapping occurrence may start up to one duration before the range.
  const earliestCandidateStartTime = matchesByOverlap
    ? rangeStartTime - effectiveDurationMs
    : rangeStartTime;
  const occurrences: TribeEventOccurrenceWindow[] = [];
  const firstIndex = estimateFirstCandidateIndex(
    schedule.recurrenceFrequency,
    seriesStartTime,
    earliestCandidateStartTime
  );

  for (
    let index = firstIndex;
    index < firstIndex + TRIBE_EVENT_RECURRENCE_EXPANSION_LIMIT;
    index += 1
  ) {
    const occurrenceTime = getOccurrenceTime(
      schedule.recurrenceFrequency,
      seriesStartTime,
      index
    );

    if (occurrenceTime === null) {
      if (isSingleEvent) {
        break;
      }

      continue;
    }

    if (occurrenceTime >= rangeEndTime) {
      break;
    }

    if (untilTime !== null && occurrenceTime > untilTime) {
      break;
    }

    const isInRange = matchesByOverlap
      ? occurrenceTime + effectiveDurationMs > rangeStartTime
      : occurrenceTime >= rangeStartTime;

    if (isInRange) {
      occurrences.push({
        endsAt:
          durationMs === null
            ? null
            : new Date(occurrenceTime + durationMs).toISOString(),
        startsAt: new Date(occurrenceTime).toISOString(),
      });
    }

    if (isSingleEvent) {
      break;
    }
  }

  return occurrences;
}

/**
 * Tells whether `occurrenceStartsAt` is an exact slot of the series.
 */
export function isTribeEventOccurrence(
  schedule: TribeEventSchedule,
  occurrenceStartsAt: string
): boolean {
  const occurrenceTime = Date.parse(occurrenceStartsAt);

  if (!Number.isFinite(occurrenceTime)) {
    return false;
  }

  const rangeStart = new Date(occurrenceTime).toISOString();
  const rangeEnd = new Date(
    occurrenceTime + SINGLE_OCCURRENCE_RANGE_MS
  ).toISOString();

  return expandTribeEventOccurrences(schedule, { rangeEnd, rangeStart }).some(
    (occurrence) => Date.parse(occurrence.startsAt) === occurrenceTime
  );
}

/**
 * Formats an ISO instant as the RFC 5545 UTC form `YYYYMMDDTHHMMSSZ`.
 */
export function formatCalendarUtcDateTime(value: string): string {
  return new Date(value).toISOString().replace(ICS_DATE_TIME_STRIP_PATTERN, "");
}

/**
 * Builds the RFC 5545 RRULE value (without the `RRULE:` prefix) for a series,
 * or null for single events. Shared by the ICS export and calendar links.
 */
export function buildTribeEventRecurrenceRule(
  schedule: TribeEventSchedule
): string | null {
  if (schedule.recurrenceFrequency === TRIBE_EVENT_RECURRENCE_FREQUENCY.none) {
    return null;
  }

  const baseRule = RECURRENCE_RULE[schedule.recurrenceFrequency];

  if (schedule.recurrenceUntil === null) {
    return baseRule;
  }

  return (
    baseRule +
    RECURRENCE_RULE_UNTIL_PREFIX +
    formatCalendarUtcDateTime(schedule.recurrenceUntil)
  );
}
