import { describe, expect, it } from "vitest";

import {
  addBillingMonths,
  resolveMonthlyServiceInterval,
} from "@/src/modules/subscriptions/domain/services/monthly-billing-cycle";

describe("addBillingMonths", () => {
  it("keeps the anchor day and clamps it to the month length", () => {
    const anchor = new Date("2026-01-31T15:30:00.000Z");

    expect(addBillingMonths(anchor, 1)).toEqual(new Date("2026-02-28T15:30:00.000Z"));
    // The anchor day is preserved after a short month instead of drifting to the 28th.
    expect(addBillingMonths(anchor, 2)).toEqual(new Date("2026-03-31T15:30:00.000Z"));
    expect(addBillingMonths(anchor, 3)).toEqual(new Date("2026-04-30T15:30:00.000Z"));
  });

  it("handles leap-year February", () => {
    expect(addBillingMonths(new Date("2028-01-30T00:00:00.000Z"), 1)).toEqual(
      new Date("2028-02-29T00:00:00.000Z")
    );
  });
});

describe("resolveMonthlyServiceInterval (AC-25)", () => {
  const anchorAt = new Date("2026-01-31T15:30:00.000Z");

  it("pays the monthly cycle of the invoice, not thirty days from the webhook", () => {
    expect(
      resolveMonthlyServiceInterval({
        anchorAt,
        debitAt: new Date("2026-02-28T15:30:00.000Z"),
      })
    ).toEqual({
      endsAt: new Date("2026-03-31T15:30:00.000Z"),
      startsAt: new Date("2026-02-28T15:30:00.000Z"),
      status: "resolved",
    });
  });

  it("resolves the first cycle from the anchor itself", () => {
    expect(resolveMonthlyServiceInterval({ anchorAt, debitAt: anchorAt })).toEqual({
      endsAt: new Date("2026-02-28T15:30:00.000Z"),
      startsAt: anchorAt,
      status: "resolved",
    });
  });

  it("tolerates a small scheduling drift of the debit date", () => {
    const interval = resolveMonthlyServiceInterval({
      anchorAt,
      debitAt: new Date("2026-03-01T09:00:00.000Z"),
    });

    expect(interval).toEqual({
      endsAt: new Date("2026-03-31T15:30:00.000Z"),
      startsAt: new Date("2026-02-28T15:30:00.000Z"),
      status: "resolved",
    });
  });

  it("gives a late payment only its own cycle, never a new month", () => {
    // Invoice scheduled for April, paid in mid May: it still covers April only.
    const interval = resolveMonthlyServiceInterval({
      anchorAt,
      debitAt: new Date("2026-04-30T15:30:00.000Z"),
    });

    expect(interval).toMatchObject({
      endsAt: new Date("2026-05-31T15:30:00.000Z"),
      startsAt: new Date("2026-04-30T15:30:00.000Z"),
    });
  });

  it("flags a debit date that does not match the recurrence for reconciliation", () => {
    expect(
      resolveMonthlyServiceInterval({
        anchorAt,
        debitAt: new Date("2026-02-14T00:00:00.000Z"),
      })
    ).toEqual({ status: "ambiguous" });
    expect(
      resolveMonthlyServiceInterval({
        anchorAt,
        debitAt: new Date("2025-12-01T00:00:00.000Z"),
      })
    ).toEqual({ status: "ambiguous" });
  });
});
