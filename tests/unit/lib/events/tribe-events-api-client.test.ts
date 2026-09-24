import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchTribeEventAttendanceStreakRequest } from "@/lib/events/tribe-events-api-client";

const TRIBE_SLUG = "matematica-pro";
const NEXT_REFRESH_AT = "2099-01-01T00:00:00.000Z";

/**
 * Stubs the browser fetch with a single route answer.
 */
function answerStreakRead(body: unknown, ok = true) {
  global.fetch = vi.fn(async () => ({
    json: async () => body,
    ok,
  })) as unknown as typeof fetch;
}

describe("fetchTribeEventAttendanceStreakRequest", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("returns a successful read with the streak and its next refresh instant", async () => {
    answerStreakRead({
      attendanceStreak: { attendedCount: 4, occurrenceCount: 5 },
      attendanceStreakNextRefreshAt: NEXT_REFRESH_AT,
    });

    await expect(fetchTribeEventAttendanceStreakRequest({ tribeSlug: TRIBE_SLUG })).resolves.toEqual({
      attendanceStreak: { attendedCount: 4, occurrenceCount: 5 },
      attendanceStreakNextRefreshAt: NEXT_REFRESH_AT,
      isSuccess: true,
    });
  });

  it("returns a successful read without an instant the route could not compute", async () => {
    answerStreakRead({ attendanceStreak: null });

    await expect(fetchTribeEventAttendanceStreakRequest({ tribeSlug: TRIBE_SLUG })).resolves.toEqual({
      attendanceStreak: null,
      isSuccess: true,
    });
  });

  it("returns a failed read when the route answers with an error status", async () => {
    answerStreakRead({ message: "No pudimos leer tu racha." }, false);

    await expect(fetchTribeEventAttendanceStreakRequest({ tribeSlug: TRIBE_SLUG })).resolves.toEqual({
      isSuccess: false,
    });
  });

  it("returns a failed read when the body is not the public streak DTO", async () => {
    answerStreakRead({ attendanceStreak: { attendedCount: -1, occurrenceCount: 5 } });

    await expect(fetchTribeEventAttendanceStreakRequest({ tribeSlug: TRIBE_SLUG })).resolves.toEqual({
      isSuccess: false,
    });
  });

  it("rethrows an aborted request for the caller to ignore", async () => {
    const abortError = new DOMException("The operation was aborted.", "AbortError");

    global.fetch = vi.fn(async () => {
      throw abortError;
    }) as unknown as typeof fetch;

    await expect(fetchTribeEventAttendanceStreakRequest({ tribeSlug: TRIBE_SLUG })).rejects.toBe(
      abortError
    );
  });
});
