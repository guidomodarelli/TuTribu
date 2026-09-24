import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

import { useTribeEventMutations } from "@/hooks/use-tribe-event-mutations";
import { STREAK_READ_RETRY_DELAYS_MS } from "@/lib/events/tribe-event-streak-freshness";
import { buildTribeEventAttendanceApiEndpoint } from "@/lib/events/tribe-events-routes";
import type { TribeEventOccurrenceResult } from "@/src/modules/events/application/results/tribe-event-result";

// Preserve the existing Sonner double to isolate its timers and global notification store.
vi.mock("beez-ui", async () => ({
  ...(await vi.importActual<typeof import("beez-ui")>("beez-ui")),
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

type JsonResponse = { json: () => Promise<Record<string, unknown>>; ok: boolean };

const TRIBE_SLUG = "matematica-pro";
const STREAK_ENDPOINT = `/api/tribes/${TRIBE_SLUG}/events/attendance-streak`;
const SAVED_EVENT_ID = "6f3c7a1e-2b4d-4c8e-9f10-1a2b3c4d5e6f";
const DELETED_EVENT_ID = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
// Far enough ahead that the real clock never reaches it during the suite.
const FUTURE_DEADLINE = "2099-01-01T00:00:00.000Z";
const LATER_FUTURE_DEADLINE = "2099-02-01T00:00:00.000Z";
const HTTP_METHOD = {
  delete: "DELETE",
  patch: "PATCH",
} as const;

function createOccurrence(
  overrides: Partial<TribeEventOccurrenceResult> = {}
): TribeEventOccurrenceResult {
  const startsAt = overrides.startsAt ?? "2026-05-20T18:00:00.000Z";
  const eventId = overrides.eventId ?? SAVED_EVENT_ID;

  return {
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
    endsAt: "2026-05-20T19:00:00.000Z",
    eventId,
    meetingUrl: null,
    occurrenceKey: `${eventId}@${startsAt}`,
    recurrenceFrequency: "none",
    recurrenceRule: null,
    recurrenceUntil: null,
    seriesEndsAt: "2026-05-20T19:00:00.000Z",
    seriesStartsAt: startsAt,
    startsAt,
    title: "Clase abierta",
    ...overrides,
  };
}

/**
 * Promise the test settles by hand, standing in for a slow route response.
 */
function createHeldResponse() {
  let resolveResponse: (response: JsonResponse) => void = () => undefined;
  const response = new Promise<JsonResponse>((resolve) => {
    resolveResponse = resolve;
  });

  return {
    resolve: async (body: Record<string, unknown>, ok = true) => {
      await act(async () => {
        resolveResponse({ json: async () => body, ok });
        await response;
      });
    },
    response,
  };
}

describe("useTribeEventMutations streak ordering", () => {
  const savedOccurrence = createOccurrence();
  const deletedOccurrence = createOccurrence({
    endsAt: "2026-05-27T19:00:00.000Z",
    eventId: DELETED_EVENT_ID,
    startsAt: "2026-05-27T18:00:00.000Z",
  });
  const savePayload = {
    capacity: "",
    description: "",
    endsAt: "",
    meetingUrl: "",
    recurrenceFrequency: "none",
    recurrenceUntil: "",
    startsAt: "2026-05-20T18:00:00.000Z",
    title: "Clase renovada",
  };

  let heldSave: ReturnType<typeof createHeldResponse>;
  let heldDeletion: ReturnType<typeof createHeldResponse>;
  let heldStreakRead: ReturnType<typeof createHeldResponse>;

  function getStreakRequests() {
    return (global.fetch as Mock).mock.calls.filter(([url]) => url === STREAK_ENDPOINT);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    heldSave = createHeldResponse();
    heldDeletion = createHeldResponse();
    heldStreakRead = createHeldResponse();
    global.fetch = vi.fn((url: string, init?: RequestInit) => {
      if (url === STREAK_ENDPOINT) {
        return heldStreakRead.response;
      }

      return init?.method === HTTP_METHOD.delete ? heldDeletion.response : heldSave.response;
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Stable references, like the props of a server render that did not change:
  // a new streak or events array would stand for fresh server data.
  const serverStreak = { attendedCount: 4, occurrenceCount: 5 };
  const serverEvents = [savedOccurrence, deletedOccurrence];

  function renderMutations() {
    return renderHook(() =>
      useTribeEventMutations({
        attendanceStreak: serverStreak,
        events: serverEvents,
        month: "2026-05",
        tribeSlug: TRIBE_SLUG,
      })
    );
  }

  it("applies neither response of an edit and a deletion that commit in reverse order and reads once", async () => {
    const { result } = renderMutations();
    let savePromise: Promise<boolean> = Promise.resolve(false);
    let deletionPromise: Promise<boolean> = Promise.resolve(false);

    // The manager closes a still-saving edit and starts a deletion.
    act(() => {
      savePromise = result.current.saveEvent(savePayload, savedOccurrence);
    });
    act(() => {
      deletionPromise = result.current.deleteEvent(deletedOccurrence);
    });

    // The later-started deletion commits first, with a streak that predates
    // the edit; the edit then commits with its own streak.
    await heldDeletion.resolve({
      attendanceStreak: { attendedCount: 2, occurrenceCount: 5 },
      attendanceStreakNextRefreshAt: FUTURE_DEADLINE,
      message: "Evento eliminado.",
    });

    expect(getStreakRequests()).toHaveLength(0);

    await heldSave.resolve({
      attendanceStreak: { attendedCount: 3, occurrenceCount: 5 },
      attendanceStreakNextRefreshAt: LATER_FUTURE_DEADLINE,
      event: {},
      message: "Evento actualizado.",
      occurrences: [{ ...savedOccurrence, title: "Clase renovada" }],
    });
    await act(async () => {
      await Promise.all([savePromise, deletionPromise]);
    });

    // Neither overlapping response lands: the read is the source of truth.
    expect(result.current.attendanceStreak).toEqual(serverStreak);
    expect(result.current.attendanceStreakNextRefreshAt).toBeNull();
    await waitFor(() => expect(getStreakRequests()).toHaveLength(1));

    await heldStreakRead.resolve({
      attendanceStreak: { attendedCount: 1, occurrenceCount: 5 },
      attendanceStreakNextRefreshAt: FUTURE_DEADLINE,
    });

    expect(result.current.attendanceStreak).toEqual({ attendedCount: 1, occurrenceCount: 5 });
    expect(result.current.attendanceStreakNextRefreshAt).toBe(FUTURE_DEADLINE);
    expect(getStreakRequests()).toHaveLength(1);
  });

  it("applies the streak and deadline of a lone deletion without reading again", async () => {
    const { result } = renderMutations();
    let deletionPromise: Promise<boolean> = Promise.resolve(false);

    act(() => {
      deletionPromise = result.current.deleteEvent(deletedOccurrence);
    });
    await heldDeletion.resolve({
      attendanceStreak: { attendedCount: 2, occurrenceCount: 5 },
      attendanceStreakNextRefreshAt: FUTURE_DEADLINE,
      message: "Evento eliminado.",
    });
    await act(async () => {
      await deletionPromise;
    });

    expect(result.current.attendanceStreak).toEqual({ attendedCount: 2, occurrenceCount: 5 });
    expect(result.current.attendanceStreakNextRefreshAt).toBe(FUTURE_DEADLINE);
    expect(getStreakRequests()).toHaveLength(0);
  });

  it("reads the streak once when a lone edit omits it from its response", async () => {
    const { result } = renderMutations();
    let savePromise: Promise<boolean> = Promise.resolve(false);

    act(() => {
      savePromise = result.current.saveEvent(savePayload, savedOccurrence);
    });
    // The route could not recompute the streak, so it omitted the field.
    await heldSave.resolve({
      attendanceStreakNextRefreshAt: FUTURE_DEADLINE,
      event: {},
      message: "Evento actualizado.",
      occurrences: [{ ...savedOccurrence, title: "Clase renovada" }],
    });
    await act(async () => {
      await savePromise;
    });

    expect(result.current.attendanceStreak).toEqual(serverStreak);
    await waitFor(() => expect(getStreakRequests()).toHaveLength(1));

    await heldStreakRead.resolve({
      attendanceStreak: { attendedCount: 3, occurrenceCount: 5 },
      attendanceStreakNextRefreshAt: LATER_FUTURE_DEADLINE,
    });

    expect(result.current.attendanceStreak).toEqual({ attendedCount: 3, occurrenceCount: 5 });
    expect(result.current.attendanceStreakNextRefreshAt).toBe(LATER_FUTURE_DEADLINE);
    expect(getStreakRequests()).toHaveLength(1);
  });

  it("reads the streak once when a lone deletion omits its next refresh instant", async () => {
    const { result } = renderMutations();
    let deletionPromise: Promise<boolean> = Promise.resolve(false);

    act(() => {
      deletionPromise = result.current.deleteEvent(deletedOccurrence);
    });
    await heldDeletion.resolve({
      attendanceStreak: { attendedCount: 2, occurrenceCount: 5 },
      message: "Evento eliminado.",
    });
    await act(async () => {
      await deletionPromise;
    });

    // Neither field lands: the deadline follows the same rule as the streak.
    expect(result.current.attendanceStreak).toEqual(serverStreak);
    await waitFor(() => expect(getStreakRequests()).toHaveLength(1));

    await heldStreakRead.resolve({
      attendanceStreak: { attendedCount: 2, occurrenceCount: 5 },
      attendanceStreakNextRefreshAt: FUTURE_DEADLINE,
    });

    expect(result.current.attendanceStreak).toEqual({ attendedCount: 2, occurrenceCount: 5 });
    expect(result.current.attendanceStreakNextRefreshAt).toBe(FUTURE_DEADLINE);
    expect(getStreakRequests()).toHaveLength(1);
  });

  it("drops a refresh that started before a mutation and trusts the committed streak", async () => {
    const { result } = renderMutations();
    let savePromise: Promise<boolean> = Promise.resolve(false);

    act(() => {
      result.current.refreshAttendanceStreak();
    });
    expect(getStreakRequests()).toHaveLength(1);
    const staleSignal = getStreakRequests()[0][1].signal as AbortSignal;

    act(() => {
      savePromise = result.current.saveEvent(savePayload, savedOccurrence);
    });

    expect(staleSignal.aborted).toBe(true);

    await heldStreakRead.resolve({ attendanceStreak: { attendedCount: 5, occurrenceCount: 5 } });
    await heldSave.resolve({
      attendanceStreak: { attendedCount: 3, occurrenceCount: 5 },
      attendanceStreakNextRefreshAt: FUTURE_DEADLINE,
      event: {},
      message: "Evento actualizado.",
      occurrences: [{ ...savedOccurrence, title: "Clase renovada" }],
    });
    await act(async () => {
      await savePromise;
    });

    expect(result.current.attendanceStreak).toEqual({ attendedCount: 3, occurrenceCount: 5 });
    expect(getStreakRequests()).toHaveLength(1);
  });

  it("reads the streak again when a mutation that interrupted a refresh fails", async () => {
    const { result } = renderMutations();
    let deletionPromise: Promise<boolean> = Promise.resolve(false);

    act(() => {
      result.current.refreshAttendanceStreak();
    });
    act(() => {
      deletionPromise = result.current.deleteEvent(deletedOccurrence);
    });

    await heldDeletion.resolve({ message: "No pudimos eliminar el evento." }, false);
    await act(async () => {
      await deletionPromise;
    });

    await waitFor(() => expect(getStreakRequests()).toHaveLength(2));
    await heldStreakRead.resolve({ attendanceStreak: { attendedCount: 5, occurrenceCount: 5 } });

    expect(result.current.attendanceStreak).toEqual({ attendedCount: 5, occurrenceCount: 5 });
  });
});

describe("useTribeEventMutations streak refresh serialization", () => {
  const attendedOccurrence = createOccurrence();
  const savePayload = {
    capacity: "",
    description: "",
    endsAt: "",
    meetingUrl: "",
    recurrenceFrequency: "none",
    recurrenceUntil: "",
    startsAt: "2026-05-20T18:00:00.000Z",
    title: "Clase renovada",
  };
  const savedAttendance = {
    ...attendedOccurrence.attendance,
    goingCount: 1,
    viewerStatus: "going" as const,
  };
  // The client clock sits five minutes after the occurrence ended.
  const CLIENT_NOW = "2026-05-20T19:05:00.000Z";
  const PASSED_DEADLINE = "2026-05-20T19:00:00.000Z";
  const UPCOMING_DEADLINE = "2026-05-27T19:00:00.000Z";
  const serverStreak = { attendedCount: 4, occurrenceCount: 5 };
  const serverEvents = [attendedOccurrence];
  const attendanceEndpoint = buildTribeEventAttendanceApiEndpoint(
    TRIBE_SLUG,
    attendedOccurrence.eventId
  );

  let heldStreakReads: ReturnType<typeof createHeldResponse>[];
  let heldAttendance: ReturnType<typeof createHeldResponse>;
  let heldSave: ReturnType<typeof createHeldResponse>;

  function getStreakRequests() {
    return (global.fetch as Mock).mock.calls.filter(([url]) => url === STREAK_ENDPOINT);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    // Only the wall clock is faked: the hook compares returned deadlines with
    // Date.now(), while waitFor keeps its real timers.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(CLIENT_NOW));
    heldStreakReads = [];
    heldAttendance = createHeldResponse();
    heldSave = createHeldResponse();
    global.fetch = vi.fn((url: string, init?: RequestInit) => {
      if (url === STREAK_ENDPOINT) {
        const heldStreakRead = createHeldResponse();

        heldStreakReads.push(heldStreakRead);
        return heldStreakRead.response;
      }

      // Answers use PUT on the attendance endpoint and clears use DELETE on
      // the same endpoint scoped to the occurrence start.
      return url.startsWith(attendanceEndpoint) ? heldAttendance.response : heldSave.response;
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function renderMutations() {
    return renderHook(() =>
      useTribeEventMutations({
        attendanceStreak: serverStreak,
        events: serverEvents,
        month: "2026-05",
        tribeSlug: TRIBE_SLUG,
      })
    );
  }

  it("defers a finish refresh requested while an attendance save is uncommitted", async () => {
    const { result } = renderMutations();
    let attendancePromise: Promise<boolean> = Promise.resolve(false);

    act(() => {
      attendancePromise = result.current.setAttendance(attendedOccurrence, "going");
    });
    // The occurrence ends while the answer is still uncommitted.
    act(() => {
      result.current.refreshAttendanceStreak();
    });

    expect(getStreakRequests()).toHaveLength(0);

    await heldAttendance.resolve({ attendance: savedAttendance, message: "Respuesta guardada." });
    await act(async () => {
      await attendancePromise;
    });

    await waitFor(() => expect(getStreakRequests()).toHaveLength(1));
    await heldStreakReads[0].resolve({
      attendanceStreak: { attendedCount: 5, occurrenceCount: 5 },
    });

    expect(result.current.attendanceStreak).toEqual({ attendedCount: 5, occurrenceCount: 5 });
    expect(getStreakRequests()).toHaveLength(1);
  });

  it("reads the streak again when an attendance save interrupts a read in flight", async () => {
    const { result } = renderMutations();
    let attendancePromise: Promise<boolean> = Promise.resolve(false);

    act(() => {
      result.current.refreshAttendanceStreak();
    });
    const staleSignal = getStreakRequests()[0][1].signal as AbortSignal;

    act(() => {
      attendancePromise = result.current.setAttendance(attendedOccurrence, null);
    });

    expect(staleSignal.aborted).toBe(true);

    await heldStreakReads[0].resolve({
      attendanceStreak: { attendedCount: 1, occurrenceCount: 5 },
    });
    await heldAttendance.resolve({
      attendance: attendedOccurrence.attendance,
      message: "Respuesta guardada.",
    });
    await act(async () => {
      await attendancePromise;
    });

    expect(result.current.attendanceStreak).toEqual(serverStreak);
    await waitFor(() => expect(getStreakRequests()).toHaveLength(2));
    await heldStreakReads[1].resolve({
      attendanceStreak: { attendedCount: 3, occurrenceCount: 5 },
    });

    expect(result.current.attendanceStreak).toEqual({ attendedCount: 3, occurrenceCount: 5 });
  });

  it("reads the streak after a series mutation returns a deadline that already passed", async () => {
    const { result } = renderMutations();
    let savePromise: Promise<boolean> = Promise.resolve(false);

    act(() => {
      savePromise = result.current.saveEvent(savePayload, attendedOccurrence);
    });
    await heldSave.resolve({
      attendanceStreak: { attendedCount: 3, occurrenceCount: 5 },
      attendanceStreakNextRefreshAt: PASSED_DEADLINE,
      event: {},
      message: "Evento actualizado.",
      occurrences: [{ ...attendedOccurrence, title: "Clase renovada" }],
    });
    await act(async () => {
      await savePromise;
    });

    await waitFor(() => expect(getStreakRequests()).toHaveLength(1));
    await heldStreakReads[0].resolve({
      attendanceStreak: { attendedCount: 4, occurrenceCount: 5 },
      attendanceStreakNextRefreshAt: UPCOMING_DEADLINE,
    });

    expect(result.current.attendanceStreak).toEqual({ attendedCount: 4, occurrenceCount: 5 });
    expect(result.current.attendanceStreakNextRefreshAt).toBe(UPCOMING_DEADLINE);
    expect(getStreakRequests()).toHaveLength(1);
  });

  it("only stores a returned deadline that is still ahead", async () => {
    const { result } = renderMutations();

    act(() => {
      result.current.refreshAttendanceStreak();
    });
    await heldStreakReads[0].resolve({
      attendanceStreak: { attendedCount: 4, occurrenceCount: 5 },
      attendanceStreakNextRefreshAt: UPCOMING_DEADLINE,
    });

    expect(result.current.attendanceStreakNextRefreshAt).toBe(UPCOMING_DEADLINE);
    expect(getStreakRequests()).toHaveLength(1);
  });
  it("retries a passed deadline the server keeps returning with a bounded backoff", async () => {
    // Timers are faked too: the retries of a repeated passed deadline wait.
    vi.useRealTimers();
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    vi.setSystemTime(new Date(CLIENT_NOW));
    const { result } = renderMutations();
    const lateStreak = { attendedCount: 4, occurrenceCount: 5 };

    act(() => {
      result.current.refreshAttendanceStreak();
    });
    await heldStreakReads[0].resolve({
      attendanceStreak: lateStreak,
      attendanceStreakNextRefreshAt: PASSED_DEADLINE,
    });
    // The first passed deadline reads right away.
    expect(getStreakRequests()).toHaveLength(2);

    // The server clock lags behind: every read repeats the same passed
    // deadline, so each retry waits for the next delay of the backoff.
    for (const [retryIndex, delayMs] of STREAK_READ_RETRY_DELAYS_MS.entries()) {
      await heldStreakReads[retryIndex + 1].resolve({
        attendanceStreak: lateStreak,
        attendanceStreakNextRefreshAt: PASSED_DEADLINE,
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(delayMs - 1);
      });
      expect(getStreakRequests()).toHaveLength(retryIndex + 2);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(getStreakRequests()).toHaveLength(retryIndex + 3);
    }

    await heldStreakReads[STREAK_READ_RETRY_DELAYS_MS.length + 1].resolve({
      attendanceStreak: { attendedCount: 5, occurrenceCount: 5 },
      attendanceStreakNextRefreshAt: PASSED_DEADLINE,
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(Math.max(...STREAK_READ_RETRY_DELAYS_MS) * 2);
    });

    // The retries are bounded: no loop once they run out.
    expect(result.current.attendanceStreak).toEqual({ attendedCount: 5, occurrenceCount: 5 });
    expect(result.current.attendanceStreakNextRefreshAt).toBe(PASSED_DEADLINE);
    expect(getStreakRequests()).toHaveLength(STREAK_READ_RETRY_DELAYS_MS.length + 2);
  });

  it("stops retrying a passed deadline once a read returns one still ahead", async () => {
    vi.useRealTimers();
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    vi.setSystemTime(new Date(CLIENT_NOW));
    const { result } = renderMutations();

    act(() => {
      result.current.refreshAttendanceStreak();
    });
    await heldStreakReads[0].resolve({
      attendanceStreak: serverStreak,
      attendanceStreakNextRefreshAt: PASSED_DEADLINE,
    });
    await heldStreakReads[1].resolve({
      attendanceStreak: serverStreak,
      attendanceStreakNextRefreshAt: PASSED_DEADLINE,
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STREAK_READ_RETRY_DELAYS_MS[0]);
    });
    await heldStreakReads[2].resolve({
      attendanceStreak: { attendedCount: 5, occurrenceCount: 5 },
      attendanceStreakNextRefreshAt: UPCOMING_DEADLINE,
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(Math.max(...STREAK_READ_RETRY_DELAYS_MS) * 2);
    });

    expect(result.current.attendanceStreakNextRefreshAt).toBe(UPCOMING_DEADLINE);
    expect(getStreakRequests()).toHaveLength(3);
  });

  /**
   * Fakes the timers too, so the tests can drive the bounded retries.
   */
  function useFakeRetryTimers() {
    vi.useRealTimers();
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    vi.setSystemTime(new Date(CLIENT_NOW));
  }

  async function advanceTime(delayMs: number) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(delayMs);
    });
  }

  it("retries a read the route answers with an error with a bounded backoff and stops", async () => {
    useFakeRetryTimers();
    const { toast } = vi.mocked(await import("beez-ui"), true);
    const { result } = renderMutations();

    act(() => {
      result.current.refreshAttendanceStreak();
    });

    for (const [retryIndex, delayMs] of STREAK_READ_RETRY_DELAYS_MS.entries()) {
      await heldStreakReads[retryIndex].resolve({ message: "No pudimos leer tu racha." }, false);
      await advanceTime(delayMs - 1);
      expect(getStreakRequests()).toHaveLength(retryIndex + 1);
      await advanceTime(1);
      expect(getStreakRequests()).toHaveLength(retryIndex + 2);
    }

    await heldStreakReads[STREAK_READ_RETRY_DELAYS_MS.length].resolve({}, false);
    await advanceTime(Math.max(...STREAK_READ_RETRY_DELAYS_MS) * 2);

    // The retries are bounded, the streak on screen stays, and no toast shows.
    expect(getStreakRequests()).toHaveLength(STREAK_READ_RETRY_DELAYS_MS.length + 1);
    expect(result.current.attendanceStreak).toEqual(serverStreak);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("retries a read that returns an unusable body until one is usable", async () => {
    useFakeRetryTimers();
    const { result } = renderMutations();

    act(() => {
      result.current.refreshAttendanceStreak();
    });
    await heldStreakReads[0].resolve({ attendanceStreak: { attendedCount: -1, occurrenceCount: 5 } });
    await advanceTime(STREAK_READ_RETRY_DELAYS_MS[0]);

    expect(getStreakRequests()).toHaveLength(2);

    await heldStreakReads[1].resolve({
      attendanceStreak: { attendedCount: 5, occurrenceCount: 5 },
      attendanceStreakNextRefreshAt: UPCOMING_DEADLINE,
    });
    await advanceTime(Math.max(...STREAK_READ_RETRY_DELAYS_MS) * 2);

    expect(result.current.attendanceStreak).toEqual({ attendedCount: 5, occurrenceCount: 5 });
    expect(getStreakRequests()).toHaveLength(2);
  });

  it("does not retry a read that a mutation aborted", async () => {
    useFakeRetryTimers();
    const { result } = renderMutations();
    let savePromise: Promise<boolean> = Promise.resolve(false);

    act(() => {
      result.current.refreshAttendanceStreak();
    });
    act(() => {
      savePromise = result.current.saveEvent(savePayload, attendedOccurrence);
    });
    // The aborted read still answers with an error: it is stale, not failed.
    await heldStreakReads[0].resolve({}, false);
    await heldSave.resolve({
      attendanceStreak: { attendedCount: 3, occurrenceCount: 5 },
      attendanceStreakNextRefreshAt: UPCOMING_DEADLINE,
      event: {},
      message: "Evento actualizado.",
      occurrences: [{ ...attendedOccurrence, title: "Clase renovada" }],
    });
    await act(async () => {
      await savePromise;
    });
    await advanceTime(Math.max(...STREAK_READ_RETRY_DELAYS_MS) * 2);

    expect(result.current.attendanceStreak).toEqual({ attendedCount: 3, occurrenceCount: 5 });
    expect(getStreakRequests()).toHaveLength(1);
  });

  it("starts no read when a series mutation fails after the calendar unmounts", async () => {
    useFakeRetryTimers();
    const { result, unmount } = renderMutations();
    let savePromise: Promise<boolean> = Promise.resolve(false);

    act(() => {
      result.current.refreshAttendanceStreak();
    });
    await heldStreakReads[0].resolve({}, false);
    act(() => {
      savePromise = result.current.saveEvent(savePayload, attendedOccurrence);
    });

    unmount();

    await heldSave.resolve({ message: "No pudimos guardar el evento." }, false);
    await act(async () => {
      await savePromise;
    });
    await advanceTime(Math.max(...STREAK_READ_RETRY_DELAYS_MS) * 2);

    // Neither the failed mutation nor the retry scheduled before the unmount
    // reads the streak again.
    expect(getStreakRequests()).toHaveLength(1);
  });

  it("applies no streak of a series mutation that settles after the calendar unmounts", async () => {
    useFakeRetryTimers();
    const { result, unmount } = renderMutations();
    let savePromise: Promise<boolean> = Promise.resolve(false);

    act(() => {
      savePromise = result.current.saveEvent(savePayload, attendedOccurrence);
    });

    unmount();

    // The response omits the next refresh instant, which would require a read.
    await heldSave.resolve({
      attendanceStreak: { attendedCount: 3, occurrenceCount: 5 },
      event: {},
      message: "Evento actualizado.",
      occurrences: [{ ...attendedOccurrence, title: "Clase renovada" }],
    });
    await act(async () => {
      await savePromise;
    });
    await advanceTime(Math.max(...STREAK_READ_RETRY_DELAYS_MS) * 2);

    expect(getStreakRequests()).toHaveLength(0);
    expect(result.current.attendanceStreak).toEqual(serverStreak);
  });

  it("keeps a read interrupted by overlapping mutations until the attendance answer settles", async () => {
    const { result } = renderMutations();
    let savePromise: Promise<boolean> = Promise.resolve(false);
    let attendancePromise: Promise<boolean> = Promise.resolve(false);

    // An occurrence finishes and its read is in flight.
    act(() => {
      result.current.refreshAttendanceStreak();
    });
    const staleSignal = getStreakRequests()[0][1].signal as AbortSignal;

    act(() => {
      savePromise = result.current.saveEvent(savePayload, attendedOccurrence);
    });
    act(() => {
      attendancePromise = result.current.setAttendance(attendedOccurrence, "going");
    });

    expect(staleSignal.aborted).toBe(true);

    // The series save settles first with a streak computed before the answer
    // committed: it overlapped the answer, so it neither lands nor covers the
    // interrupted read.
    await heldSave.resolve({
      attendanceStreak: { attendedCount: 3, occurrenceCount: 5 },
      attendanceStreakNextRefreshAt: UPCOMING_DEADLINE,
      event: {},
      message: "Evento actualizado.",
      occurrences: [{ ...attendedOccurrence, title: "Clase renovada" }],
    });
    await act(async () => {
      await savePromise;
    });

    expect(result.current.attendanceStreak).toEqual(serverStreak);
    expect(result.current.attendanceStreakNextRefreshAt).toBeNull();
    expect(getStreakRequests()).toHaveLength(1);

    await heldAttendance.resolve({ attendance: savedAttendance, message: "Respuesta guardada." });
    await act(async () => {
      await attendancePromise;
    });

    await waitFor(() => expect(getStreakRequests()).toHaveLength(2));
    await heldStreakReads[1].resolve({
      attendanceStreak: { attendedCount: 4, occurrenceCount: 5 },
    });

    expect(result.current.attendanceStreak).toEqual({ attendedCount: 4, occurrenceCount: 5 });
    expect(getStreakRequests()).toHaveLength(2);
  });
});

describe("useTribeEventMutations server render source", () => {
  const savedOccurrence = createOccurrence();
  const serverEvents = [savedOccurrence];
  const FIRST_RENDER_VERSION = "2026-05-20T18:00:00.000Z";
  const SECOND_RENDER_VERSION = "2026-05-20T18:05:00.000Z";
  const savePayload = {
    capacity: "",
    description: "",
    endsAt: "",
    meetingUrl: "",
    recurrenceFrequency: "none",
    recurrenceUntil: "",
    startsAt: "2026-05-20T18:00:00.000Z",
    title: "Clase renovada",
  };

  let heldSave: ReturnType<typeof createHeldResponse>;

  beforeEach(() => {
    vi.clearAllMocks();
    heldSave = createHeldResponse();
    global.fetch = vi.fn(() => heldSave.response) as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function renderMutations(initialVersion: string) {
    return renderHook(
      ({ version }: { version: string }) =>
        useTribeEventMutations({
          attendanceStreak: null,
          attendanceStreakNextRefreshAt: null,
          attendanceStreakSourceVersion: version,
          events: serverEvents,
          month: "2026-05",
          tribeSlug: TRIBE_SLUG,
        }),
      { initialProps: { version: initialVersion } }
    );
  }

  async function saveWithStreak(result: { current: ReturnType<typeof useTribeEventMutations> }) {
    let savePromise: Promise<boolean> = Promise.resolve(false);

    act(() => {
      savePromise = result.current.saveEvent(savePayload, savedOccurrence);
    });
    await heldSave.resolve({
      attendanceStreak: { attendedCount: 2, occurrenceCount: 5 },
      attendanceStreakNextRefreshAt: FUTURE_DEADLINE,
      event: {},
      message: "Evento actualizado.",
      occurrences: [savedOccurrence],
    });
    await act(async () => {
      await savePromise;
    });
  }

  it("replaces a locally added streak when a new render repeats a null server streak", async () => {
    const { rerender, result } = renderMutations(FIRST_RENDER_VERSION);

    await saveWithStreak(result);

    expect(result.current.attendanceStreak).toEqual({ attendedCount: 2, occurrenceCount: 5 });

    rerender({ version: SECOND_RENDER_VERSION });

    expect(result.current.attendanceStreak).toBeNull();
    expect(result.current.attendanceStreakNextRefreshAt).toBeNull();
  });

  it("keeps the local streak while the route renders the same source", async () => {
    const { rerender, result } = renderMutations(FIRST_RENDER_VERSION);

    await saveWithStreak(result);
    rerender({ version: FIRST_RENDER_VERSION });

    expect(result.current.attendanceStreak).toEqual({ attendedCount: 2, occurrenceCount: 5 });
  });
});
