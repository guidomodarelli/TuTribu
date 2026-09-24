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

  it.each([
    { attendanceStreak: { attendedCount: -1, occurrenceCount: 5 } },
    { attendanceStreak: { attendedCount: 1.5, occurrenceCount: 5 } },
    { attendanceStreak: { attendedCount: 2 } },
    {},
  ])("rejects an unusable streak body (%j)", (body) => {
    expect(tribeEventAttendanceStreakResponseDtoSchema.safeParse(body).success).toBe(false);
  });
});
