import { vi, describe, it, expect, afterEach } from "vitest";
import {
  clearTribeEventAttendance,
  getTribeEventAttendanceReport,
  setTribeEventAttendance,
} from "@/src/modules/events/application/use-cases/tribe-event-attendance-use-cases";
import { TRIBE_EVENT_MUTATION_STATUS } from "@/src/modules/events/constants/tribe-events";
import type { TribeEvent } from "@/src/modules/events/domain/entities/tribe-event";
import type { TribeEventRepository } from "@/src/modules/events/domain/repositories/tribe-event-repository";

const EVENT_ID = "6f3c7a1e-2b4d-4c8e-9f10-1a2b3c4d5e6f";

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

// Schedule the use case validated; the repository must receive exactly it.
const weeklySchedule = {
  endsAt: weeklyEvent.endsAt,
  recurrenceFrequency: weeklyEvent.recurrenceFrequency,
  recurrenceUntil: weeklyEvent.recurrenceUntil,
  startsAt: weeklyEvent.startsAt,
};

const savedAttendance = {
  goingCount: 3,
  goingPreview: [{ id: "user-ana", image: null, name: "Ana" }],
  maybeCount: 1,
  viewerStatus: "going" as const,
  viewerWaitlistPosition: null,
  waitlistedCount: 0,
};
// The 2026-05-13 slot runs 18:00–19:00 UTC (series duration of one hour).
const duringOccurrence = Date.parse("2026-05-13T18:30:00.000Z");
const afterOccurrence = Date.parse("2026-05-13T19:00:00.000Z");

const clearedAttendance = {
  ...savedAttendance,
  goingCount: 2,
  viewerStatus: null,
};

function createRepository(overrides: Partial<TribeEventRepository> = {}) {
  return {
    clearAttendance: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    findById: vi.fn(async () => weeklyEvent),
    getOccurrenceAttendanceReport: vi.fn(),
    listByTribeRange: vi.fn(),
    readViewerAttendanceStreakSnapshot: vi.fn(),
    setAttendance: vi.fn(async () => ({
      attendance: savedAttendance,
      status: TRIBE_EVENT_MUTATION_STATUS.attendanceSaved,
    })),
    update: vi.fn(),
    ...overrides,
  } satisfies TribeEventRepository;
}

