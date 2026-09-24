import { vi, describe, it, expect, afterEach } from "vitest";
import {
  createTribeEvent,
  deleteTribeEvent,
  getTribeEvent,
  listTribeEvents,
  updateTribeEvent,
} from "@/src/modules/events/application/use-cases/manage-tribe-events-use-cases";
import { listUpcomingTribeEvents } from "@/src/modules/events/application/use-cases/list-upcoming-tribe-events-use-case";
import type { TribeEventFieldsInput } from "@/src/modules/events/application/commands/tribe-event-command";
import { TRIBE_EVENT_MUTATION_STATUS } from "@/src/modules/events/constants/tribe-events";
import type { TribeEvent } from "@/src/modules/events/domain/entities/tribe-event";
import type { TribeEventRepository } from "@/src/modules/events/domain/repositories/tribe-event-repository";
import { createTribeEventExceptionRepositoryDouble } from "../support/tribe-event-repository-doubles";

const EVENT_ID = "6f3c7a1e-2b4d-4c8e-9f10-1a2b3c4d5e6f";
const OTHER_EVENT_ID = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";

function createRepository(overrides: Partial<TribeEventRepository> = {}) {
  return {
    clearAttendance: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    findById: vi.fn(),
    getOccurrenceAttendanceReport: vi.fn(),
    listByTribeRange: vi.fn(),
    listEventOccurrences: vi.fn(async () => ({ attendances: [], event: null, exceptions: [] })),
    listViewerAttendanceHistory: vi.fn(),
    setAttendance: vi.fn(),
    update: vi.fn(),
    ...overrides,
  } satisfies TribeEventRepository;
}

const EMPTY_ATTENDANCE = {
  goingCount: 0,
  goingPreview: [],
  maybeCount: 0,
  viewerStatus: null,
  viewerWaitlistPosition: null,
  waitlistedCount: 0,
};

function createEvent(overrides: Partial<TribeEvent> = {}): TribeEvent {
  return {
    capacity: null,
    description: "Repaso mensual",
    eventType: "live",
    endsAt: "2026-05-06T19:00:00.000Z",
    id: EVENT_ID,
    meetingUrl: "https://meet.google.com/abc-defg-hij",
    recurrenceFrequency: "none",
    recurrenceUntil: null,
    startsAt: "2026-05-06T18:00:00.000Z",
    title: "Clase abierta",
    ...overrides,
  };
}

function createListing(events: TribeEvent[], canManageEvents = true) {
  return {
    attendances: [],
    events,
    exceptions: [],
    pendingProposalCount: 0,
    recordedOccurrences: [],
    viewerPermissions: { canManageEvents, canProposeEvents: false },
  };
}

/**
 * Fields as the route input schema hands them to the use cases: trimmed text,
 * canonical instants, null optionals, and a known frequency.
 */
function createFields(overrides: Partial<TribeEventFieldsInput> = {}): TribeEventFieldsInput {
  return {
    capacity: null,
    description: null,
    endsAt: null,
    eventType: "live",
    meetingUrl: null,
    recurrenceFrequency: "none",
    recurrenceUntil: null,
    startsAt: "2026-05-06T18:00:00.000Z",
    title: "Clase abierta",
    ...overrides,
  };
}

