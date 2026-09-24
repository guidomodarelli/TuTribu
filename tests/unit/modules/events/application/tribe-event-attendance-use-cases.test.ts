import { vi, describe, it, expect, afterEach } from "vitest";
import {
  clearTribeEventAttendance,
  getTribeEventAttendanceReport,
  getTribeEventAttendanceStreak,
  setTribeEventAttendance,
} from "@/src/modules/events/application/use-cases/tribe-event-attendance-use-cases";
import { TRIBE_EVENT_MUTATION_STATUS } from "@/src/modules/events/constants/tribe-events";
import type { TribeEvent } from "@/src/modules/events/domain/entities/tribe-event";
import type { TribeEventRepository } from "@/src/modules/events/domain/repositories/tribe-event-repository";
import { createTribeEventExceptionRepositoryDouble } from "../support/tribe-event-repository-doubles";

const EVENT_ID = "6f3c7a1e-2b4d-4c8e-9f10-1a2b3c4d5e6f";

const weeklyEvent: TribeEvent = {
  capacity: null,
  description: null,
  eventType: "live",
  endsAt: "2026-05-06T19:00:00.000Z",
  id: EVENT_ID,
  meetingUrl: null,
  recurrenceFrequency: "weekly",
  recurrenceUntil: null,
  startsAt: "2026-05-06T18:00:00.000Z",
  title: "Clase abierta",
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
const beforeOccurrence = () => Date.parse("2026-05-13T12:00:00.000Z");
const duringOccurrence = () => Date.parse("2026-05-13T18:30:00.000Z");
const afterOccurrence = () => Date.parse("2026-05-13T19:00:00.000Z");

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
    listEventOccurrences: vi.fn(async () => ({ attendances: [], event: null, exceptions: [] })),
    listViewerAttendanceHistory: vi.fn(),
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
    const execute = setTribeEventAttendance({
      now: beforeOccurrence,
      tribeEventOccurrenceExceptionRepository: createTribeEventExceptionRepositoryDouble(),
      tribeEventRepository: repository,
    });

    await expect(
      execute({
        eventId: EVENT_ID,
        occurrenceStartsAt: "2026-05-13T18:00:00.000Z",
        status: "going",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      attendance: savedAttendance,
      status: TRIBE_EVENT_MUTATION_STATUS.attendanceSaved,
    });
    expect(repository.setAttendance).toHaveBeenCalledWith({
      eventId: EVENT_ID,
      occurrenceStartsAt: "2026-05-13T18:00:00.000Z",
      status: "going",
      tribeSlug: "matematica-pro",
    });
  });

  it("accepts maybe as an answer", async () => {
    const repository = createRepository();
    const execute = setTribeEventAttendance({
      now: beforeOccurrence,
      tribeEventOccurrenceExceptionRepository: createTribeEventExceptionRepositoryDouble(),
      tribeEventRepository: repository,
    });

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

  it("rejects instants that are not a slot of the series", async () => {
    const repository = createRepository();
    const execute = setTribeEventAttendance({
      now: beforeOccurrence,
      tribeEventOccurrenceExceptionRepository: createTribeEventExceptionRepositoryDouble(),
      tribeEventRepository: repository,
    });

    await expect(
      execute({
        eventId: EVENT_ID,
        occurrenceStartsAt: "2026-05-14T18:00:00.000Z",
        status: "going",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({ status: TRIBE_EVENT_MUTATION_STATUS.invalidAttendance });
    expect(repository.setAttendance).not.toHaveBeenCalled();
  });

  it("reports not found for events that do not exist in the tribe", async () => {
    const repository = createRepository({ findById: vi.fn(async () => null) });
    const execute = setTribeEventAttendance({
      now: beforeOccurrence,
      tribeEventOccurrenceExceptionRepository: createTribeEventExceptionRepositoryDouble(),
      tribeEventRepository: repository,
    });

    await expect(
      execute({
        eventId: EVENT_ID,
        occurrenceStartsAt: "2026-05-13T18:00:00.000Z",
        status: "going",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({ status: TRIBE_EVENT_MUTATION_STATUS.notFound });
    expect(repository.setAttendance).not.toHaveBeenCalled();
  });

  it("clears the viewer answer through the repository", async () => {
    const repository = createRepository({
      clearAttendance: vi.fn(async () => ({
        attendance: clearedAttendance,
        status: TRIBE_EVENT_MUTATION_STATUS.attendanceCleared,
      })),
    });
    const execute = clearTribeEventAttendance({
      now: beforeOccurrence,
      tribeEventOccurrenceExceptionRepository: createTribeEventExceptionRepositoryDouble(),
      tribeEventRepository: repository,
    });

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
      tribeSlug: "matematica-pro",
    });
  });

  describe("finished occurrences", () => {
    const occurrenceKey = {
      eventId: EVENT_ID,
      occurrenceStartsAt: "2026-05-13T18:00:00.000Z",
      tribeSlug: "matematica-pro",
    };

    it("rejects answering once the occurrence ended without touching attendance rows", async () => {
      const repository = createRepository();
      const execute = setTribeEventAttendance({
        now: afterOccurrence,
        tribeEventOccurrenceExceptionRepository: createTribeEventExceptionRepositoryDouble(),
        tribeEventRepository: repository,
      });

      await expect(execute({ ...occurrenceKey, status: "going" })).resolves.toEqual({
        status: TRIBE_EVENT_MUTATION_STATUS.occurrenceEnded,
      });
      expect(repository.setAttendance).not.toHaveBeenCalled();
    });

    it("rejects clearing the answer once the occurrence ended", async () => {
      const repository = createRepository();
      const execute = clearTribeEventAttendance({
        now: afterOccurrence,
        tribeEventOccurrenceExceptionRepository: createTribeEventExceptionRepositoryDouble(),
        tribeEventRepository: repository,
      });

      await expect(execute(occurrenceKey)).resolves.toEqual({
        status: TRIBE_EVENT_MUTATION_STATUS.occurrenceEnded,
      });
      expect(repository.clearAttendance).not.toHaveBeenCalled();
    });

    it("uses the default duration for series without an end", async () => {
      const repository = createRepository({
        findById: vi.fn(async () => ({ ...weeklyEvent, endsAt: null })),
      });
      const execute = setTribeEventAttendance({
        now: afterOccurrence,
        tribeEventOccurrenceExceptionRepository: createTribeEventExceptionRepositoryDouble(),
        tribeEventRepository: repository,
      });

      await expect(execute({ ...occurrenceKey, status: "maybe" })).resolves.toEqual({
        status: TRIBE_EVENT_MUTATION_STATUS.occurrenceEnded,
      });
      expect(repository.setAttendance).not.toHaveBeenCalled();
    });

    it("still accepts set and clear while the occurrence is in progress", async () => {
      const repository = createRepository({
        clearAttendance: vi.fn(async () => ({
          attendance: clearedAttendance,
          status: TRIBE_EVENT_MUTATION_STATUS.attendanceCleared,
        })),
      });
      const setAttendance = setTribeEventAttendance({
        now: duringOccurrence,
        tribeEventOccurrenceExceptionRepository: createTribeEventExceptionRepositoryDouble(),
        tribeEventRepository: repository,
      });
      const clearAttendance = clearTribeEventAttendance({
        now: duringOccurrence,
        tribeEventOccurrenceExceptionRepository: createTribeEventExceptionRepositoryDouble(),
        tribeEventRepository: repository,
      });

      await expect(setAttendance({ ...occurrenceKey, status: "going" })).resolves.toEqual({
        attendance: savedAttendance,
        status: TRIBE_EVENT_MUTATION_STATUS.attendanceSaved,
      });
      await expect(clearAttendance(occurrenceKey)).resolves.toEqual({
        attendance: clearedAttendance,
        status: TRIBE_EVENT_MUTATION_STATUS.attendanceCleared,
      });
      expect(repository.setAttendance).toHaveBeenCalledTimes(1);
      expect(repository.clearAttendance).toHaveBeenCalledTimes(1);
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
      const execute = getTribeEventAttendanceReport({
      tribeEventOccurrenceExceptionRepository: createTribeEventExceptionRepositoryDouble(),
      tribeEventRepository: repository,
    });
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
      const execute = getTribeEventAttendanceReport({
      tribeEventOccurrenceExceptionRepository: createTribeEventExceptionRepositoryDouble(),
      tribeEventRepository: repository,
    });

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
      const execute = getTribeEventAttendanceReport({
      tribeEventOccurrenceExceptionRepository: createTribeEventExceptionRepositoryDouble(),
      tribeEventRepository: repository,
    });

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

  describe("attendance streak", () => {
    it("reports how many of the last finished occurrences the viewer went to", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-06-01T12:00:00.000Z"));
      const listViewerAttendanceHistory = vi.fn(async () => ({
        events: [weeklyEvent],
        exceptions: [],
        viewerAttendances: [
          { eventId: EVENT_ID, occurrenceStartsAt: "2026-05-06T18:00:00.000Z", status: "going" as const },
          { eventId: EVENT_ID, occurrenceStartsAt: "2026-05-13T18:00:00.000Z", status: "going" as const },
          { eventId: EVENT_ID, occurrenceStartsAt: "2026-05-20T18:00:00.000Z", status: "maybe" as const },
          { eventId: EVENT_ID, occurrenceStartsAt: "2026-05-27T18:00:00.000Z", status: "going" as const },
        ],
      }));
      const execute = getTribeEventAttendanceStreak({
        tribeEventOccurrenceExceptionRepository: createTribeEventExceptionRepositoryDouble(),
        tribeEventRepository: createRepository({ listViewerAttendanceHistory }),
      });

      await expect(execute({ tribeSlug: " matematica-pro " })).resolves.toEqual({
        attendedCount: 3,
        occurrenceCount: 4,
      });
      expect(listViewerAttendanceHistory).toHaveBeenCalledWith({
        rangeEnd: "2026-06-01T12:00:00.000Z",
        rangeStart: "2025-12-03T12:00:00.000Z",
        tribeSlug: "matematica-pro",
      });
    });

    it("returns null below the minimum", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-06-01T12:00:00.000Z"));
      const execute = getTribeEventAttendanceStreak({
        tribeEventOccurrenceExceptionRepository: createTribeEventExceptionRepositoryDouble(),
        tribeEventRepository: createRepository({
          listViewerAttendanceHistory: vi.fn(async () => ({
            events: [weeklyEvent],
            exceptions: [],
            viewerAttendances: [
              { eventId: EVENT_ID, occurrenceStartsAt: "2026-05-27T18:00:00.000Z", status: "going" as const },
            ],
          })),
        }),
      });

      await expect(execute({ tribeSlug: "matematica-pro" })).resolves.toBeNull();
    });
  });
});
