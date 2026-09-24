import { afterEach, describe, expect, it, vi } from "vitest";
import { getTribeEventAttendanceStreakSnapshot } from "@/src/modules/events/application/use-cases/get-tribe-event-attendance-streak-snapshot-use-case";
import type { TribeEvent } from "@/src/modules/events/domain/entities/tribe-event";
import type { TribeEventRepository } from "@/src/modules/events/domain/repositories/tribe-event-repository";
import { readAttendanceStreakResponseFragment } from "@/src/modules/events/infrastructure/api/tribe-event-attendance-streak-response";

const EVENT_ID = "6f3c7a1e-2b4d-4c8e-9f10-1a2b3c4d5e6f";
const TRIBE_SLUG = "matematica-pro";

// Weekly one-hour series: 05-06, 05-13 and 05-20 already finished and the
// 05-27 slot is running (18:00–19:00 UTC) when the mutation response starts.
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
const RUNNING_OCCURRENCE_END = "2026-05-27T19:00:00.000Z";
const BEFORE_RUNNING_OCCURRENCE_END = new Date("2026-05-27T18:30:00.000Z");
const AFTER_RUNNING_OCCURRENCE_END = new Date("2026-05-27T19:30:00.000Z");
/** Database instant of the snapshot statement, a few seconds behind the host. */
const DATABASE_REFERENCE_TIME = "2026-05-27T18:29:57.000Z";
/** End of the viewer answers read range: host instant plus the 15-minute margin. */
const READ_RANGE_END = "2026-05-27T18:45:00.000Z";

function createRepository(overrides: Partial<TribeEventRepository> = {}) {
  return {
    clearAttendance: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    findById: vi.fn(),
    getOccurrenceAttendanceReport: vi.fn(),
    listByTribeRange: vi.fn(),
    readViewerAttendanceStreakSnapshot: vi.fn(),
    setAttendance: vi.fn(),
    update: vi.fn(),
    ...overrides,
  } satisfies TribeEventRepository;
}

describe("readAttendanceStreakResponseFragment", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("computes the streak and its deadline from one read at one instant even when the clock advances", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BEFORE_RUNNING_OCCURRENCE_END);
    // The running occurrence ends while the snapshot is being read, so any
    // second read that samples the clock again would already skip it.
    const readViewerAttendanceStreakSnapshot = vi.fn(async () => {
      vi.setSystemTime(AFTER_RUNNING_OCCURRENCE_END);

      return {
        events: [weeklyEvent],
        referenceTime: DATABASE_REFERENCE_TIME,
        viewerAttendances: [
          "2026-05-06T18:00:00.000Z",
          "2026-05-13T18:00:00.000Z",
          "2026-05-20T18:00:00.000Z",
          "2026-05-27T18:00:00.000Z",
        ].map((occurrenceStartsAt) => ({
          eventId: EVENT_ID,
          occurrenceStartsAt,
          status: "going" as const,
        })),
      };
    });
    const tribeEventRepository = createRepository({ readViewerAttendanceStreakSnapshot });
    const logger = { error: vi.fn() };

    const fragment = await readAttendanceStreakResponseFragment({
      eventId: EVENT_ID,
      getTribeEventAttendanceStreakSnapshot: getTribeEventAttendanceStreakSnapshot({
        tribeEventRepository,
      }),
      logger,
      tribeSlug: TRIBE_SLUG,
      viewerId: "member-1",
    });

    // The streak has not counted the running occurrence yet, so the deadline
    // must be exactly its end instead of a later one.
    // Both are computed at the database instant, which the fragment exposes.
    expect(fragment).toEqual({
      attendanceStreak: { attendedCount: 3, occurrenceCount: 3 },
      attendanceStreakComputedAt: DATABASE_REFERENCE_TIME,
      attendanceStreakNextRefreshAt: RUNNING_OCCURRENCE_END,
    });
    // Both values come from a single snapshot read of the repository.
    expect(readViewerAttendanceStreakSnapshot).toHaveBeenCalledTimes(1);
    expect(readViewerAttendanceStreakSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        viewerAttendanceRange: expect.objectContaining({
          rangeEnd: READ_RANGE_END,
        }),
      })
    );
    expect(tribeEventRepository.listByTribeRange).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("omits both fields and logs once when the snapshot read fails", async () => {
    const readError = new Error("snapshot query failed");
    const logger = { error: vi.fn() };

    const fragment = await readAttendanceStreakResponseFragment({
      eventId: EVENT_ID,
      getTribeEventAttendanceStreakSnapshot: vi.fn(async () => {
        throw readError;
      }),
      logger,
      tribeSlug: TRIBE_SLUG,
      viewerId: "member-1",
    });

    expect(fragment).toEqual({});
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        error: readError,
        message: "Failed to recompute tribe event attendance streak after mutation",
        metadata: expect.objectContaining({
          eventId: EVENT_ID,
          slug: TRIBE_SLUG,
          viewerId: "member-1",
        }),
      })
    );
  });

  it("keeps a valid streak and omits only the instant that breaks the public contract", async () => {
    const logger = { error: vi.fn() };

    const fragment = await readAttendanceStreakResponseFragment({
      eventId: EVENT_ID,
      getTribeEventAttendanceStreakSnapshot: vi.fn(async () => ({
        attendanceStreak: { attendedCount: 3, occurrenceCount: 5 },
        computedAt: DATABASE_REFERENCE_TIME,
        nextRefreshAt: "mañana",
      })),
      logger,
      tribeSlug: TRIBE_SLUG,
      viewerId: "member-1",
    });

    expect(fragment).toEqual({
      attendanceStreak: { attendedCount: 3, occurrenceCount: 5 },
      attendanceStreakComputedAt: DATABASE_REFERENCE_TIME,
    });
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        message:
          "Failed to recompute tribe event attendance streak next refresh after mutation",
      })
    );
  });
});