describe("tribe event use cases", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("flags only the listed occurrences that have a recording", async () => {
    const event = createEvent();
    const listByTribeRange = vi.fn(async () => ({
      ...createListing([event]),
      recordedOccurrences: [
        { eventId: event.id, originalStartsAt: "2026-05-06T18:00:00+00:00" },
        { eventId: "3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f", originalStartsAt: "2026-05-07T18:00:00.000Z" },
      ],
    }));
    const execute = listTribeEvents({
      tribeEventOccurrenceExceptionRepository: createTribeEventExceptionRepositoryDouble(),
      tribeEventRepository: createRepository({ listByTribeRange }),
    });

    const result = await execute({
      eventTypes: [],
      month: "2026-05",
      occurrence: null,
      tribeSlug: "matematica-pro",
    });

    expect(result.recordedOccurrenceKeys).toEqual([`${event.id}@2026-05-06T18:00:00.000Z`]);
  });

  it("lists the occurrences of the requested Buenos Aires month", async () => {
    const listByTribeRange = vi.fn(async () => createListing([createEvent()]));
    const execute = listTribeEvents({
      tribeEventOccurrenceExceptionRepository: createTribeEventExceptionRepositoryDouble(),
      tribeEventRepository: createRepository({ listByTribeRange }),
    });

    await expect(
      execute({
        eventTypes: [],
        month: "2026-05",
        occurrence: null,
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      events: [
        {
          attendance: EMPTY_ATTENDANCE,
          capacity: null,
          description: "Repaso mensual",
          endsAt: "2026-05-06T19:00:00.000Z",
          eventId: EVENT_ID,
          meetingUrl: "https://meet.google.com/abc-defg-hij",
          eventType: "live",
          exception: null,
          occurrenceKey: `${EVENT_ID}@2026-05-06T18:00:00.000Z`,
          originalStartsAt: "2026-05-06T18:00:00.000Z",
          recurrenceFrequency: "none",
          recurrenceRule: null,
          recurrenceUntil: null,
          seriesEndsAt: "2026-05-06T19:00:00.000Z",
          seriesStartsAt: "2026-05-06T18:00:00.000Z",
          startsAt: "2026-05-06T18:00:00.000Z",
          title: "Clase abierta",
        },
      ],
      month: {
        current: "2026-05",
        next: "2026-06",
        previous: "2026-04",
      },
      pendingProposalCount: 0,
      recordedOccurrenceKeys: [],
      selectedOccurrenceKey: null,
      viewerPermissions: { canManageEvents: true, canProposeEvents: false },
    });
    expect(listByTribeRange).toHaveBeenCalledWith({
      rangeEnd: "2026-06-01T03:00:00.000Z",
      rangeStart: "2026-05-01T03:00:00.000Z",
      tribeSlug: "matematica-pro",
    });
  });

  it("resolves the month of a deep-linked occurrence when no month is given", async () => {
    const lateNightStart = "2026-07-01T02:00:00.000Z";
    const listByTribeRange = vi.fn(async () =>
      createListing([createEvent({ endsAt: null, startsAt: lateNightStart })])
    );
    const execute = listTribeEvents({
      tribeEventOccurrenceExceptionRepository: createTribeEventExceptionRepositoryDouble(),
      tribeEventRepository: createRepository({ listByTribeRange }),
    });

    const result = await execute({
      eventTypes: [],
      month: null,
      occurrence: {
        eventId: EVENT_ID,
        key: `${EVENT_ID}@${lateNightStart}`,
        occurrenceStartsAt: lateNightStart,
      },
      tribeSlug: "matematica-pro",
    });

    // 02:00 UTC on July 1st is still June 30th in Buenos Aires.
    expect(result.month.current).toBe("2026-06");
    expect(result.selectedOccurrenceKey).toBe(`${EVENT_ID}@${lateNightStart}`);
  });

  it("keeps the explicit month and drops a deep link that is not in it", async () => {
    const listByTribeRange = vi.fn(async () => createListing([createEvent()]));
    const execute = listTribeEvents({
      tribeEventOccurrenceExceptionRepository: createTribeEventExceptionRepositoryDouble(),
      tribeEventRepository: createRepository({ listByTribeRange }),
    });

    const result = await execute({
      eventTypes: [],
      month: "2026-05",
      occurrence: {
        eventId: EVENT_ID,
        key: `${EVENT_ID}@2026-06-10T18:00:00.000Z`,
        occurrenceStartsAt: "2026-06-10T18:00:00.000Z",
      },
      tribeSlug: "matematica-pro",
    });

    expect(result.month.current).toBe("2026-05");
    expect(result.selectedOccurrenceKey).toBeNull();
  });

  it("expands recurring series into month occurrences and attaches attendance", async () => {
    const listByTribeRange = vi.fn(async () => ({
      attendances: [
        {
          ...EMPTY_ATTENDANCE,
          eventId: EVENT_ID,
          goingCount: 2,
          maybeCount: 1,
          occurrenceStartsAt: "2026-05-13T18:00:00.000Z",
          viewerStatus: "going" as const,
        },
      ],
      events: [createEvent({ recurrenceFrequency: "weekly" })],
      exceptions: [],
      pendingProposalCount: 0,
      recordedOccurrences: [],
      viewerPermissions: { canManageEvents: false, canProposeEvents: false },
    }));
    const execute = listTribeEvents({
      tribeEventOccurrenceExceptionRepository: createTribeEventExceptionRepositoryDouble(),
      tribeEventRepository: createRepository({ listByTribeRange }),
    });

    const result = await execute({
      eventTypes: [],
      month: "2026-05",
      occurrence: null,
      tribeSlug: "matematica-pro",
    });

    expect(result.events.map((occurrence) => occurrence.startsAt)).toEqual([
      "2026-05-06T18:00:00.000Z",
      "2026-05-13T18:00:00.000Z",
      "2026-05-20T18:00:00.000Z",
      "2026-05-27T18:00:00.000Z",
    ]);
    expect(result.events[1]).toMatchObject({
      attendance: { ...EMPTY_ATTENDANCE, goingCount: 2, maybeCount: 1, viewerStatus: "going" },
      endsAt: "2026-05-13T19:00:00.000Z",
      recurrenceRule: "FREQ=WEEKLY",
      seriesStartsAt: "2026-05-06T18:00:00.000Z",
    });
    expect(result.events[0]?.attendance).toEqual(EMPTY_ATTENDANCE);
  });

  it("falls back to the current Buenos Aires month when month is missing", async () => {
    vi.useFakeTimers().setSystemTime(new Date("2026-05-06T02:30:00.000Z"));
    const listByTribeRange = vi.fn(async () => createListing([], false));
    const execute = listTribeEvents({
      tribeEventOccurrenceExceptionRepository: createTribeEventExceptionRepositoryDouble(),
      tribeEventRepository: createRepository({ listByTribeRange }),
    });

    await expect(
      execute({ eventTypes: [], month: null, occurrence: null, tribeSlug: "matematica-pro" })
    ).resolves.toMatchObject({
      month: {
        current: "2026-05",
        next: "2026-06",
        previous: "2026-04",
      },
    });
  });

  it("creates an event from validated fields and returns the visible month occurrences", async () => {
    const create = vi.fn(async () => ({
      event: createEvent(),
      status: TRIBE_EVENT_MUTATION_STATUS.created,
    }));
    const execute = createTribeEvent({
      tribeEventOccurrenceExceptionRepository: createTribeEventExceptionRepositoryDouble(),
      tribeEventRepository: createRepository({ create }),
    });

    const result = await execute({
      ...createFields({
        description: "Repaso mensual",
        endsAt: "2026-05-06T19:00:00.000Z",
        meetingUrl: "https://meet.google.com/abc-defg-hij",
      }),
      tribeSlug: "matematica-pro",
      visibleMonth: "2026-05",
    });

    expect(result).toMatchObject({
      event: { id: EVENT_ID, recurrenceRule: null },
      status: TRIBE_EVENT_MUTATION_STATUS.created,
    });
    expect(result.status === TRIBE_EVENT_MUTATION_STATUS.created && result.occurrences).toEqual([
      expect.objectContaining({
        eventId: EVENT_ID,
        startsAt: "2026-05-06T18:00:00.000Z",
      }),
    ]);
    expect(create).toHaveBeenCalledWith({
      capacity: null,
      description: "Repaso mensual",
      endsAt: "2026-05-06T19:00:00.000Z",
      eventType: "live",
      meetingUrl: "https://meet.google.com/abc-defg-hij",
      recurrenceFrequency: "none",
      recurrenceUntil: null,
      startsAt: "2026-05-06T18:00:00.000Z",
      title: "Clase abierta",
      tribeSlug: "matematica-pro",
    });
  });

  it("returns no occurrences when the caller is not looking at a month", async () => {
    const create = vi.fn(async () => ({
      event: createEvent(),
      status: TRIBE_EVENT_MUTATION_STATUS.created,
    }));
    const execute = createTribeEvent({
      tribeEventOccurrenceExceptionRepository: createTribeEventExceptionRepositoryDouble(),
      tribeEventRepository: createRepository({ create }),
    });

    await expect(
      execute({ ...createFields(), tribeSlug: "matematica-pro", visibleMonth: null })
    ).resolves.toMatchObject({ occurrences: [] });
  });

  it("stores weekly series with their until instant", async () => {
    const create = vi.fn(async () => ({
      event: createEvent({
        recurrenceFrequency: "weekly",
        recurrenceUntil: "2026-06-30T02:59:00.000Z",
      }),
      status: TRIBE_EVENT_MUTATION_STATUS.created,
    }));
    const execute = createTribeEvent({
      tribeEventOccurrenceExceptionRepository: createTribeEventExceptionRepositoryDouble(),
      tribeEventRepository: createRepository({ create }),
    });

    const result = await execute({
      ...createFields({
        recurrenceFrequency: "weekly",
        recurrenceUntil: "2026-06-30T02:59:00.000Z",
      }),
      tribeSlug: "matematica-pro",
      visibleMonth: "2026-05",
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        recurrenceFrequency: "weekly",
        recurrenceUntil: "2026-06-30T02:59:00.000Z",
      })
    );
    expect(result.status === TRIBE_EVENT_MUTATION_STATUS.created && result.occurrences).toHaveLength(
      4
    );
    expect(result).toMatchObject({
      event: { recurrenceRule: "FREQ=WEEKLY;UNTIL=20260630T025900Z" },
    });
  });

  it("rejects series whose until date is before the start", async () => {
    const create = vi.fn();
    const execute = createTribeEvent({
      tribeEventOccurrenceExceptionRepository: createTribeEventExceptionRepositoryDouble(),
      tribeEventRepository: createRepository({ create }),
    });

    await expect(
      execute({
        ...createFields({
          recurrenceFrequency: "weekly",
          recurrenceUntil: "2026-05-01T00:00:00.000Z",
        }),
        tribeSlug: "matematica-pro",
        visibleMonth: null,
      })
    ).resolves.toEqual({ status: TRIBE_EVENT_MUTATION_STATUS.invalidRecurrence });
    expect(create).not.toHaveBeenCalled();
  });

  it("ignores the until date for non-recurring events", async () => {
    const create = vi.fn(async () => ({
      event: createEvent(),
      status: TRIBE_EVENT_MUTATION_STATUS.created,
    }));
    const execute = createTribeEvent({
      tribeEventOccurrenceExceptionRepository: createTribeEventExceptionRepositoryDouble(),
      tribeEventRepository: createRepository({ create }),
    });

    await execute({
      ...createFields({ recurrenceUntil: "2026-01-01T00:00:00.000Z" }),
      tribeSlug: "matematica-pro",
      visibleMonth: null,
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ recurrenceFrequency: "none", recurrenceUntil: null })
    );
  });

  it("forwards the validated capacity untouched", async () => {
    const create = vi.fn(async () => ({
      event: createEvent({ capacity: 25 }),
      status: TRIBE_EVENT_MUTATION_STATUS.created,
    }));
    const execute = createTribeEvent({
      tribeEventOccurrenceExceptionRepository: createTribeEventExceptionRepositoryDouble(),
      tribeEventRepository: createRepository({ create }),
    });

    await execute({
      ...createFields({ capacity: 25 }),
      tribeSlug: "matematica-pro",
      visibleMonth: null,
    });

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ capacity: 25 }));
  });

  it("rejects meeting links that are not http or https URLs", async () => {
    const create = vi.fn();
    const execute = createTribeEvent({
      tribeEventOccurrenceExceptionRepository: createTribeEventExceptionRepositoryDouble(),
      tribeEventRepository: createRepository({ create }),
    });

    await expect(
      execute({
        ...createFields({ meetingUrl: "ftp://meet.example.com/event" }),
        tribeSlug: "matematica-pro",
        visibleMonth: null,
      })
    ).resolves.toEqual({ status: TRIBE_EVENT_MUTATION_STATUS.invalidMeetingUrl });
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects end dates that are not after the start date", async () => {
    const update = vi.fn();
    const execute = updateTribeEvent({
      tribeEventOccurrenceExceptionRepository: createTribeEventExceptionRepositoryDouble(),
      tribeEventRepository: createRepository({ update }),
    });

    await expect(
      execute({
        ...createFields({ endsAt: "2026-05-06T17:00:00.000Z" }),
        eventId: EVENT_ID,
        tribeSlug: "matematica-pro",
        visibleMonth: null,
      })
    ).resolves.toEqual({ status: TRIBE_EVENT_MUTATION_STATUS.invalidDate });
    expect(update).not.toHaveBeenCalled();
  });

  it("updates an event and returns the visible month occurrences read after the update", async () => {
    const update = vi.fn(async () => ({
      event: createEvent({ title: "Clase cerrada" }),
      status: TRIBE_EVENT_MUTATION_STATUS.updated,
    }));
    const listEventOccurrences = vi.fn(async () => ({
      attendances: [],
      event: createEvent({ title: "Clase cerrada" }),
      exceptions: [],
    }));
    const execute = updateTribeEvent({
      tribeEventOccurrenceExceptionRepository: createTribeEventExceptionRepositoryDouble(),
      tribeEventRepository: createRepository({ listEventOccurrences, update }),
    });

    await expect(
      execute({
        ...createFields({ title: "Clase cerrada" }),
        eventId: EVENT_ID,
        tribeSlug: "matematica-pro",
        visibleMonth: "2026-05",
      })
    ).resolves.toMatchObject({
      event: { title: "Clase cerrada" },
      occurrences: [expect.objectContaining({ title: "Clase cerrada" })],
      status: TRIBE_EVENT_MUTATION_STATUS.updated,
    });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ eventId: EVENT_ID }));
    expect(listEventOccurrences).toHaveBeenCalledWith({
      eventId: EVENT_ID,
      rangeEnd: "2026-06-01T03:00:00.000Z",
      rangeStart: "2026-05-01T03:00:00.000Z",
      tribeSlug: "matematica-pro",
    });
  });

  it("forwards the not found outcome of the repository", async () => {
    const repository = createRepository({
      delete: vi.fn(async () => ({ status: TRIBE_EVENT_MUTATION_STATUS.notFound })),
      findById: vi.fn(async () => null),
      update: vi.fn(async () => ({ status: TRIBE_EVENT_MUTATION_STATUS.notFound })),
    });

    await expect(
      updateTribeEvent({
        tribeEventOccurrenceExceptionRepository: createTribeEventExceptionRepositoryDouble(),
        tribeEventRepository: repository,
      })({
        ...createFields(),
        eventId: OTHER_EVENT_ID,
        tribeSlug: "matematica-pro",
        visibleMonth: null,
      })
    ).resolves.toEqual({ status: TRIBE_EVENT_MUTATION_STATUS.notFound });
    await expect(
      deleteTribeEvent({
        tribeEventOccurrenceExceptionRepository: createTribeEventExceptionRepositoryDouble(),
        tribeEventRepository: repository,
      })({
        eventId: OTHER_EVENT_ID,
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({ status: TRIBE_EVENT_MUTATION_STATUS.notFound });
    await expect(
      getTribeEvent({
        tribeEventOccurrenceExceptionRepository: createTribeEventExceptionRepositoryDouble(),
        tribeEventRepository: repository,
      })({
        eventId: OTHER_EVENT_ID,
        tribeSlug: "matematica-pro",
      })
    ).resolves.toBeNull();
  });

  it("passes the validated identifiers when deleting an event", async () => {
    const deleteEvent = vi.fn(async () => ({
      status: TRIBE_EVENT_MUTATION_STATUS.deleted,
    }));
    const execute = deleteTribeEvent({
      tribeEventOccurrenceExceptionRepository: createTribeEventExceptionRepositoryDouble(),
      tribeEventRepository: createRepository({ delete: deleteEvent }),
    });

    await expect(
      execute({
        eventId: EVENT_ID,
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({ status: TRIBE_EVENT_MUTATION_STATUS.deleted });
    expect(deleteEvent).toHaveBeenCalledWith({
      eventId: EVENT_ID,
      tribeSlug: "matematica-pro",
    });
  });

  it("returns a single event with its recurrence rule", async () => {
    const findById = vi.fn(async () =>
      createEvent({ recurrenceFrequency: "monthly" })
    );
    const execute = getTribeEvent({
      tribeEventOccurrenceExceptionRepository: createTribeEventExceptionRepositoryDouble(),
      tribeEventRepository: createRepository({ findById }),
    });

    await expect(
      execute({ eventId: EVENT_ID, tribeSlug: "matematica-pro" })
    ).resolves.toMatchObject({
      id: EVENT_ID,
      recurrenceRule: "FREQ=MONTHLY",
    });
    expect(findById).toHaveBeenCalledWith({
      eventId: EVENT_ID,
      tribeSlug: "matematica-pro",
    });
  });

  it("lists the next occurrences across series, skipping finished ones", async () => {
    vi.useFakeTimers().setSystemTime(new Date("2026-05-10T12:00:00.000Z"));
    const listByTribeRange = vi.fn(async () =>
      createListing([
        createEvent({ recurrenceFrequency: "weekly" }),
        createEvent({
          endsAt: "2026-05-09T11:00:00.000Z",
          id: OTHER_EVENT_ID,
          startsAt: "2026-05-09T10:00:00.000Z",
          title: "Ya pasó",
        }),
        createEvent({
          endsAt: null,
          id: "9e8d7c6b-5a4f-4e3d-9c2b-1a0f9e8d7c6b",
          startsAt: "2026-05-11T10:00:00.000Z",
          title: "Mañana",
        }),
      ])
    );
    const execute = listUpcomingTribeEvents({
      tribeEventRepository: createRepository({ listByTribeRange }),
    });

    const result = await execute({ tribeSlug: "matematica-pro" });

    expect(result.events.map((occurrence) => occurrence.title)).toEqual([
      "Mañana",
      "Clase abierta",
      "Clase abierta",
    ]);
    expect(result.events[1]?.startsAt).toBe("2026-05-13T18:00:00.000Z");
    expect(listByTribeRange).toHaveBeenCalledWith({
      rangeEnd: "2026-06-09T12:00:00.000Z",
      rangeStart: "2026-05-10T06:00:00.000Z",
      tribeSlug: "matematica-pro",
    });
  });

  it("keeps an occurrence without end while it runs its default duration", async () => {
    vi.useFakeTimers().setSystemTime(new Date("2026-05-10T12:00:00.000Z"));
    const listByTribeRange = vi.fn(async () =>
      createListing([
        createEvent({
          endsAt: null,
          startsAt: "2026-05-10T11:30:00.000Z",
          title: "En curso",
        }),
        createEvent({
          endsAt: null,
          id: OTHER_EVENT_ID,
          startsAt: "2026-05-10T10:30:00.000Z",
          title: "Terminado",
        }),
      ])
    );
    const execute = listUpcomingTribeEvents({
      tribeEventRepository: createRepository({ listByTribeRange }),
    });

    const result = await execute({ tribeSlug: "matematica-pro" });

    expect(result.events.map((occurrence) => occurrence.title)).toEqual(["En curso"]);
  });
});
