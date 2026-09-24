import { afterEach, describe, expect, it, vi } from "vitest";
import { getTribeEventAttendanceStreakNextRefreshAt } from "@/src/modules/events/application/use-cases/list-upcoming-tribe-events-use-case";
import { getTribeEventAttendanceStreak } from "@/src/modules/events/application/use-cases/tribe-event-attendance-use-cases";
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

function createRepository(overrides: Partial<TribeEventRepository> = {}) {
  return {
    clearAttendance: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    findById: vi.fn(),
    getOccurrenceAttendanceReport: vi.fn(),
    listByTribeRange: vi.fn(async () => ({
      attendances: [],
      events: [weeklyEvent],
      viewerPermissions: { canManageEvents: true },
    })),
    listViewerAttendanceHistory: vi.fn(),
    setAttendance: vi.fn(),
    update: vi.fn(),
    ...overrides,
  } satisfies TribeEventRepository;
}

describe("readAttendanceStreakResponseFragment", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("computes the streak and its deadline from one instant even when the clock advances between reads", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BEFORE_RUNNING_OCCURRENCE_END);
    // The running occurrence ends while the streak history is being read, so
    // any read that samples the clock again would already skip it.
    const listViewerAttendanceHistory = vi.fn(async () => {
      vi.setSystemTime(AFTER_RUNNING_OCCURRENCE_END);

      return {
        events: [weeklyEvent],
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
    const tribeEventRepository = createRepository({ listViewerAttendanceHistory });
    const logger = { error: vi.fn() };

    const fragment = await readAttendanceStreakResponseFragment({
      eventId: EVENT_ID,
      getTribeEventAttendanceStreak: getTribeEventAttendanceStreak({ tribeEventRepository }),
      getTribeEventAttendanceStreakNextRefreshAt: getTribeEventAttendanceStreakNextRefreshAt({
        tribeEventRepository,
      }),
      logger,
      tribeSlug: TRIBE_SLUG,
      viewerId: "member-1",
    });

    // The streak has not counted the running occurrence yet, so the deadline
    // must be exactly its end instead of a later one.
    expect(fragment).toEqual({
      attendanceStreak: { attendedCount: 3, occurrenceCount: 3 },
      attendanceStreakNextRefreshAt: RUNNING_OCCURRENCE_END,
    });
    expect(listViewerAttendanceHistory).toHaveBeenCalledWith(
      expect.objectContaining({ rangeEnd: BEFORE_RUNNING_OCCURRENCE_END.toISOString() })
    );
    expect(tribeEventRepository.listByTribeRange).toHaveBeenCalledWith(
      expect.objectContaining({ rangeStart: BEFORE_RUNNING_OCCURRENCE_END.toISOString() })
    );
    expect(logger.error).not.toHaveBeenCalled();
  });
});
