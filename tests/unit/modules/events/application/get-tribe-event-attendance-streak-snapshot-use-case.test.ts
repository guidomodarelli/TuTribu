import { afterEach, describe, expect, it, vi } from "vitest";
import { getTribeEventAttendanceStreakSnapshot } from "@/src/modules/events/application/use-cases/get-tribe-event-attendance-streak-snapshot-use-case";
import type {
  TribeEvent,
  TribeEventOccurrenceException,
} from "@/src/modules/events/domain/entities/tribe-event";
import type {
  ReadViewerAttendanceStreakSnapshotQuery,
  TribeEventRepository,
  TribeEventViewerAttendance,
} from "@/src/modules/events/domain/repositories/tribe-event-repository";

/** Read margin around the application instant (15 minutes). */
const READ_RANGE_CLOCK_MARGIN_MS = 900_000;

const EVENT_ID = "6f3c7a1e-2b4d-4c8e-9f10-1a2b3c4d5e6f";
const OTHER_EVENT_ID = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";

const weeklyEvent: TribeEvent = {
  capacity: null,
  description: null,
  endsAt: "2026-05-06T19:00:00.000Z",
  eventType: "live",
  id: EVENT_ID,
  meetingUrl: null,
  recurrenceFrequency: "weekly",
  recurrenceUntil: null,
  startsAt: "2026-05-06T18:00:00.000Z",
  title: "Clase abierta",
};

function createEvent(overrides: Partial<TribeEvent> = {}): TribeEvent {
  return {
    ...weeklyEvent,
    recurrenceFrequency: "none",
    ...overrides,
  };
}

function goingTo(occurrenceStartsAt: string): TribeEventViewerAttendance {
  return { eventId: EVENT_ID, occurrenceStartsAt, status: "going" };
}

/**
 * Repository double. Without an explicit `databaseTime` the database clock
 * agrees with the application instant, recovered from the end of the widened
 * viewer answers range.
 */
function createRepository(
  events: TribeEvent[],
  viewerAttendances: TribeEventViewerAttendance[] = [],
  databaseTime?: string,
  exceptions: TribeEventOccurrenceException[] = []
) {
  return {
    clearAttendance: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    findById: vi.fn(),
    getOccurrenceAttendanceReport: vi.fn(),
    listByTribeRange: vi.fn(),
    listEventOccurrences: vi.fn(),
    readViewerAttendanceStreakSnapshot: vi.fn(
      async (query: ReadViewerAttendanceStreakSnapshotQuery) => ({
        events,
        exceptions,
        referenceTime:
          databaseTime ??
          new Date(
            Date.parse(query.viewerAttendanceRange.rangeEnd) - READ_RANGE_CLOCK_MARGIN_MS
          ).toISOString(),
        viewerAttendances,
      })
    ),
    setAttendance: vi.fn(),
    update: vi.fn(),
  } satisfies TribeEventRepository;
}

