import { afterEach, describe, expect, it, vi } from "vitest";
import { getTribeEventAttendanceStreakSnapshot } from "@/src/modules/events/application/use-cases/get-tribe-event-attendance-streak-snapshot-use-case";
import type { TribeEvent } from "@/src/modules/events/domain/entities/tribe-event";
import type {
  TribeEventRepository,
  TribeEventViewerAttendance,
} from "@/src/modules/events/domain/repositories/tribe-event-repository";

const EVENT_ID = "6f3c7a1e-2b4d-4c8e-9f10-1a2b3c4d5e6f";
const OTHER_EVENT_ID = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";

const weeklyEvent: TribeEvent = {
  capacity: null,
  description: null,
  endsAt: "2026-05-06T19:00:00.000Z",
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

function createRepository(
  events: TribeEvent[],
  viewerAttendances: TribeEventViewerAttendance[] = []
) {
  return {
    clearAttendance: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    findById: vi.fn(),
    getOccurrenceAttendanceReport: vi.fn(),
    listByTribeRange: vi.fn(),
    readViewerAttendanceStreakSnapshot: vi.fn(async () => ({ events, viewerAttendances })),
    setAttendance: vi.fn(),
    update: vi.fn(),
  } satisfies TribeEventRepository;
}

describe("getTribeEventAttendanceStreakSnapshot", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reads the past answers and the upcoming schedule through one snapshot read", async () => {
    const repository = createRepository([weeklyEvent]);
    const execute = getTribeEventAttendanceStreakSnapshot({ tribeEventRepository: repository });

    await execute({ now: new Date("2026-06-01T12:00:00.000Z"), tribeSlug: " matematica-pro " });

    expect(repository.readViewerAttendanceStreakSnapshot).toHaveBeenCalledTimes(1);
    expect(repository.readViewerAttendanceStreakSnapshot).toHaveBeenCalledWith({
      eventRange: {
        rangeEnd: "2026-07-01T12:00:00.000Z",
        rangeStart: "2025-12-03T12:00:00.000Z",
      },
      tribeSlug: "matematica-pro",
      viewerAttendanceRange: {
        rangeEnd: "2026-06-01T12:00:00.000Z",
        rangeStart: "2025-12-03T12:00:00.000Z",
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
      nextRefreshAt: "2026-06-03T19:00:00.000Z",
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
      nextRefreshAt: "2026-05-27T19:00:00.000Z",
    });
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
    ).resolves.toEqual({ attendanceStreak: null, nextRefreshAt: null });
  });
});
