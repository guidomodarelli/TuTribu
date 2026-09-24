import { TRIBE_EVENT_JOIN_WINDOW_MINUTES } from "@/src/modules/events/constants/tribe-events";
import {
  getTribeEventOccurrenceEndTime,
  type TribeEventOccurrenceTimes,
} from "@/src/modules/events/domain/services/tribe-event-occurrence-timing";

/**
 * Presentation helpers that place an occurrence relative to "now": whether it
 * is upcoming, live, or past, whether the join shortcut applies, and the
 * Spanish countdown copy. Every helper is pure and takes `nowTime` (epoch ms).
 */

export const TRIBE_EVENT_OCCURRENCE_PHASE = {
  live: "live",
  past: "past",
  upcoming: "upcoming",
} as const;

export type TribeEventOccurrencePhase =
  (typeof TRIBE_EVENT_OCCURRENCE_PHASE)[keyof typeof TRIBE_EVENT_OCCURRENCE_PHASE];

const TIME_UNIT = {
  hoursPerDay: 24,
  millisecondsPerMinute: 60_000,
  minutesPerHour: 60,
} as const;
const MINUTES_PER_DAY = TIME_UNIT.hoursPerDay * TIME_UNIT.minutesPerHour;
const COPY = {
  days: (dayCount: number) => (dayCount === 1 ? "1 día" : `${dayCount} días`),
  hours: (hourCount: number) => `${hourCount} h`,
  minutes: (minuteCount: number) => `${minuteCount} min`,
  prefix: "Empieza en ",
  unitSeparator: " ",
} as const;

/**
 * Where the occurrence stands at `nowTime`: live while `startsAt <= now < end`.
 *
 * @param occurrence - Start and optional end of the occurrence.
 * @param nowTime - Current time in epoch milliseconds.
 * @returns The occurrence phase.
 */
export function getOccurrencePhase(
  occurrence: TribeEventOccurrenceTimes,
  nowTime: number
): TribeEventOccurrencePhase {
  if (nowTime < Date.parse(occurrence.startsAt)) {
    return TRIBE_EVENT_OCCURRENCE_PHASE.upcoming;
  }

  return nowTime < getTribeEventOccurrenceEndTime(occurrence)
    ? TRIBE_EVENT_OCCURRENCE_PHASE.live
    : TRIBE_EVENT_OCCURRENCE_PHASE.past;
}

/**
 * Whether the occurrence already finished at `nowTime`.
 */
export function isOccurrencePast(
  occurrence: TribeEventOccurrenceTimes,
  nowTime: number
): boolean {
  return getOccurrencePhase(occurrence, nowTime) === TRIBE_EVENT_OCCURRENCE_PHASE.past;
}

/**
 * Whether any occurrence finished while the clock moved from
 * `previousTime` (exclusive) to `currentTime` (inclusive). A clock that did
 * not move forward never reports a finish, so re-evaluating the same instant
 * (for example after the occurrences change) is a no-op.
 *
 * @param occurrences - Start and optional end of each occurrence.
 * @param previousTime - Previous clock value in epoch milliseconds.
 * @param currentTime - Current clock value in epoch milliseconds.
 * @returns True when at least one end instant lies inside the interval.
 */
export function hasOccurrenceFinishedBetween(
  occurrences: readonly TribeEventOccurrenceTimes[],
  previousTime: number,
  currentTime: number
): boolean {
  return occurrences.some((occurrence) => {
    const endTime = getTribeEventOccurrenceEndTime(occurrence);

    return endTime > previousTime && endTime <= currentTime;
  });
}

/**
 * Whether the occurrence is running at `nowTime`.
 */
export function isOccurrenceLive(
  occurrence: TribeEventOccurrenceTimes,
  nowTime: number
): boolean {
  return getOccurrencePhase(occurrence, nowTime) === TRIBE_EVENT_OCCURRENCE_PHASE.live;
}

/**
 * Whether the "Unirme" shortcut applies: from
 * {@link TRIBE_EVENT_JOIN_WINDOW_MINUTES} before the start until the end.
 *
 * @param occurrence - Start and optional end of the occurrence.
 * @param nowTime - Current time in epoch milliseconds.
 * @returns True inside the join window.
 */
export function isOccurrenceJoinable(
  occurrence: TribeEventOccurrenceTimes,
  nowTime: number
): boolean {
  const joinWindowStart =
    Date.parse(occurrence.startsAt) -
    TRIBE_EVENT_JOIN_WINDOW_MINUTES * TIME_UNIT.millisecondsPerMinute;

  return nowTime >= joinWindowStart && nowTime < getTribeEventOccurrenceEndTime(occurrence);
}

/**
 * Instants (epoch ms) where the occurrence changes how it is shown: the start
 * of the "Unirme" window, the start (live) and the end (finished, attendance
 * closed). A clock that wakes up at these instants keeps the UI in step with
 * the server, which checks the exact time.
 *
 * @param occurrence - Start and optional end of the occurrence.
 * @returns Join window start, start, and end, in that order.
 */
export function getOccurrencePhaseChangeTimes(occurrence: TribeEventOccurrenceTimes): number[] {
  const startTime = Date.parse(occurrence.startsAt);

  return [
    startTime - TRIBE_EVENT_JOIN_WINDOW_MINUTES * TIME_UNIT.millisecondsPerMinute,
    startTime,
    getTribeEventOccurrenceEndTime(occurrence),
  ];
}

/**
 * Spanish countdown to the start: "Empieza en 3 días", "Empieza en 2 h 15 min"
 * or "Empieza en 8 min". Minutes round up so the copy never says zero.
 *
 * @param startsAt - ISO start instant of the occurrence.
 * @param nowTime - Current time in epoch milliseconds (before the start).
 * @returns The countdown label.
 */
export function formatOccurrenceCountdown(startsAt: string, nowTime: number): string {
  const totalMinutes = Math.max(
    1,
    Math.ceil((Date.parse(startsAt) - nowTime) / TIME_UNIT.millisecondsPerMinute)
  );

  if (totalMinutes >= MINUTES_PER_DAY) {
    return COPY.prefix + COPY.days(Math.floor(totalMinutes / MINUTES_PER_DAY));
  }

  const hours = Math.floor(totalMinutes / TIME_UNIT.minutesPerHour);
  const minutes = totalMinutes % TIME_UNIT.minutesPerHour;

  if (hours === 0) {
    return COPY.prefix + COPY.minutes(minutes);
  }

  return minutes === 0
    ? COPY.prefix + COPY.hours(hours)
    : COPY.prefix + COPY.hours(hours) + COPY.unitSeparator + COPY.minutes(minutes);
}