describe("getTribeEventAttendanceStreakSnapshot", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reads the past answers and the upcoming schedule through one snapshot read widened by the clock margin", async () => {
    const repository = createRepository([weeklyEvent]);
    const execute = getTribeEventAttendanceStreakSnapshot({ tribeEventRepository: repository });

    await execute({ now: new Date("2026-06-01T12:00:00.000Z"), tribeSlug: " matematica-pro " });

    expect(repository.readViewerAttendanceStreakSnapshot).toHaveBeenCalledTimes(1);
    expect(repository.readViewerAttendanceStreakSnapshot).toHaveBeenCalledWith({
      eventRange: {
        rangeEnd: "2026-07-01T12:15:00.000Z",
        rangeStart: "2025-12-03T11:45:00.000Z",
      },
      tribeSlug: "matematica-pro",
      viewerAttendanceRange: {
        rangeEnd: "2026-06-01T12:15:00.000Z",
        rangeStart: "2025-12-03T11:45:00.000Z",
      },
    });
    expect(repository.listByTribeRange).not.toHaveBeenCalled();
  });

  it("reports the streak and the next end of the same schedule", async () => {
    const execute = getTribeEventAttendanceStreakSnapshot({
      tribeEventRepository: createRepository(
        [weeklyEvent],
        [
          goingTo("2026-05-06T18:00:00.000Z"),
          goingTo("2026-05-13T18:00:00.000Z"),
          { ...goingTo("2026-05-20T18:00:00.000Z"), status: "maybe" },
          goingTo("2026-05-27T18:00:00.000Z"),
        ]
      ),
    });

    await expect(
      execute({ now: new Date("2026-06-01T12:00:00.000Z"), tribeSlug: "matematica-pro" })
    ).resolves.toEqual({
      attendanceStreak: { attendedCount: 3, occurrenceCount: 4 },
      computedAt: "2026-06-01T12:00:00.000Z",
      nextRefreshAt: "2026-06-03T19:00:00.000Z",
    });
  });

  it("skips cancelled dates and uses the new time of moved dates", async () => {
    const execute = getTribeEventAttendanceStreakSnapshot({
      tribeEventRepository: createRepository(
        [weeklyEvent],
        [
          goingTo("2026-05-06T18:00:00.000Z"),
          goingTo("2026-05-13T18:00:00.000Z"),
          goingTo("2026-05-20T18:00:00.000Z"),
          goingTo("2026-06-03T18:00:00.000Z"),
        ],
        undefined,
        [
          // Cancelled: never took place, so it counts neither as attended nor
          // as one of the last occurrences.
          {
            eventId: EVENT_ID,
            kind: "cancelled",
            newEndsAt: null,
            newStartsAt: null,
            originalStartsAt: "2026-05-27T18:00:00.000Z",
            reason: null,
          },
          // Moved earlier into the past: it already took place at its new
          // time and keeps its answer under the original start.
          {
            eventId: EVENT_ID,
            kind: "moved",
            newEndsAt: null,
            newStartsAt: "2026-05-30T18:00:00.000Z",
            originalStartsAt: "2026-06-03T18:00:00.000Z",
            reason: null,
          },
          // Moved later: the next refresh is its new end.
          {
            eventId: EVENT_ID,
            kind: "moved",
            newEndsAt: "2026-06-12T20:00:00.000Z",
            newStartsAt: "2026-06-12T18:00:00.000Z",
            originalStartsAt: "2026-06-10T18:00:00.000Z",
            reason: null,
          },
        ]
      ),
    });

    await expect(
      execute({ now: new Date("2026-06-06T12:00:00.000Z"), tribeSlug: "matematica-pro" })
    ).resolves.toEqual({
      attendanceStreak: { attendedCount: 4, occurrenceCount: 4 },
      computedAt: "2026-06-06T12:00:00.000Z",
      nextRefreshAt: "2026-06-12T20:00:00.000Z",
    });
  });

  it("returns a null streak below the minimum while still reporting the next end", async () => {
    const execute = getTribeEventAttendanceStreakSnapshot({
      tribeEventRepository: createRepository(
        [weeklyEvent],
        [goingTo("2026-05-27T18:00:00.000Z")]
      ),
    });

    await expect(
      execute({ now: new Date("2026-06-01T12:00:00.000Z"), tribeSlug: "matematica-pro" })
    ).resolves.toEqual({
      attendanceStreak: null,
      computedAt: "2026-06-01T12:00:00.000Z",
      nextRefreshAt: "2026-06-03T19:00:00.000Z",
    });
  });

  it("computes both values at the instant it receives instead of the system clock", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-10T12:00:00.000Z"));
    const execute = getTribeEventAttendanceStreakSnapshot({
      tribeEventRepository: createRepository(
        [weeklyEvent],
        [
          goingTo("2026-05-13T18:00:00.000Z"),
          goingTo("2026-05-20T18:00:00.000Z"),
          goingTo("2026-05-27T18:00:00.000Z"),
        ]
      ),
    });

    // At the reference instant the 05-27 slot is still running, so only the
    // 05-06, 05-13 and 05-20 slots count and its end is the next refresh.
    await expect(
      execute({ now: new Date("2026-05-27T18:30:00.000Z"), tribeSlug: "matematica-pro" })
    ).resolves.toEqual({
      attendanceStreak: { attendedCount: 2, occurrenceCount: 3 },
      computedAt: "2026-05-27T18:30:00.000Z",
      nextRefreshAt: "2026-05-27T19:00:00.000Z",
    });
  });

  it("decides finished occurrences and the deadline with the database clock when the host clock runs ahead", async () => {
    // The application host is 7 s ahead: by its clock the 05-27 slot already
    // ended at 19:00, but PostgreSQL (18:59:58) still accepts answers for it.
    const execute = getTribeEventAttendanceStreakSnapshot({
      tribeEventRepository: createRepository(
        [weeklyEvent],
        [
          goingTo("2026-05-13T18:00:00.000Z"),
          goingTo("2026-05-20T18:00:00.000Z"),
          goingTo("2026-05-27T18:00:00.000Z"),
        ],
        "2026-05-27T18:59:58.000Z"
      ),
    });

    await expect(
      execute({ now: new Date("2026-05-27T19:00:05.000Z"), tribeSlug: "matematica-pro" })
    ).resolves.toEqual({
      // The running 05-27 slot is not in the streak yet and its end stays the
      // next refresh, both at the database instant exposed as computedAt.
      attendanceStreak: { attendedCount: 2, occurrenceCount: 3 },
      computedAt: "2026-05-27T18:59:58.000Z",
      nextRefreshAt: "2026-05-27T19:00:00.000Z",
    });
  });

  it("counts an occurrence the database already finished even when the host clock lags", async () => {
    const execute = getTribeEventAttendanceStreakSnapshot({
      tribeEventRepository: createRepository(
        [weeklyEvent],
        [
          goingTo("2026-05-13T18:00:00.000Z"),
          goingTo("2026-05-20T18:00:00.000Z"),
          goingTo("2026-05-27T18:00:00.000Z"),
        ],
        "2026-05-27T19:00:03.000Z"
      ),
    });

    await expect(
      execute({ now: new Date("2026-05-27T18:59:55.000Z"), tribeSlug: "matematica-pro" })
    ).resolves.toEqual({
      attendanceStreak: { attendedCount: 3, occurrenceCount: 4 },
      computedAt: "2026-05-27T19:00:03.000Z",
      nextRefreshAt: "2026-06-03T19:00:00.000Z",
    });
  });

  it("fails instead of computing with incomplete ranges when the clocks drift beyond the margin", async () => {
    const execute = getTribeEventAttendanceStreakSnapshot({
      tribeEventRepository: createRepository([weeklyEvent], [], "2026-05-27T19:30:00.000Z"),
    });

    await expect(
      execute({ now: new Date("2026-05-27T19:00:00.000Z"), tribeSlug: "matematica-pro" })
    ).rejects.toThrow("database reference time is outside the read margin");
  });

  it("returns the end of an occurrence that started last month and is still running", async () => {
    const execute = getTribeEventAttendanceStreakSnapshot({
      tribeEventRepository: createRepository([
        createEvent({
          endsAt: "2026-06-01T05:00:00.000Z",
          startsAt: "2026-05-31T23:00:00.000Z",
          title: "Taller de cierre",
        }),
        createEvent({
          endsAt: "2026-06-03T19:00:00.000Z",
          id: OTHER_EVENT_ID,
          startsAt: "2026-06-03T18:00:00.000Z",
          title: "Clase de junio",
        }),
      ]),
    });

    await expect(
      execute({ now: new Date("2026-06-01T01:00:00.000Z"), tribeSlug: "matematica-pro" })
    ).resolves.toMatchObject({ nextRefreshAt: "2026-06-01T05:00:00.000Z" });
  });

  it("picks the nearest effective end, even when a later start ends first", async () => {
    const execute = getTribeEventAttendanceStreakSnapshot({
      tribeEventRepository: createRepository([
        createEvent({
          endsAt: "2026-05-10T20:00:00.000Z",
          startsAt: "2026-05-10T11:00:00.000Z",
          title: "Jornada larga",
        }),
        createEvent({
          endsAt: null,
          id: OTHER_EVENT_ID,
          startsAt: "2026-05-10T13:00:00.000Z",
          title: "Sin fin explícito",
        }),
      ]),
    });

    await expect(
      execute({ now: new Date("2026-05-10T12:00:00.000Z"), tribeSlug: "matematica-pro" })
    ).resolves.toMatchObject({ nextRefreshAt: "2026-05-10T14:00:00.000Z" });
  });

  it("returns a null next refresh when no occurrence ends inside the window", async () => {
    const execute = getTribeEventAttendanceStreakSnapshot({
      tribeEventRepository: createRepository([
        createEvent({
          endsAt: "2026-05-09T11:00:00.000Z",
          startsAt: "2026-05-09T10:00:00.000Z",
          title: "Ya pasó",
        }),
      ]),
    });

    await expect(
      execute({ now: new Date("2026-05-10T12:00:00.000Z"), tribeSlug: "matematica-pro" })
    ).resolves.toEqual({
      attendanceStreak: null,
      computedAt: "2026-05-10T12:00:00.000Z",
      nextRefreshAt: null,
    });
  });
});
