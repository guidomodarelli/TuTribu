import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  deleteTribeEventRequest,
  fetchTribeEventAttendanceStreakRequest,
  fetchTribeEventOccurrencesRequest,
  saveTribeEventAttendanceRequest,
  saveTribeEventRequest,
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

/**
 * Stubs the browser fetch with a single mutation answer carrying its status;
 * `body: undefined` stands for a body that is not valid JSON.
 */
function answerMutation(input: { body: unknown; ok: boolean; status: number }) {
  global.fetch = vi.fn(async () => ({
    json: async () => {
      if (input.body === undefined) {
        throw new SyntaxError("Unexpected token < in JSON");
      }

      return input.body;
    },
    ok: input.ok,
    status: input.status,
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
    const occurrences = [
      {
        attendance: {
          goingCount: 0,
          goingPreview: [],
          maybeCount: 0,
          viewerStatus: null,
          viewerWaitlistPosition: null,
          waitlistedCount: 0,
        },
        capacity: null,
        description: null,
        endsAt: null,
        eventId: "6f3c7a1e-2b4d-4c8e-9f10-1a2b3c4d5e6f",
        meetingUrl: null,
        occurrenceKey: "6f3c7a1e-2b4d-4c8e-9f10-1a2b3c4d5e6f@2026-05-20T18:00:00.000Z",
        recurrenceFrequency: "none",
        recurrenceRule: null,
        recurrenceUntil: null,
        seriesEndsAt: null,
        seriesStartsAt: "2026-05-20T18:00:00.000Z",
        startsAt: "2026-05-20T18:00:00.000Z",
        title: "Clase abierta",
      },
    ];

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

  it("returns a failed read when an occurrence breaks the public DTO", async () => {
    answerRequest({ events: [{ occurrenceKey: "event@2026-05-20T18:00:00.000Z" }] });

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

describe("mutation failure classification", () => {
  const originalFetch = global.fetch;
  const EVENT_ID = "6f3c7a1e-2b4d-4c8e-9f10-1a2b3c4d5e6f";
  const occurrence = { eventId: EVENT_ID, startsAt: "2026-05-20T18:00:00.000Z" };
  const savePayload = {
    capacity: "",
    description: "",
    endsAt: "",
    meetingUrl: "",
    recurrenceFrequency: "none",
    recurrenceUntil: "",
    startsAt: "2026-05-20T18:00:00.000Z",
    title: "Clase abierta",
  } as Parameters<typeof saveTribeEventRequest>[0]["payload"];
  const requests = {
    attendance: () =>
      saveTribeEventAttendanceRequest({ occurrence, status: "going", tribeSlug: TRIBE_SLUG }),
    create: () =>
      saveTribeEventRequest({ eventId: null, month: "2026-05", payload: savePayload, tribeSlug: TRIBE_SLUG }),
    delete: () => deleteTribeEventRequest({ eventId: EVENT_ID, tribeSlug: TRIBE_SLUG }),
    edit: () =>
      saveTribeEventRequest({ eventId: EVENT_ID, month: "2026-05", payload: savePayload, tribeSlug: TRIBE_SLUG }),
  };

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it.each(Object.entries(requests))(
    "classifies a %s rejected with a readable 4xx body as not ambiguous",
    async (_requestName, sendRequest) => {
      answerMutation({ body: { message: "Revisá los datos." }, ok: false, status: 422 });

      await expect(sendRequest()).resolves.toMatchObject({
        isOutcomeAmbiguous: false,
        isSuccess: false,
        message: "Revisá los datos.",
      });
    }
  );

  it.each(Object.entries(requests))(
    "classifies a %s answered with a 5xx status as ambiguous",
    async (_requestName, sendRequest) => {
      answerMutation({ body: { message: "No pudimos guardar." }, ok: false, status: 503 });

      await expect(sendRequest()).resolves.toMatchObject({
        isOutcomeAmbiguous: true,
        isSuccess: false,
      });
    }
  );

  it.each(Object.entries(requests))(
    "classifies a %s answered with an unreadable body as ambiguous",
    async (_requestName, sendRequest) => {
      answerMutation({ body: undefined, ok: false, status: 404 });

      await expect(sendRequest()).resolves.toMatchObject({
        isOutcomeAmbiguous: true,
        isSuccess: false,
        message: null,
      });
    }
  );

  it("classifies a save that succeeded without its occurrences as ambiguous", async () => {
    answerMutation({ body: { message: "Evento guardado." }, ok: true, status: 201 });

    await expect(requests.create()).resolves.toMatchObject({
      isOutcomeAmbiguous: true,
      isSuccess: false,
    });
  });

  it("classifies an attendance answer that succeeded without its summary as ambiguous", async () => {
    answerMutation({ body: { message: "Respuesta guardada." }, ok: true, status: 200 });

    await expect(requests.attendance()).resolves.toMatchObject({
      isOccurrenceEnded: false,
      isOutcomeAmbiguous: true,
      isSuccess: false,
    });
  });
});
