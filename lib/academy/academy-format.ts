/**
 * Deterministic presentation helpers for the academy screens. They produce
 * the same text on the server and in the browser (no ICU-dependent currency
 * spacing), so server HTML and the first client render always match.
 *
 * @module academy-format
 */

import {
  addDaysToBuenosAiresDateKey,
  buildBuenosAiresInstant,
  formatBuenosAiresShortDate,
  getBuenosAiresDateKey,
} from "@/lib/date-time/buenos-aires-format";

const YEAR_LENGTH = 4;
const CENTS_PER_UNIT = 100;
const THOUSANDS_GROUP_PATTERN = /\B(?=(\d{3})+(?!\d))/g;
const THOUSANDS_SEPARATOR = ".";
const DECIMAL_SEPARATOR = ",";
const CENTS_DIGITS = 2;
const START_OF_DAY = "00:00";
const CURRENCY_SYMBOL: Record<string, string> = { ARS: "$" };
const FREQUENCY_LABEL: Record<string, string> = { monthly: "por mes" };

/**
 * "06 may 2026" in Buenos Aires time.
 *
 * @param isoDate - ISO instant.
 * @returns Spanish short date with year.
 */
export function formatAcademyDate(isoDate: string): string {
  return `${formatBuenosAiresShortDate(isoDate)} ${getBuenosAiresDateKey(isoDate).slice(0, YEAR_LENGTH)}`;
}

/**
 * "$ 15.000 por mes" (cents only when present).
 *
 * @param price - Catalog price of the academy.
 * @returns Spanish price label.
 */
export function formatAcademyPrice(price: {
  amountCents: number;
  currency: string;
  frequency: string;
}): string {
  const units = Math.floor(price.amountCents / CENTS_PER_UNIT);
  const cents = price.amountCents % CENTS_PER_UNIT;
  const amount =
    String(units).replace(THOUSANDS_GROUP_PATTERN, THOUSANDS_SEPARATOR) +
    (cents > 0 ? DECIMAL_SEPARATOR + String(cents).padStart(CENTS_DIGITS, "0") : "");
  const symbol = CURRENCY_SYMBOL[price.currency] ?? price.currency;
  const frequency = FREQUENCY_LABEL[price.frequency] ?? price.frequency;

  return `${symbol} ${amount} ${frequency}`;
}

/**
 * Exclusive end instant of a bonus that lasts through the chosen Buenos Aires
 * day: access ends at the start of the following day (`[start, end)`).
 *
 * @param dateKey - `YYYY-MM-DD` chosen in a date input.
 * @returns ISO instant, or an empty value for an empty date.
 */
export function buildBonusEndsAt(dateKey: string): string {
  const nextDay = addDaysToBuenosAiresDateKey(dateKey, 1);

  return nextDay ? buildBuenosAiresInstant(nextDay, START_OF_DAY) : "";
}

/**
 * Today's Buenos Aires date key, used as the minimum of the bonus date input.
 *
 * @param now - Current instant.
 * @returns `YYYY-MM-DD`.
 */
export function getTodayDateKey(now: Date): string {
  return getBuenosAiresDateKey(now);
}
