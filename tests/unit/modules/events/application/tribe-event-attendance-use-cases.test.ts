import {
  clearTribeEventAttendance,
  setTribeEventAttendance,
} from "@/src/modules/events/application/use-cases/tribe-event-attendance-use-cases";
import { TRIBE_EVENT_MUTATION_STATUS } from "@/src/modules/events/constants/tribe-events";
import type { TribeEvent } from "@/src/modules/events/domain/entities/tribe-event";
import type { TribeEventRepository } from "@/src/modules/events/domain/repositories/tribe-event-repository";

const EVENT_ID = "6f3c7a1e-2b4d-4c8e-9f10-1a2b3c4d5e6f";

const weeklyEvent: TribeEvent = {
  description: null,
  endsAt: "2026-05-06T19:00:00.000Z",
  id: EVENT_ID,
  meetingUrl: null,
  recurrenceFrequency: "weekly",
  recurrenceUntil: null,
  startsAt: "2026-05-06T18:00:00.000Z",
  title: "Clase abierta",
};

function createRepository(overrides: Partial<TribeEventRepository> = {}) {
  return {
    clearAttendance: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
    findById: jest.fn(async () => weeklyEvent),
    listByTribeRange: jest.fn(),
    setAttendance: jest.fn(async () => ({
      attendance: { goingCount: 3, viewerStatus: "going" as const },
      status: TRIBE_EVENT_MUTATION_STATUS.attendanceSaved,
    })),
    update: jest.fn(),
    ...overrides,
  } satisfies TribeEventRepository;
}

describe("tribe event attendance use cases", () => {
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
      attendance: { goingCount: 3, viewerStatus: "going" },
      status: TRIBE_EVENT_MUTATION_STATUS.attendanceSaved,
    });
    expect(repository.setAttendance).toHaveBeenCalledWith({
      eventId: EVENT_ID,
      occurrenceStartsAt: "2026-05-13T18:00:00.000Z",
      status: "going",
      tribeSlug: "matematica-pro",
    });
  });

  it("rejects answers that are not going or not_going", async () => {
    const repository = createRepository();
    const execute = setTribeEventAttendance({ tribeEventRepository: repository });

    await expect(
      execute({
        eventId: EVENT_ID,
        occurrenceStartsAt: "2026-05-13T18:00:00.000Z",
        status: "maybe",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({ status: TRIBE_EVENT_MUTATION_STATUS.invalidAttendance });
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
    const repository = createRepository({ findById: jest.fn(async () => null) });
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
      clearAttendance: jest.fn(async () => ({
        attendance: { goingCount: 2, viewerStatus: null },
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
      attendance: { goingCount: 2, viewerStatus: null },
      status: TRIBE_EVENT_MUTATION_STATUS.attendanceCleared,
    });
    expect(repository.clearAttendance).toHaveBeenCalledWith({
      eventId: EVENT_ID,
      occurrenceStartsAt: "2026-05-13T18:00:00.000Z",
      tribeSlug: "matematica-pro",
    });
  });
});
