import { BUENOS_AIRES_TIME_ZONE } from "@/src/constants/date-time";

/**
 * Formats event times in the viewer's own time zone, next to the product's
 * Buenos Aires time, only when both clocks differ at that instant. Helpers are
 * pure; the caller supplies the viewer zone (null before hydration).
 */

const LOCALE = "es-AR";
const FORMAT_OPTION = {
  hourCycle: "h23",
  numeric: "numeric",
  short: "short",
  twoDigit: "2-digit",
} as const;
const DATE_PART = {
  day: "day",
  hour: "hour",
  minute: "minute",
  month: "month",
  second: "second",
  year: "year",
} as const;
const MILLISECONDS_PER_MINUTE = 60_000;
const MONTH_INDEX_OFFSET = 1;
const TIME_RANGE_SEPARATOR = " - ";
const DATE_TIME_SEPARATOR = " ";
const DATE_KEY_SEPARATOR = "-";
const VIEWER_TIME_SUFFIX = " tu hora";
const TRAILING_PERIOD_PATTERN = /\.$/;

type ZoneFormatters = {
  date: Intl.DateTimeFormat;
  offsetParts: Intl.DateTimeFormat;
  time: Intl.DateTimeFormat;
};

/**
 * Formatter construction is expensive, and agendas format many rows, so each
 * zone builds its formatters once. Unknown zones are cached as null.
 */
const zoneFormattersCache = new Map<string, ZoneFormatters | null>();

function getZoneFormatters(timeZone: string): ZoneFormatters | null {
  const cachedFormatters = zoneFormattersCache.get(timeZone);

  if (cachedFormatters !== undefined) {
    return cachedFormatters;
  }

  let formatters: ZoneFormatters | null;

  try {
    formatters = {
      date: new Intl.DateTimeFormat(LOCALE, {
        day: FORMAT_OPTION.twoDigit,
        month: FORMAT_OPTION.short,
        timeZone,
      }),
      offsetParts: new Intl.DateTimeFormat(LOCALE, {
        day: FORMAT_OPTION.numeric,
        hour: FORMAT_OPTION.numeric,
        hourCycle: FORMAT_OPTION.hourCycle,
        minute: FORMAT_OPTION.numeric,
        month: FORMAT_OPTION.numeric,
        second: FORMAT_OPTION.numeric,
        timeZone,
        year: FORMAT_OPTION.numeric,
      }),
      time: new Intl.DateTimeFormat(LOCALE, {
        hour: FORMAT_OPTION.twoDigit,
        hourCycle: FORMAT_OPTION.hourCycle,
        minute: FORMAT_OPTION.twoDigit,
        timeZone,
      }),
    };
  } catch (error) {
    // An unknown IANA zone throws RangeError; treat it as "no local time".
    if (!(error instanceof RangeError)) {
      throw error;
    }

    formatters = null;
  }

  zoneFormattersCache.set(timeZone, formatters);

  return formatters;
}

function readPart(parts: Intl.DateTimeFormatPart[], type: string): number {
  return Number(parts.find((part) => part.type === type)?.value);
}

/**
 * UTC offset of `timeZone` at `instant`, in minutes (Buenos Aires is -180).
 */
function getTimeZoneOffsetMinutes(formatters: ZoneFormatters, instant: Date): number {
  const parts = formatters.offsetParts.formatToParts(instant);
  const wallClockAsUtc = Date.UTC(
    readPart(parts, DATE_PART.year),
    readPart(parts, DATE_PART.month) - MONTH_INDEX_OFFSET,
    readPart(parts, DATE_PART.day),
    readPart(parts, DATE_PART.hour),
    readPart(parts, DATE_PART.minute),
    readPart(parts, DATE_PART.second)
  );

  return Math.round((wallClockAsUtc - instant.getTime()) / MILLISECONDS_PER_MINUTE);
}

function formatShortDate(formatters: ZoneFormatters, instant: Date): string {
  const parts = formatters.date.formatToParts(instant);
  const day = parts.find((part) => part.type === DATE_PART.day)?.value ?? "";
  const month = (parts.find((part) => part.type === DATE_PART.month)?.value ?? "").replace(
    TRAILING_PERIOD_PATTERN,
    ""
  );

  return day + DATE_TIME_SEPARATOR + month;
}

/**
 * Calendar day of `instant` in the formatter zone as `YYYY-M-D`. The year is
 * part of the key so ranges ending on the same day and month of a later year
 * are still recognized as ending on another day.
 */
function formatDateKey(formatters: ZoneFormatters, instant: Date): string {
  const parts = formatters.offsetParts.formatToParts(instant);

  return [
    readPart(parts, DATE_PART.year),
    readPart(parts, DATE_PART.month),
    readPart(parts, DATE_PART.day),
  ].join(DATE_KEY_SEPARATOR);
}

/**
 * End of a viewer-local range: its clock time, prefixed by the local short
 * date when it falls on a later local day than the start ("07 may 03:00"),
 * mirroring `formatBuenosAiresTimeRange` in the viewer zone.
 */
function formatViewerEndLabel(formatters: ZoneFormatters, start: Date, end: Date): string {
  const endsOnOtherDay = formatDateKey(formatters, end) !== formatDateKey(formatters, start);

  return (
    (endsOnOtherDay ? formatShortDate(formatters, end) + DATE_TIME_SEPARATOR : "") +
    formatters.time.format(end)
  );
}

/**
 * Viewer-local label for an occurrence: "18:00 - 19:00 tu hora", prefixed by
 * the local short date ("07 may 03:00 tu hora") when the local day differs
 * from the Buenos Aires day. When the range crosses local midnight, the end
 * carries its own local date ("23:00 - 07 may 03:00 tu hora").
 *
 * @param startsAt - ISO start instant.
 * @param endsAt - ISO end instant, or null for open-ended occurrences.
 * @param viewerTimeZone - IANA zone of the browser, null before hydration.
 * @returns The label, or null when there is no zone, it is unknown, or its
 * offset matches Buenos Aires at the start instant and, when present, at the
 * end instant.
 */
export function formatViewerLocalTimeLabel(
  startsAt: string,
  endsAt: string | null,
  viewerTimeZone: string | null
): string | null {
  if (!viewerTimeZone) {
    return null;
  }

  const viewerFormatters = getZoneFormatters(viewerTimeZone);
  const buenosAiresFormatters = getZoneFormatters(BUENOS_AIRES_TIME_ZONE);
  const start = new Date(startsAt);
  const end = endsAt ? new Date(endsAt) : null;

  if (!viewerFormatters || !buenosAiresFormatters) {
    return null;
  }

  // A range can straddle a daylight-saving transition in only one zone, so
  // both ends must match before the Buenos Aires label alone is accurate.
  const offsetsMatchAt = (instant: Date) =>
    getTimeZoneOffsetMinutes(viewerFormatters, instant) ===
    getTimeZoneOffsetMinutes(buenosAiresFormatters, instant);

  if (offsetsMatchAt(start) && (!end || offsetsMatchAt(end))) {
    return null;
  }

  const isOtherDay =
    formatDateKey(viewerFormatters, start) !== formatDateKey(buenosAiresFormatters, start);
  const startLabel =
    (isOtherDay ? formatShortDate(viewerFormatters, start) + DATE_TIME_SEPARATOR : "") +
    viewerFormatters.time.format(start);
  const endLabel = end ? formatViewerEndLabel(viewerFormatters, start, end) : null;

  return (
    startLabel + (endLabel ? TIME_RANGE_SEPARATOR + endLabel : "") + VIEWER_TIME_SUFFIX
  );
}
