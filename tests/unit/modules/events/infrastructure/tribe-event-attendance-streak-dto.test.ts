import { describe, expect, it } from "vitest";

import {
  tribeEventAttendanceStreakMutationFragmentDtoSchema,
  tribeEventAttendanceStreakResponseDtoSchema,
} from "@/src/modules/events/infrastructure/api/dto/tribe-event-attendance-streak-dto";

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

  it("carries the database instant the streak was computed at", () => {
    expect(
      tribeEventAttendanceStreakResponseDtoSchema.parse({
        attendanceStreak: null,
        attendanceStreakComputedAt: "2026-05-27T18:29:57.000Z",
        attendanceStreakNextRefreshAt: null,
      })
    ).toEqual({
      attendanceStreak: null,
      attendanceStreakComputedAt: "2026-05-27T18:29:57.000Z",
      attendanceStreakNextRefreshAt: null,
    });
  });

  it.each([
    { attendanceStreak: null, attendanceStreakComputedAt: null },
    { attendanceStreak: null, attendanceStreakComputedAt: "2026-05-27" },
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

describe("tribeEventAttendanceStreakMutationFragmentDtoSchema", () => {
  it("keeps only the allowlisted streak counts and next refresh instant", () => {
    expect(
      tribeEventAttendanceStreakMutationFragmentDtoSchema.parse({
        attendanceStreak: { attendedCount: 3, occurrenceCount: 5, viewerId: "member-1" },
        attendanceStreakNextRefreshAt: "2026-05-06T19:30:00.000Z",
        internalDiagnostics: "hidden",
      })
    ).toEqual({
      attendanceStreak: { attendedCount: 3, occurrenceCount: 5 },
      attendanceStreakNextRefreshAt: "2026-05-06T19:30:00.000Z",
    });
  });

  it("accepts each field on its own, so a failed one can be omitted", () => {
    expect(
      tribeEventAttendanceStreakMutationFragmentDtoSchema.parse({ attendanceStreak: null })
    ).toEqual({ attendanceStreak: null });
    expect(
      tribeEventAttendanceStreakMutationFragmentDtoSchema.parse({
        attendanceStreakNextRefreshAt: null,
      })
    ).toEqual({ attendanceStreakNextRefreshAt: null });
    expect(
      tribeEventAttendanceStreakMutationFragmentDtoSchema.parse({
        attendanceStreakComputedAt: "2026-05-27T18:29:57.000Z",
      })
    ).toEqual({ attendanceStreakComputedAt: "2026-05-27T18:29:57.000Z" });
  });

  it.each([
    { attendanceStreakComputedAt: "ayer" },
    { attendanceStreakNextRefreshAt: "mañana" },
    { attendanceStreakNextRefreshAt: 1_780_000_000_000 },
    { attendanceStreak: { attendedCount: -1, occurrenceCount: 5 } },
  ])("rejects an unusable fragment (%j)", (fragment) => {
    expect(tribeEventAttendanceStreakMutationFragmentDtoSchema.safeParse(fragment).success).toBe(
      false
    );
  });
});
