/**
 * Monthly billing cycle policy for academy subscriptions.
 *
 * Each paid invoice pays the monthly cycle it belongs to, not thirty days from
 * the moment its notification arrived. Cycles start on the anchor day of each
 * month (clamped to the month length, e.g. Jan 31 → Feb 28 → Mar 31) at the
 * anchor time of day, in UTC, and end when the next cycle starts.
 *
 * @module monthly-billing-cycle
 */

import { ACADEMY_BILLING_CYCLE } from "@/src/modules/subscriptions/constants/subscriptions";

/** Maximum distance between a scheduled debit date and its cycle start. */
export const BILLING_CYCLE_DEBIT_TOLERANCE_MS =
  ACADEMY_BILLING_CYCLE.debitToleranceDays * ACADEMY_BILLING_CYCLE.millisecondsPerDay;

const MONTHS_PER_YEAR = 12;

export type MonthlyServiceInterval =
  | { endsAt: Date; startsAt: Date; status: "resolved" }
  | { status: "ambiguous" };

/**
 * Returns the number of days of a UTC month.
 *
 * @param year - Full year.
 * @param monthIndex - Zero-based month, may overflow.
 * @returns Days in that month.
 */
function daysInUtcMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/**
 * Moves an anchor instant by whole billing months, preserving the anchor day
 * and clamping it to the length of the target month.
 *
 * @param anchor - First cycle start.
 * @param months - Number of cycles to move (may be negative).
 * @returns Start of the requested cycle.
 */
export function addBillingMonths(anchor: Date, months: number): Date {
  const totalMonths = anchor.getUTCMonth() + months;
  const year = anchor.getUTCFullYear() + Math.floor(totalMonths / MONTHS_PER_YEAR);
  const monthIndex = ((totalMonths % MONTHS_PER_YEAR) + MONTHS_PER_YEAR) % MONTHS_PER_YEAR;
  const day = Math.min(anchor.getUTCDate(), daysInUtcMonth(year, monthIndex));

  return new Date(
    Date.UTC(
      year,
      monthIndex,
      day,
      anchor.getUTCHours(),
      anchor.getUTCMinutes(),
      anchor.getUTCSeconds(),
      anchor.getUTCMilliseconds()
    )
  );
}

/**
 * Resolves the service interval `[startsAt, endsAt)` paid by an invoice from
 * its scheduled debit date and the contract anchor. When the debit date does
 * not match any cycle start within the tolerance, the result is `ambiguous`
 * and the invoice must go to reconciliation instead of improvising dates.
 *
 * @param input - Contract anchor and invoice debit date.
 * @returns The resolved interval or an ambiguous marker.
 */
export function resolveMonthlyServiceInterval({
  anchorAt,
  debitAt,
  toleranceMs = BILLING_CYCLE_DEBIT_TOLERANCE_MS,
}: {
  anchorAt: Date;
  debitAt: Date;
  toleranceMs?: number;
}): MonthlyServiceInterval {
  const approximateMonths =
    (debitAt.getUTCFullYear() - anchorAt.getUTCFullYear()) * MONTHS_PER_YEAR +
    (debitAt.getUTCMonth() - anchorAt.getUTCMonth());

  for (const candidate of [approximateMonths - 1, approximateMonths, approximateMonths + 1]) {
    if (candidate < 0) {
      continue;
    }

    const startsAt = addBillingMonths(anchorAt, candidate);

    if (Math.abs(debitAt.getTime() - startsAt.getTime()) <= toleranceMs) {
      return {
        endsAt: addBillingMonths(anchorAt, candidate + 1),
        startsAt,
        status: "resolved",
      };
    }
  }

  return { status: "ambiguous" };
}
