import { describe, expect, it } from "vitest";

import { tribeEventAttendanceStreakResponseDtoSchema } from "@/src/modules/events/infrastructure/api/dto/tribe-event-attendance-streak-dto";

describe("tribeEventAttendanceStreakResponseDtoSchema", () => {
  it("keeps only the allowlisted streak counts", () => {
    const parsedBody = tribeEventAttendanceStreakResponseDtoSchema.parse({
      attendanceStreak: { attendedCount: 3, occurrenceCount: 5, viewerId: "member-1" },
      internalDiagnostics: "hidden",
    });

    expect(parsedBody).toEqual({ attendanceStreak: { attendedCount: 3, occurrenceCount: 5 } });
  });

  it("accepts a viewer without streak", () => {
    expect(tribeEventAttendanceStreakResponseDtoSchema.parse({ attendanceStreak: null })).toEqual({
      attendanceStreak: null,
    });
  });

  it("carries the next streak refresh instant as an ISO UTC instant or null", () => {
    expect(
      tribeEventAttendanceStreakResponseDtoSchema.parse({
        attendanceStreak: null,
        attendanceStreakNextRefreshAt: "2026-06-01T05:00:00.000Z",
      })
    ).toEqual({
      attendanceStreak: null,
      attendanceStreakNextRefreshAt: "2026-06-01T05:00:00.000Z",
    });
    expect(
      tribeEventAttendanceStreakResponseDtoSchema.parse({
        attendanceStreak: null,
        attendanceStreakNextRefreshAt: null,
      })
    ).toEqual({ attendanceStreak: null, attendanceStreakNextRefreshAt: null });
  });

  it.each([
    { attendanceStreak: null, attendanceStreakNextRefreshAt: "2026-06-01" },
    { attendanceStreak: null, attendanceStreakNextRefreshAt: 1_780_000_000_000 },
    { attendanceStreak: { attendedCount: -1, occurrenceCount: 5 } },
    { attendanceStreak: { attendedCount: 1.5, occurrenceCount: 5 } },
    { attendanceStreak: { attendedCount: 2 } },
    {},
  ])("rejects an unusable streak body (%j)", (body) => {
    expect(tribeEventAttendanceStreakResponseDtoSchema.safeParse(body).success).toBe(false);
  });
});
