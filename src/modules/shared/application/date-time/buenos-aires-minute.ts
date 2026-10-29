/**
 * Converts between instants and the `YYYY-MM-DDTHH:mm` value a `datetime-local` input holds, read as Buenos Aires time
 * (the product's single time zone). Pure and deterministic, so the server render and the first browser render agree.
 *
 * @module buenos-aires-minute
 */
import { BUENOS_AIRES_TIME_ZONE, BUENOS_AIRES_UTC_OFFSET } from "@/src/constants/date-time";

/** Shape of a `datetime-local` value at minute precision. */
const BUENOS_AIRES_MINUTE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/u;

const SECONDS_SUFFIX = ":00";
const MINUTE_KEY_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
  minute: "2-digit",
  month: "2-digit",
  timeZone: BUENOS_AIRES_TIME_ZONE,
  year: "numeric",
});

/**
 * @param instant - Any instant.
 * @returns Its Buenos Aires `YYYY-MM-DDTHH:mm`, ready for a `datetime-local` input.
 */
export function toBuenosAiresMinuteKey(instant: Date): string {
  const parts = Object.fromEntries(MINUTE_KEY_FORMATTER.formatToParts(instant).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/**
 * @param key - A `datetime-local` value read as Buenos Aires time.
 * @returns The instant it names, or `null` when it is not a complete, real minute (a key that does not round-trip).
 */
export function fromBuenosAiresMinuteKey(key: string): Date | null {
  if (!BUENOS_AIRES_MINUTE_KEY_PATTERN.test(key)) return null;
  const instant = new Date(key + SECONDS_SUFFIX + BUENOS_AIRES_UTC_OFFSET);
  return Number.isFinite(instant.getTime()) && toBuenosAiresMinuteKey(instant) === key ? instant : null;
}
