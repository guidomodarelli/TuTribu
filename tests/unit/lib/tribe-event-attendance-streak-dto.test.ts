import { describe, expect, it } from "vitest";

import {
  readAttendanceStreakComputedTime,
  readAttendanceStreakNextRefreshTime,
} from "@/lib/events/tribe-event-attendance-streak-dto";

describe("readAttendanceStreakComputedTime", () => {
  it("returns epoch milliseconds for an ISO UTC instant", () => {
    expect(readAttendanceStreakComputedTime("2026-05-06T18:58:00.000Z")).toBe(
      Date.parse("2026-05-06T18:58:00.000Z")
    );
  });

  it.each([null, undefined, "", "2026-05-06", "no es una fecha", 1_780_000_000_000])(
    "returns null for an unusable snapshot instant (%s)",
    (computedAt) => {
      expect(readAttendanceStreakComputedTime(computedAt)).toBeNull();
    }
  );
});

describe("readAttendanceStreakNextRefreshTime", () => {
  it("returns epoch milliseconds for an ISO UTC instant", () => {
    expect(readAttendanceStreakNextRefreshTime("2026-06-01T05:00:00.000Z")).toBe(
      Date.parse("2026-06-01T05:00:00.000Z")
    );
  });

  it.each([null, undefined, "", "2026-06-01", "no es una fecha", 1_780_000_000_000])(
    "returns null for an unusable refresh instant (%s)",
    (nextRefreshAt) => {
      expect(readAttendanceStreakNextRefreshTime(nextRefreshAt)).toBeNull();
    }
  );
});