describe("tribe event attendance use cases", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("records the viewer answer for a real occurrence of the series", async () => {
    const repository = createRepository();
    const execute = setTribeEventAttendance({ tribeEventRepository: repository });

    await expect(
      execute({
        eventId: ` ${EVENT_ID} `,
        occurrenceStartsAt: "2026-05-13T18:00:00Z",
        status: " going ",
        tribeSlug: " matematica-pro ",
      })
    ).resolves.toEqual({
      attendance: savedAttendance,
      status: TRIBE_EVENT_MUTATION_STATUS.attendanceSaved,
    });
    expect(repository.setAttendance).toHaveBeenCalledWith({
      eventId: EVENT_ID,
      occurrenceStartsAt: "2026-05-13T18:00:00.000Z",
      schedule: weeklySchedule,
      status: "going",
      tribeSlug: "matematica-pro",
    });
  });

  it("accepts maybe as an answer", async () => {
    const repository = createRepository();
    const execute = setTribeEventAttendance({ tribeEventRepository: repository });

    await execute({
      eventId: EVENT_ID,
      occurrenceStartsAt: "2026-05-13T18:00:00.000Z",
      status: "maybe",
      tribeSlug: "matematica-pro",
    });

    expect(repository.setAttendance).toHaveBeenCalledWith(
      expect.objectContaining({ status: "maybe" })
    );
  });

  it("rejects unknown answers and waitlisted, which only the database assigns", async () => {
    const repository = createRepository();
    const execute = setTribeEventAttendance({ tribeEventRepository: repository });

    for (const status of ["perhaps", "waitlisted"]) {
      await expect(
        execute({
          eventId: EVENT_ID,
          occurrenceStartsAt: "2026-05-13T18:00:00.000Z",
          status,
          tribeSlug: "matematica-pro",
        })
      ).resolves.toEqual({ status: TRIBE_EVENT_MUTATION_STATUS.invalidAttendance });
    }

    expect(repository.findById).not.toHaveBeenCalled();
    expect(repository.setAttendance).not.toHaveBeenCalled();
  });

  it("rejects instants that are not a slot of the series", async () => {
    const repository = createRepository();
    const execute = setTribeEventAttendance({ tribeEventRepository: repository });

    await expect(
      execute({
        eventId: EVENT_ID,
        occurrenceStartsAt: "2026-05-14T18:00:00.000Z",
        status: "going",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({ status: TRIBE_EVENT_MUTATION_STATUS.invalidAttendance });
    await expect(
      execute({
        eventId: EVENT_ID,
        occurrenceStartsAt: "not-a-date",
        status: "going",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({ status: TRIBE_EVENT_MUTATION_STATUS.invalidAttendance });
    expect(repository.setAttendance).not.toHaveBeenCalled();
  });

  it("reports not found for unknown or malformed events", async () => {
    const repository = createRepository({ findById: vi.fn(async () => null) });
    const execute = setTribeEventAttendance({ tribeEventRepository: repository });

    await expect(
      execute({
        eventId: EVENT_ID,
        occurrenceStartsAt: "2026-05-13T18:00:00.000Z",
        status: "going",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({ status: TRIBE_EVENT_MUTATION_STATUS.notFound });
    await expect(
      execute({
        eventId: "not-a-uuid",
        occurrenceStartsAt: "2026-05-13T18:00:00.000Z",
        status: "going",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({ status: TRIBE_EVENT_MUTATION_STATUS.notFound });
    expect(repository.findById).toHaveBeenCalledTimes(1);
  });

  it("clears the viewer answer through the repository", async () => {
    const repository = createRepository({
      clearAttendance: vi.fn(async () => ({
        attendance: clearedAttendance,
        status: TRIBE_EVENT_MUTATION_STATUS.attendanceCleared,
      })),
    });
    const execute = clearTribeEventAttendance({ tribeEventRepository: repository });

    await expect(
      execute({
        eventId: EVENT_ID,
        occurrenceStartsAt: "2026-05-13T18:00:00.000Z",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      attendance: clearedAttendance,
      status: TRIBE_EVENT_MUTATION_STATUS.attendanceCleared,
    });
    expect(repository.clearAttendance).toHaveBeenCalledWith({
      eventId: EVENT_ID,
      occurrenceStartsAt: "2026-05-13T18:00:00.000Z",
      schedule: weeklySchedule,
      tribeSlug: "matematica-pro",
    });
  });

  it("returns schedule_changed when the schedule changed after the occurrence was validated", async () => {
    const scheduleChanged = { status: TRIBE_EVENT_MUTATION_STATUS.scheduleChanged };
    const repository = createRepository({
      clearAttendance: vi.fn(async () => scheduleChanged),
      setAttendance: vi.fn(async () => scheduleChanged),
    });
    const occurrenceKey = {
      eventId: EVENT_ID,
      occurrenceStartsAt: "2026-05-13T18:00:00.000Z",
      tribeSlug: "matematica-pro",
    };

    await expect(
      setTribeEventAttendance({ tribeEventRepository: repository })({
        ...occurrenceKey,
        status: "going",
      })
    ).resolves.toEqual(scheduleChanged);
    await expect(
      clearTribeEventAttendance({ tribeEventRepository: repository })(
        occurrenceKey
      )
    ).resolves.toEqual(scheduleChanged);
  });

  describe("finished occurrences", () => {
    const occurrenceKey = {
      eventId: EVENT_ID,
      occurrenceStartsAt: "2026-05-13T18:00:00.000Z",
      tribeSlug: "matematica-pro",
    };

    // The locked SQL function decides the end with the database clock, so the
    // application host clock (possibly ahead of PostgreSQL) never rejects early.
    it("forwards set and clear to the repository even when the host clock is past the end", async () => {
      vi.useFakeTimers({ now: afterOccurrence });
      const repository = createRepository({
        clearAttendance: vi.fn(async () => ({
          attendance: clearedAttendance,
          status: TRIBE_EVENT_MUTATION_STATUS.attendanceCleared,
        })),
      });

      await expect(
        setTribeEventAttendance({ tribeEventRepository: repository })({
          ...occurrenceKey,
          status: "going",
        })
      ).resolves.toEqual({
        attendance: savedAttendance,
        status: TRIBE_EVENT_MUTATION_STATUS.attendanceSaved,
      });
      await expect(
        clearTribeEventAttendance({ tribeEventRepository: repository })(occurrenceKey)
      ).resolves.toEqual({
        attendance: clearedAttendance,
        status: TRIBE_EVENT_MUTATION_STATUS.attendanceCleared,
      });
      expect(repository.setAttendance).toHaveBeenCalledWith({
        ...occurrenceKey,
        schedule: weeklySchedule,
        status: "going",
      });
      expect(repository.clearAttendance).toHaveBeenCalledWith({
        ...occurrenceKey,
        schedule: weeklySchedule,
      });
    });

    it("returns occurrence_ended when the database reports the occurrence already ended", async () => {
      vi.useFakeTimers({ now: duringOccurrence });
      const occurrenceEnded = { status: TRIBE_EVENT_MUTATION_STATUS.occurrenceEnded };
      const repository = createRepository({
        clearAttendance: vi.fn(async () => occurrenceEnded),
        setAttendance: vi.fn(async () => occurrenceEnded),
      });

      await expect(
        setTribeEventAttendance({ tribeEventRepository: repository })({
          ...occurrenceKey,
          status: "maybe",
        })
      ).resolves.toEqual(occurrenceEnded);
      await expect(
        clearTribeEventAttendance({ tribeEventRepository: repository })(occurrenceKey)
      ).resolves.toEqual(occurrenceEnded);
    });
  });

  describe("attendance report", () => {
    it("groups the answers by status and adds the going trend of the last finished occurrences", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-06-01T12:00:00.000Z"));
      const getOccurrenceAttendanceReport = vi.fn(async () => ({
        attendees: [
          { name: "Ana", respondedAt: "2026-05-30T10:00:00.000Z", status: "going" as const },
          { name: "Beto", respondedAt: "2026-05-30T11:00:00.000Z", status: "waitlisted" as const },
          { name: "Caro", respondedAt: "2026-05-30T09:00:00.000Z", status: "maybe" as const },
          { name: "Dani", respondedAt: "2026-05-30T08:00:00.000Z", status: "not_going" as const },
          { name: "Eli", respondedAt: "2026-05-30T09:30:00.000Z", status: "going" as const },
        ],
        status: TRIBE_EVENT_MUTATION_STATUS.found,
        trend: [
          { goingCount: 4, occurrenceStartsAt: "2026-05-20T18:00:00.000Z" },
          { goingCount: 6, occurrenceStartsAt: "2026-05-27T18:00:00.000Z" },
        ],
      }));
      const repository = createRepository({ getOccurrenceAttendanceReport });
      const execute = getTribeEventAttendanceReport({ tribeEventRepository: repository });
      // The series started on 2026-05-06, so only four slots have finished.
      const expectedTrendStarts = [
        "2026-05-06T18:00:00.000Z",
        "2026-05-13T18:00:00.000Z",
        "2026-05-20T18:00:00.000Z",
        "2026-05-27T18:00:00.000Z",
      ];
      const trendGoingCounts: Record<string, number> = {
        "2026-05-20T18:00:00.000Z": 4,
        "2026-05-27T18:00:00.000Z": 6,
      };

      const result = await execute({
        eventId: EVENT_ID,
        occurrenceStartsAt: "2026-06-03T18:00:00.000Z",
        tribeSlug: "matematica-pro",
      });

      expect(getOccurrenceAttendanceReport).toHaveBeenCalledWith({
        eventId: EVENT_ID,
        occurrenceStartsAt: "2026-06-03T18:00:00.000Z",
        trendOccurrenceStartsAts: expectedTrendStarts,
        tribeSlug: "matematica-pro",
      });
      expect(result).toEqual({
        report: {
          attendeeGroups: {
            going: [
              { name: "Ana", respondedAt: "2026-05-30T10:00:00.000Z", status: "going" },
              { name: "Eli", respondedAt: "2026-05-30T09:30:00.000Z", status: "going" },
            ],
            maybe: [{ name: "Caro", respondedAt: "2026-05-30T09:00:00.000Z", status: "maybe" }],
            notGoing: [
              { name: "Dani", respondedAt: "2026-05-30T08:00:00.000Z", status: "not_going" },
            ],
            waitlisted: [
              { name: "Beto", respondedAt: "2026-05-30T11:00:00.000Z", status: "waitlisted" },
            ],
          },
          eventTitle: "Clase abierta",
          occurrenceStartsAt: "2026-06-03T18:00:00.000Z",
          trend: expectedTrendStarts.map((occurrenceStartsAt) => ({
            goingCount: trendGoingCounts[occurrenceStartsAt] ?? 0,
            occurrenceStartsAt,
          })),
        },
        status: TRIBE_EVENT_MUTATION_STATUS.found,
      });
    });

    it("skips the trend for single events and forwards forbidden for non-managers", async () => {
      const getOccurrenceAttendanceReport = vi.fn(async () => ({
        status: TRIBE_EVENT_MUTATION_STATUS.forbidden,
      }));
      const repository = createRepository({
        findById: vi.fn(async () => ({ ...weeklyEvent, recurrenceFrequency: "none" as const })),
        getOccurrenceAttendanceReport,
      });
      const execute = getTribeEventAttendanceReport({ tribeEventRepository: repository });

      await expect(
        execute({
          eventId: EVENT_ID,
          occurrenceStartsAt: "2026-05-06T18:00:00.000Z",
          tribeSlug: "matematica-pro",
        })
      ).resolves.toEqual({ status: TRIBE_EVENT_MUTATION_STATUS.forbidden });
      expect(getOccurrenceAttendanceReport).toHaveBeenCalledWith(
        expect.objectContaining({ trendOccurrenceStartsAts: [] })
      );
    });

    it("rejects occurrences that are not part of the series", async () => {
      const repository = createRepository();
      const execute = getTribeEventAttendanceReport({ tribeEventRepository: repository });

      await expect(
        execute({
          eventId: EVENT_ID,
          occurrenceStartsAt: "2026-05-14T18:00:00.000Z",
          tribeSlug: "matematica-pro",
        })
      ).resolves.toEqual({ status: TRIBE_EVENT_MUTATION_STATUS.invalidAttendance });
      expect(repository.getOccurrenceAttendanceReport).not.toHaveBeenCalled();
    });
  });
});
