import { describe, expect, it } from "vitest";

import {
  tribeEventAttendanceStreakMutationFragmentSchema,
  tribeEventAttendanceStreakPropsSchema,
  tribeEventAttendanceStreakResponseSchema,
  tribeEventDeleteResponseSchema,
  tribeEventFailureResponseSchema,
} from "@/src/modules/events/application/results/tribe-event-public-dto-schemas";

describe("tribeEventAttendanceStreakResponseSchema", () => {
  it("keeps only the allowlisted streak counts", () => {
    const parsedBody = tribeEventAttendanceStreakResponseSchema.parse({
      attendanceStreak: { attendedCount: 3, occurrenceCount: 5, viewerId: "member-1" },
      internalDiagnostics: "hidden",
    });

    expect(parsedBody).toEqual({ attendanceStreak: { attendedCount: 3, occurrenceCount: 5 } });
  });

  it("accepts a viewer without streak", () => {
    expect(tribeEventAttendanceStreakResponseSchema.parse({ attendanceStreak: null })).toEqual({
      attendanceStreak: null,
    });
  });

  it("carries the next streak refresh instant as an ISO UTC instant or null", () => {
    expect(
      tribeEventAttendanceStreakResponseSchema.parse({
        attendanceStreak: null,
        attendanceStreakNextRefreshAt: "2026-06-01T05:00:00.000Z",
      })
    ).toEqual({
      attendanceStreak: null,
      attendanceStreakNextRefreshAt: "2026-06-01T05:00:00.000Z",
    });
    expect(
      tribeEventAttendanceStreakResponseSchema.parse({
        attendanceStreak: null,
        attendanceStreakNextRefreshAt: null,
      })
    ).toEqual({ attendanceStreak: null, attendanceStreakNextRefreshAt: null });
  });

  it("carries the database instant the streak was computed at", () => {
    expect(
      tribeEventAttendanceStreakResponseSchema.parse({
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
    expect(tribeEventAttendanceStreakResponseSchema.safeParse(body).success).toBe(false);
  });
});

describe("tribeEventAttendanceStreakMutationFragmentSchema", () => {
  it("keeps only the allowlisted streak counts and next refresh instant", () => {
    expect(
      tribeEventAttendanceStreakMutationFragmentSchema.parse({
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
      tribeEventAttendanceStreakMutationFragmentSchema.parse({ attendanceStreak: null })
    ).toEqual({ attendanceStreak: null });
    expect(
      tribeEventAttendanceStreakMutationFragmentSchema.parse({
        attendanceStreakNextRefreshAt: null,
      })
    ).toEqual({ attendanceStreakNextRefreshAt: null });
    expect(
      tribeEventAttendanceStreakMutationFragmentSchema.parse({
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
    expect(tribeEventAttendanceStreakMutationFragmentSchema.safeParse(fragment).success).toBe(
      false
    );
  });
});

describe("tribeEventAttendanceStreakPropsSchema", () => {
  it("keeps the streak snapshot the events page passes to the calendar", () => {
    expect(
      tribeEventAttendanceStreakPropsSchema.parse({
        attendanceStreak: { attendedCount: 2, occurrenceCount: 5, viewerId: "member-1" },
        attendanceStreakComputedAt: "2026-05-27T18:29:57.000Z",
        attendanceStreakNextRefreshAt: null,
      })
    ).toEqual({
      attendanceStreak: { attendedCount: 2, occurrenceCount: 5 },
      attendanceStreakComputedAt: "2026-05-27T18:29:57.000Z",
      attendanceStreakNextRefreshAt: null,
    });
  });

  it("rejects a snapshot without its computed instant", () => {
    expect(
      tribeEventAttendanceStreakPropsSchema.safeParse({
        attendanceStreak: null,
        attendanceStreakNextRefreshAt: null,
      }).success
    ).toBe(false);
  });
});

describe("streak refresh inside a mutation body", () => {
  it("drops only the unusable field and keeps the successful mutation body", () => {
    expect(
      tribeEventDeleteResponseSchema.parse({
        attendanceStreak: { attendedCount: -1, occurrenceCount: 5 },
        attendanceStreakComputedAt: "2026-05-27T18:29:57.000Z",
        attendanceStreakNextRefreshAt: "mañana",
        message: "Evento eliminado.",
      })
    ).toEqual({
      attendanceStreakComputedAt: "2026-05-27T18:29:57.000Z",
      message: "Evento eliminado.",
    });
  });
});

describe("tribeEventFailureResponseSchema", () => {
  it("keeps the safe message and the occurrence_ended code only", () => {
    expect(
      tribeEventFailureResponseSchema.parse({
        code: "occurrence_ended",
        message: "Este evento ya terminó; no se pueden cambiar las respuestas.",
        stack: "hidden",
      })
    ).toEqual({
      code: "occurrence_ended",
      message: "Este evento ya terminó; no se pueden cambiar las respuestas.",
    });
  });

  it("rejects an unknown failure code", () => {
    expect(
      tribeEventFailureResponseSchema.safeParse({ code: "db_error", message: "Error" }).success
    ).toBe(false);
  });
});
