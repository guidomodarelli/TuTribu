import {
  buildBuenosAiresInstant,
  formatBuenosAiresDateTimeRange,
  formatBuenosAiresLongDate,
  formatBuenosAiresMonthTitle,
  formatBuenosAiresTime,
  formatBuenosAiresTimeRange,
  getBuenosAiresDateKey,
  getBuenosAiresMonthKey,
} from "@/lib/date-time/buenos-aires-format";

describe("Buenos Aires date formatting", () => {
  it("derives day and month keys in Buenos Aires local time", () => {
    expect(getBuenosAiresDateKey("2026-05-06T02:30:00.000Z")).toBe("2026-05-05");
    expect(getBuenosAiresMonthKey("2026-06-01T02:30:00.000Z")).toBe("2026-05");
    expect(formatBuenosAiresTime("2026-05-06T02:30:00.000Z")).toBe("23:30");
  });

  it("formats month titles and long dates in Spanish", () => {
    expect(formatBuenosAiresMonthTitle("2026-05")).toBe("Mayo 2026");
    expect(formatBuenosAiresLongDate("2026-05-06T18:00:00.000Z")).toBe(
      "Miércoles 6 de mayo"
    );
  });

  it("formats time ranges, adding the end date when it crosses midnight", () => {
    expect(
      formatBuenosAiresTimeRange("2026-05-06T18:00:00.000Z", "2026-05-06T19:00:00.000Z")
    ).toBe("15:00 - 16:00");
    expect(formatBuenosAiresTimeRange("2026-05-06T18:00:00.000Z", null)).toBe("15:00");
    expect(
      formatBuenosAiresTimeRange("2026-05-07T02:00:00.000Z", "2026-05-07T04:00:00.000Z")
    ).toBe("23:00 - 07 may 01:00");
    expect(
      formatBuenosAiresDateTimeRange("2026-05-06T18:00:00.000Z", "2026-05-06T19:00:00.000Z")
    ).toBe("06 may · 15:00 - 16:00");
  });

  it("converts wall-clock form values into UTC instants", () => {
    expect(buildBuenosAiresInstant("2026-05-06", "15:00")).toBe("2026-05-06T18:00:00.000Z");
    expect(buildBuenosAiresInstant("", "15:00")).toBe("");
    expect(buildBuenosAiresInstant("2026-05-06", "")).toBe("");
  });
});
