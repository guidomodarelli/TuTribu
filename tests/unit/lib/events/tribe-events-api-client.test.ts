import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  fetchTribeEventAttendanceStreakRequest,
  fetchTribeEventOccurrencesRequest,
} from "@/lib/events/tribe-events-api-client";

const TRIBE_SLUG = "matematica-pro";
const NEXT_REFRESH_AT = "2099-01-01T00:00:00.000Z";

/**
 * Stubs the browser fetch with a single route answer.
 */
function answerRequest(body: unknown, ok = true) {
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
    answerRequest({
      attendanceStreak: { attendedCount: 4, occurrenceCount: 5 },
      attendanceStreakNextRefreshAt: NEXT_REFRESH_AT,
    });

    await expect(fetchTribeEventAttendanceStreakRequest({ tribeSlug: TRIBE_SLUG })).resolves.toEqual({
      attendanceStreak: { attendedCount: 4, occurrenceCount: 5 },
      attendanceStreakNextRefreshAt: NEXT_REFRESH_AT,
      isPartial: false,
      isSuccess: true,
    });
  });

  it("returns a complete read when nothing ends inside the upcoming window", async () => {
    answerRequest({ attendanceStreak: null, attendanceStreakNextRefreshAt: null });

    await expect(fetchTribeEventAttendanceStreakRequest({ tribeSlug: TRIBE_SLUG })).resolves.toEqual({
      attendanceStreak: null,
      attendanceStreakNextRefreshAt: null,
      isPartial: false,
      isSuccess: true,
    });
  });

  it("returns a partial read without an instant the route could not compute", async () => {
    answerRequest({ attendanceStreak: null });

    await expect(fetchTribeEventAttendanceStreakRequest({ tribeSlug: TRIBE_SLUG })).resolves.toEqual({
      attendanceStreak: null,
      isPartial: true,
      isSuccess: true,
    });
  });

  it("returns a partial read that keeps the streak when the instant is unusable", async () => {
    answerRequest({
      attendanceStreak: { attendedCount: 4, occurrenceCount: 5 },
      attendanceStreakNextRefreshAt: "mañana",
    });

    await expect(fetchTribeEventAttendanceStreakRequest({ tribeSlug: TRIBE_SLUG })).resolves.toEqual({
      attendanceStreak: { attendedCount: 4, occurrenceCount: 5 },
      isPartial: true,
      isSuccess: true,
    });
  });

  it("returns a failed read when the route answers with an error status", async () => {
    answerRequest({ message: "No pudimos leer tu racha." }, false);

    await expect(fetchTribeEventAttendanceStreakRequest({ tribeSlug: TRIBE_SLUG })).resolves.toEqual({
      isSuccess: false,
    });
  });

  it("returns a failed read when the body is not the public streak DTO", async () => {
    answerRequest({ attendanceStreak: { attendedCount: -1, occurrenceCount: 5 } });

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

describe("fetchTribeEventOccurrencesRequest", () => {
  const originalFetch = global.fetch;
  const month = "2026-05";

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("reads the occurrences of the visible month without caching", async () => {
    const occurrences = [{ occurrenceKey: "event@2026-05-20T18:00:00.000Z" }];

    answerRequest({ events: occurrences, month: { current: month } });

    await expect(
      fetchTribeEventOccurrencesRequest({ month, tribeSlug: TRIBE_SLUG })
    ).resolves.toEqual({ isSuccess: true, occurrences });
    expect(global.fetch).toHaveBeenCalledWith(`/api/tribes/${TRIBE_SLUG}/events?month=${month}`, {
      cache: "no-store",
      signal: undefined,
    });
  });

  it("returns a failed read when the route answers with an error status", async () => {
    answerRequest({ message: "No pudimos cargar los eventos." }, false);

    await expect(
      fetchTribeEventOccurrencesRequest({ month, tribeSlug: TRIBE_SLUG })
    ).resolves.toEqual({ isSuccess: false });
  });

  it("returns a failed read when the body carries no occurrence list", async () => {
    answerRequest({ events: null });

    await expect(
      fetchTribeEventOccurrencesRequest({ month, tribeSlug: TRIBE_SLUG })
    ).resolves.toEqual({ isSuccess: false });
  });
});
