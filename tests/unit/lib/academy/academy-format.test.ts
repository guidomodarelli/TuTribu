import { describe, expect, it } from "vitest";

import {
  buildBonusEndsAt,
  formatAcademyDate,
  formatAcademyPrice,
} from "@/lib/academy/academy-format";

describe("academy format", () => {
  it("formats catalog prices with Argentine grouping and frequency", () => {
    expect(formatAcademyPrice({ amountCents: 1_500_000, currency: "ARS", frequency: "monthly" })).toBe(
      "$ 15.000 por mes"
    );
    expect(formatAcademyPrice({ amountCents: 1_234_550, currency: "ARS", frequency: "monthly" })).toBe(
      "$ 12.345,50 por mes"
    );
  });

  it("formats access dates in Buenos Aires time", () => {
    // 02:30 UTC is still the previous day in Buenos Aires (UTC-3).
    expect(formatAcademyDate("2026-07-01T02:30:00.000Z")).toBe("30 jun 2026");
  });

  it("ends a bonus at the start of the day after the chosen one", () => {
    expect(buildBonusEndsAt("2026-07-15")).toBe("2026-07-16T03:00:00.000Z");
    expect(buildBonusEndsAt("")).toBe("");
  });
});
