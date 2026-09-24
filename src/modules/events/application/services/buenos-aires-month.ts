import { BUENOS_AIRES_UTC_OFFSET_HOURS } from "@/src/constants/date-time";
import type { TribeEventDateRange } from "@/src/modules/events/domain/entities/tribe-event";

const MONTH_PATTERN = /^\d{4}-\d{2}$/;
const MONTH_FORMAT = {
  monthStartIndex: 5,
  padLength: 2,
  yearEndIndex: 4,
  yearStartIndex: 0,
} as const;
const MONTH_PART = {
  base: 10,
  firstMonth: 1,
  firstMonthDay: 1,
  lastMonth: 12,
  millisecondsPerHour: 3_600_000,
  monthIndexOffset: 1,
} as const;
/**
 * Local midnight in Buenos Aires expressed as a UTC hour (UTC-3 has no DST).
 */
const BUENOS_AIRES_MIDNIGHT_UTC_HOUR = -BUENOS_AIRES_UTC_OFFSET_HOURS;

export const MONTH_OFFSET = {
  next: 1,
  previous: -1,
} as const;

export type MonthParts = {
  month: number;
  year: number;
};

export function formatMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(MONTH_FORMAT.padLength, "0")}`;
}

/**
 * Parses a `YYYY-MM` value, returning null for anything malformed.
 */
export function parseMonth(month: string): MonthParts | null {
  if (!MONTH_PATTERN.test(month)) {
    return null;
  }

  const year = Number.parseInt(
    month.slice(MONTH_FORMAT.yearStartIndex, MONTH_FORMAT.yearEndIndex),
    MONTH_PART.base
  );
  const monthNumber = Number.parseInt(
    month.slice(MONTH_FORMAT.monthStartIndex),
    MONTH_PART.base
  );

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(monthNumber) ||
    monthNumber < MONTH_PART.firstMonth ||
    monthNumber > MONTH_PART.lastMonth
  ) {
    return null;
  }

  return { month: monthNumber, year };
}

function createMonthStartDate(monthParts: MonthParts, offset = 0): Date {
  return new Date(
    Date.UTC(
      monthParts.year,
      monthParts.month - MONTH_PART.monthIndexOffset + offset,
      MONTH_PART.firstMonthDay,
      BUENOS_AIRES_MIDNIGHT_UTC_HOUR
    )
  );
}

export function addMonths(monthParts: MonthParts, offset: number): string {
  const date = createMonthStartDate(monthParts, offset);

  return formatMonth(
    date.getUTCFullYear(),
    date.getUTCMonth() + MONTH_PART.monthIndexOffset
  );
}

/**
 * Calendar month in Buenos Aires of any instant, computed with the fixed
 * offset so it needs no Intl time zone data.
 *
 * @param instant - Instant to place in a Buenos Aires month.
 * @returns The `YYYY-MM` month key.
 */
export function resolveBuenosAiresMonthOf(instant: Date): string {
  const buenosAiresDate = new Date(
    instant.getTime() +
      BUENOS_AIRES_UTC_OFFSET_HOURS * MONTH_PART.millisecondsPerHour
  );

  return formatMonth(
    buenosAiresDate.getUTCFullYear(),
    buenosAiresDate.getUTCMonth() + MONTH_PART.monthIndexOffset
  );
}

/**
 * Current calendar month in Buenos Aires.
 */
export function resolveCurrentBuenosAiresMonth(now: Date = new Date()): string {
  return resolveBuenosAiresMonthOf(now);
}

/**
 * UTC range `[monthStart, nextMonthStart)` covering the Buenos Aires month.
 */
export function createBuenosAiresMonthRange(month: string): TribeEventDateRange {
  const monthParts = parseMonth(month) ?? parseMonth(resolveCurrentBuenosAiresMonth());

  if (!monthParts) {
    throw new Error(`Invalid month value: ${month}`);
  }

  return {
    rangeEnd: createMonthStartDate(monthParts, MONTH_OFFSET.next).toISOString(),
    rangeStart: createMonthStartDate(monthParts).toISOString(),
  };
}
