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
