import {
  BUENOS_AIRES_TIME_ZONE,
  BUENOS_AIRES_UTC_OFFSET,
} from "@/src/constants/date-time";

/**
 * Presentation-only date helpers for the product's single time zone (Buenos
 * Aires). Every formatter takes ISO 8601 instants and is safe on both the
 * server and the client.
 */
const LOCALE = {
  machine: "en-CA",
  spanish: "es-AR",
} as const;
const DATE_PART = {
  day: "day",
  month: "month",
  weekday: "weekday",
  year: "year",
} as const;
const FORMAT_OPTION = {
  hourCycle: "h23",
  long: "long",
  numeric: "numeric",
  short: "short",
  twoDigit: "2-digit",
} as const;
const DATE_KEY = {
  firstMonthDayTime: "-01T00:00:00",
  separator: "-",
  timeSeparator: "T",
  secondsSuffix: ":00",
} as const;
const TIME_RANGE_SEPARATOR = " - ";
const DATE_TIME_SEPARATOR = " · ";
const LONG_DATE_MONTH_CONNECTOR = " de ";
const CAPITALIZE_PATTERN = /^\p{Ll}/u;
const TRAILING_PERIOD_PATTERN = /\.$/;

const MONTH_KEY_FORMATTER = new Intl.DateTimeFormat(LOCALE.machine, {
  month: FORMAT_OPTION.twoDigit,
  timeZone: BUENOS_AIRES_TIME_ZONE,
  year: FORMAT_OPTION.numeric,
});
const DATE_KEY_FORMATTER = new Intl.DateTimeFormat(LOCALE.machine, {
  day: FORMAT_OPTION.twoDigit,
  month: FORMAT_OPTION.twoDigit,
  timeZone: BUENOS_AIRES_TIME_ZONE,
  year: FORMAT_OPTION.numeric,
});
const MONTH_TITLE_FORMATTER = new Intl.DateTimeFormat(LOCALE.spanish, {
  month: FORMAT_OPTION.long,
  timeZone: BUENOS_AIRES_TIME_ZONE,
  year: FORMAT_OPTION.numeric,
});
const TIME_FORMATTER = new Intl.DateTimeFormat(LOCALE.spanish, {
  hour: FORMAT_OPTION.twoDigit,
  hourCycle: FORMAT_OPTION.hourCycle,
  minute: FORMAT_OPTION.twoDigit,
  timeZone: BUENOS_AIRES_TIME_ZONE,
});
const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat(LOCALE.spanish, {
  day: FORMAT_OPTION.twoDigit,
  month: FORMAT_OPTION.short,
  timeZone: BUENOS_AIRES_TIME_ZONE,
});
const LONG_DATE_FORMATTER = new Intl.DateTimeFormat(LOCALE.spanish, {
  day: FORMAT_OPTION.numeric,
  month: FORMAT_OPTION.long,
  timeZone: BUENOS_AIRES_TIME_ZONE,
  weekday: FORMAT_OPTION.long,
});

function readPart(
  formatter: Intl.DateTimeFormat,
  date: Date,
  type: string
): string {
  return formatter.formatToParts(date).find((part) => part.type === type)?.value ?? "";
}

function capitalize(value: string): string {
  return value.replace(CAPITALIZE_PATTERN, (letter) => letter.toUpperCase());
}

/**
 * `YYYY-MM` of the instant in Buenos Aires.
 */
export function getBuenosAiresMonthKey(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);

  return (
    readPart(MONTH_KEY_FORMATTER, date, DATE_PART.year) +
    DATE_KEY.separator +
    readPart(MONTH_KEY_FORMATTER, date, DATE_PART.month)
  );
}

/**
 * `YYYY-MM-DD` of the instant in Buenos Aires (also the `<input type="date">` value).
 */
export function getBuenosAiresDateKey(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);

  return [
    readPart(DATE_KEY_FORMATTER, date, DATE_PART.year),
    readPart(DATE_KEY_FORMATTER, date, DATE_PART.month),
    readPart(DATE_KEY_FORMATTER, date, DATE_PART.day),
  ].join(DATE_KEY.separator);
}

/**
 * `HH:MM` of the instant in Buenos Aires (also the `<input type="time">` value).
 */
export function formatBuenosAiresTime(value: string | Date): string {
  return TIME_FORMATTER.format(value instanceof Date ? value : new Date(value));
}

/**
 * "Mayo 2026" for a `YYYY-MM` month key.
 */
export function formatBuenosAiresMonthTitle(month: string): string {
  const date = new Date(
    month + DATE_KEY.firstMonthDayTime + BUENOS_AIRES_UTC_OFFSET
  );

  return (
    capitalize(readPart(MONTH_TITLE_FORMATTER, date, DATE_PART.month)) +
    " " +
    readPart(MONTH_TITLE_FORMATTER, date, DATE_PART.year)
  );
}

function stripTrailingPeriod(value: string): string {
  return value.replace(TRAILING_PERIOD_PATTERN, "");
}

/**
 * "06 may" style short date. Assembled from parts because ICU builds differ
 * in the literal between day and month ("07 may" vs "07-may").
 */
export function formatBuenosAiresShortDate(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);

  return (
    readPart(SHORT_DATE_FORMATTER, date, DATE_PART.day) +
    " " +
    stripTrailingPeriod(readPart(SHORT_DATE_FORMATTER, date, DATE_PART.month))
  );
}

/**
 * "Miércoles 6 de mayo" style long date.
 */
export function formatBuenosAiresLongDate(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);

  return (
    capitalize(readPart(LONG_DATE_FORMATTER, date, DATE_PART.weekday)) +
    " " +
    readPart(LONG_DATE_FORMATTER, date, DATE_PART.day) +
    LONG_DATE_MONTH_CONNECTOR +
    readPart(LONG_DATE_FORMATTER, date, DATE_PART.month)
  );
}

/**
 * "15:00 - 16:00" or "15:00" when the event has no end.
 */
export function formatBuenosAiresTimeRange(
  startsAt: string,
  endsAt: string | null
): string {
  const start = formatBuenosAiresTime(startsAt);

  if (!endsAt) {
    return start;
  }

  const sameDay = getBuenosAiresDateKey(startsAt) === getBuenosAiresDateKey(endsAt);
  const end = sameDay
    ? formatBuenosAiresTime(endsAt)
    : formatBuenosAiresShortDate(endsAt) + " " + formatBuenosAiresTime(endsAt);

  return start + TIME_RANGE_SEPARATOR + end;
}

/**
 * "06 may · 15:00 - 16:00" compact date and time.
 */
export function formatBuenosAiresDateTimeRange(
  startsAt: string,
  endsAt: string | null
): string {
  return (
    formatBuenosAiresShortDate(startsAt) +
    DATE_TIME_SEPARATOR +
    formatBuenosAiresTimeRange(startsAt, endsAt)
  );
}

/**
 * Converts `<input type="date">` and `<input type="time">` values entered as
 * Buenos Aires wall-clock time into a UTC ISO instant.
 */
export function buildBuenosAiresInstant(date: string, time: string): string {
  if (!date || !time) {
    return "";
  }

  return new Date(
    date +
      DATE_KEY.timeSeparator +
      time +
      DATE_KEY.secondsSuffix +
      BUENOS_AIRES_UTC_OFFSET
  ).toISOString();
}
