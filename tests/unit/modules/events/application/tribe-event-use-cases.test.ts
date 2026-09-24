import { vi, describe, it, expect, afterEach } from "vitest";
import {
  createTribeEvent,
  deleteTribeEvent,
  getTribeEvent,
  listTribeEvents,
  updateTribeEvent,
} from "@/src/modules/events/application/use-cases/manage-tribe-events-use-cases";
import { listUpcomingTribeEvents } from "@/src/modules/events/application/use-cases/list-upcoming-tribe-events-use-case";
import { TRIBE_EVENT_MUTATION_STATUS } from "@/src/modules/events/constants/tribe-events";
import type { TribeEvent } from "@/src/modules/events/domain/entities/tribe-event";
import type { TribeEventRepository } from "@/src/modules/events/domain/repositories/tribe-event-repository";

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
    readViewerAttendanceStreakSnapshot: vi.fn(),
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
    viewerPermissions: { canManageEvents },
  };
}

describe("tribe event use cases", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("lists the occurrences of the requested Buenos Aires month", async () => {
    const listByTribeRange = vi.fn(async () => createListing([createEvent()]));
    const execute = listTribeEvents({
      tribeEventRepository: createRepository({ listByTribeRange }),
    });

    await expect(
      execute({
        month: "2026-05",
        tribeSlug: " matematica-pro ",
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
          occurrenceKey: `${EVENT_ID}@2026-05-06T18:00:00.000Z`,
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
      selectedOccurrenceKey: null,
      viewerPermissions: { canManageEvents: true },
    });
    expect(listByTribeRange).toHaveBeenCalledWith({
      rangeEnd: "2026-06-01T03:00:00.000Z",
      rangeStart: "2026-05-01T03:00:00.000Z",
      tribeSlug: "matematica-pro",
    });
  });

  it("files a workshop that crosses midnight between months under the month where it starts", async () => {
    // 22:00 on May 31st to 02:00 on June 1st, Buenos Aires time.
    const crossMonthWorkshop = createEvent({
      endsAt: "2026-06-01T05:00:00.000Z",
      startsAt: "2026-06-01T01:00:00.000Z",
      title: "Taller de cierre",
    });
    const listByTribeRange = vi.fn(async () => createListing([crossMonthWorkshop]));
    const execute = listTribeEvents({
      tribeEventRepository: createRepository({ listByTribeRange }),
    });

    const may = await execute({ month: "2026-05", tribeSlug: "matematica-pro" });
    const june = await execute({ month: "2026-06", tribeSlug: "matematica-pro" });

    expect(may.events.map((occurrence) => occurrence.title)).toEqual(["Taller de cierre"]);
    expect(june.events).toEqual([]);
  });

  it("resolves the month of a deep-linked occurrence when no month is given", async () => {
    const lateNightStart = "2026-07-01T02:00:00.000Z";
    const listByTribeRange = vi.fn(async () =>
      createListing([createEvent({ endsAt: null, startsAt: lateNightStart })])
    );
    const execute = listTribeEvents({
      tribeEventRepository: createRepository({ listByTribeRange }),
    });

    const result = await execute({
      occurrenceKey: `${EVENT_ID}@${lateNightStart}`,
      tribeSlug: "matematica-pro",
    });

    // 02:00 UTC on July 1st is still June 30th in Buenos Aires.
    expect(result.month.current).toBe("2026-06");
    expect(result.selectedOccurrenceKey).toBe(`${EVENT_ID}@${lateNightStart}`);
  });

  it("keeps the explicit month and drops a deep link that is not in it", async () => {
    const listByTribeRange = vi.fn(async () => createListing([createEvent()]));
    const execute = listTribeEvents({
      tribeEventRepository: createRepository({ listByTribeRange }),
    });

    const result = await execute({
      month: "2026-05",
      occurrenceKey: `${EVENT_ID}@2026-06-10T18:00:00.000Z`,
      tribeSlug: "matematica-pro",
    });

    expect(result.month.current).toBe("2026-05");
    expect(result.selectedOccurrenceKey).toBeNull();
  });

  it("ignores malformed deep links", async () => {
    vi.useFakeTimers().setSystemTime(new Date("2026-05-06T12:00:00.000Z"));
    const listByTribeRange = vi.fn(async () => createListing([createEvent()]));
    const execute = listTribeEvents({
      tribeEventRepository: createRepository({ listByTribeRange }),
    });

    for (const occurrenceKey of [
      "not-a-key",
      "not-a-uuid@2026-05-06T18:00:00.000Z",
      `${EVENT_ID}@2026-13-45`,
      `${EVENT_ID}@2026-05-06`,
      [`${EVENT_ID}@yesterday`],
    ]) {
      const result = await execute({ occurrenceKey, tribeSlug: "matematica-pro" });

      expect(result.month.current).toBe("2026-05");
      expect(result.selectedOccurrenceKey).toBeNull();
    }
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
      viewerPermissions: { canManageEvents: false },
    }));
    const execute = listTribeEvents({
      tribeEventRepository: createRepository({ listByTribeRange }),
    });

    const result = await execute({ month: "2026-05", tribeSlug: "matematica-pro" });

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

  it("uses the first month value when the route receives repeated month params", async () => {
    const listByTribeRange = vi.fn(async () => createListing([], false));
    const execute = listTribeEvents({
      tribeEventRepository: createRepository({ listByTribeRange }),
    });

    await expect(
      execute({
        month: ["2026-05", "2026-06"],
        tribeSlug: "matematica-pro",
      })
    ).resolves.toMatchObject({
      month: {
        current: "2026-05",
        next: "2026-06",
        previous: "2026-04",
      },
    });
  });

  it("falls back to a valid month when the query month is invalid", async () => {
    const listByTribeRange = vi.fn(async () => createListing([], false));
    const execute = listTribeEvents({
      tribeEventRepository: createRepository({ listByTribeRange }),
    });

    await expect(
      execute({
        month: "not-a-month",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toMatchObject({
      month: {
        current: expect.stringMatching(/^\d{4}-\d{2}$/),
      },
    });
    expect(listByTribeRange).toHaveBeenCalledWith(
      expect.objectContaining({
        rangeEnd: expect.stringMatching(/^\d{4}-\d{2}-01T03:00:00\.000Z$/),
        rangeStart: expect.stringMatching(/^\d{4}-\d{2}-01T03:00:00\.000Z$/),
      })
    );
  });

  it("falls back to the current Buenos Aires month when month is missing", async () => {
    vi.useFakeTimers().setSystemTime(new Date("2026-05-06T02:30:00.000Z"));
    const listByTribeRange = vi.fn(async () => createListing([], false));
    const execute = listTribeEvents({
      tribeEventRepository: createRepository({ listByTribeRange }),
    });

    await expect(execute({ tribeSlug: "matematica-pro" })).resolves.toMatchObject({
      month: {
        current: "2026-05",
        next: "2026-06",
        previous: "2026-04",
      },
    });
  });

  it("creates an event with normalized fields and returns the visible month occurrences", async () => {
    const create = vi.fn(async () => ({
      event: createEvent(),
      status: TRIBE_EVENT_MUTATION_STATUS.created,
    }));
    const execute = createTribeEvent({
      tribeEventRepository: createRepository({ create }),
    });

    const result = await execute({
      description: "  Repaso mensual  ",
      endsAt: "2026-05-06T19:00:00.000Z",
      meetingUrl: " https://meet.google.com/abc-defg-hij ",
      recurrenceFrequency: "",
      recurrenceUntil: "",
      startsAt: "2026-05-06T18:00:00.000Z",
      title: " Clase abierta ",
      tribeSlug: " matematica-pro ",
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
      tribeEventRepository: createRepository({ create }),
    });

    await expect(
      execute({
        description: "",
        endsAt: "",
        meetingUrl: "",
        recurrenceFrequency: "none",
        recurrenceUntil: "",
        startsAt: "2026-05-06T18:00:00.000Z",
        title: "Clase abierta",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toMatchObject({ occurrences: [] });
  });

  it("stores weekly series with the until date normalized to an instant", async () => {
    const create = vi.fn(async () => ({
      event: createEvent({
        recurrenceFrequency: "weekly",
        recurrenceUntil: "2026-06-30T02:59:00.000Z",
      }),
      status: TRIBE_EVENT_MUTATION_STATUS.created,
    }));
    const execute = createTribeEvent({
      tribeEventRepository: createRepository({ create }),
    });

    const result = await execute({
      description: "",
      endsAt: "",
      meetingUrl: "",
      recurrenceFrequency: "weekly",
      recurrenceUntil: "2026-06-30T02:59:00.000Z",
      startsAt: "2026-05-06T18:00:00.000Z",
      title: "Clase abierta",
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

  it("rejects unknown recurrence frequencies and until dates before the start", async () => {
    const create = vi.fn();
    const execute = createTribeEvent({
      tribeEventRepository: createRepository({ create }),
    });
    const baseCommand = {
      description: "",
      endsAt: "",
      meetingUrl: "",
      startsAt: "2026-05-06T18:00:00.000Z",
      title: "Clase abierta",
      tribeSlug: "matematica-pro",
    };

    await expect(
      execute({ ...baseCommand, recurrenceFrequency: "daily", recurrenceUntil: "" })
    ).resolves.toEqual({ status: TRIBE_EVENT_MUTATION_STATUS.invalidRecurrence });
    await expect(
      execute({
        ...baseCommand,
        recurrenceFrequency: "weekly",
        recurrenceUntil: "2026-05-01T00:00:00.000Z",
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
      tribeEventRepository: createRepository({ create }),
    });

    await execute({
      description: "",
      endsAt: "",
      meetingUrl: "",
      recurrenceFrequency: "none",
      recurrenceUntil: "2026-01-01T00:00:00.000Z",
      startsAt: "2026-05-06T18:00:00.000Z",
      title: "Clase abierta",
      tribeSlug: "matematica-pro",
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ recurrenceFrequency: "none", recurrenceUntil: null })
    );
  });

  it("rejects empty titles and oversized descriptions before calling the repository", async () => {
    const create = vi.fn();
    const execute = createTribeEvent({
      tribeEventRepository: createRepository({ create }),
    });
    const baseCommand = {
      endsAt: "",
      meetingUrl: "",
      recurrenceFrequency: "",
      recurrenceUntil: "",
      startsAt: "2026-05-06T18:00:00.000Z",
      tribeSlug: "matematica-pro",
    };

    await expect(
      execute({ ...baseCommand, description: "", title: "   " })
    ).resolves.toEqual({ status: TRIBE_EVENT_MUTATION_STATUS.invalidInput });
    await expect(
      execute({ ...baseCommand, description: "x".repeat(2001), title: "Clase" })
    ).resolves.toEqual({ status: TRIBE_EVENT_MUTATION_STATUS.invalidInput });
    expect(create).not.toHaveBeenCalled();
  });

  it("stores a whole positive capacity and treats an empty one as unlimited", async () => {
    const create = vi.fn(async () => ({
      event: createEvent({ capacity: 25 }),
      status: TRIBE_EVENT_MUTATION_STATUS.created,
    }));
    const execute = createTribeEvent({
      tribeEventRepository: createRepository({ create }),
    });
    const baseCommand = {
      description: "",
      endsAt: "",
      meetingUrl: "",
      recurrenceFrequency: "",
      recurrenceUntil: "",
      startsAt: "2026-05-06T18:00:00.000Z",
      title: "Clase",
      tribeSlug: "matematica-pro",
    };

    await execute({ ...baseCommand, capacity: " 25 " });
    await execute({ ...baseCommand, capacity: "" });
    await execute(baseCommand);

    expect(create.mock.calls.map((call) => ((call as unknown[])[0] as { capacity: unknown }).capacity)).toEqual([
      25,
      null,
      null,
    ]);
  });

  it("rejects capacities that are not whole numbers between 1 and 10000", async () => {
    const create = vi.fn();
    const execute = createTribeEvent({
      tribeEventRepository: createRepository({ create }),
    });
    const baseCommand = {
      description: "",
      endsAt: "",
      meetingUrl: "",
      recurrenceFrequency: "",
      recurrenceUntil: "",
      startsAt: "2026-05-06T18:00:00.000Z",
      title: "Clase",
      tribeSlug: "matematica-pro",
    };

    for (const capacity of ["0", "-3", "2.5", "1e3", "10001", "diez"]) {
      await expect(execute({ ...baseCommand, capacity })).resolves.toEqual({
        status: TRIBE_EVENT_MUTATION_STATUS.invalidCapacity,
      });
    }

    expect(create).not.toHaveBeenCalled();
  });

  it("rejects meeting links that are not http or https URLs", async () => {
    const create = vi.fn();
    const execute = createTribeEvent({
      tribeEventRepository: createRepository({ create }),
    });

    await expect(
      execute({
        description: "",
        endsAt: "",
        meetingUrl: "ftp://meet.example.com/event",
        recurrenceFrequency: "",
        recurrenceUntil: "",
        startsAt: "2026-05-06T18:00:00.000Z",
        title: "Clase abierta",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({ status: TRIBE_EVENT_MUTATION_STATUS.invalidMeetingUrl });
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects end dates that are not after the start date", async () => {
    const update = vi.fn();
    const execute = updateTribeEvent({
      tribeEventRepository: createRepository({ update }),
    });

    await expect(
      execute({
        description: "",
        endsAt: "2026-05-06T17:00:00.000Z",
        eventId: ` ${EVENT_ID} `,
        meetingUrl: "",
        recurrenceFrequency: "",
        recurrenceUntil: "",
        startsAt: "2026-05-06T18:00:00.000Z",
        title: "Clase abierta",
        tribeSlug: " matematica-pro ",
      })
    ).resolves.toEqual({ status: TRIBE_EVENT_MUTATION_STATUS.invalidDate });
    expect(update).not.toHaveBeenCalled();
  });

  it("updates an event and returns the visible month occurrences", async () => {
    const update = vi.fn(async () => ({
      attendances: [],
      event: createEvent({ title: "Clase cerrada" }),
      status: TRIBE_EVENT_MUTATION_STATUS.updated,
    }));
    const execute = updateTribeEvent({
      tribeEventRepository: createRepository({ update }),
    });

    await expect(
      execute({
        description: "",
        endsAt: "",
        eventId: EVENT_ID,
        meetingUrl: "",
        recurrenceFrequency: "",
        recurrenceUntil: "",
        startsAt: "2026-05-06T18:00:00.000Z",
        title: "Clase cerrada",
        tribeSlug: "matematica-pro",
        visibleMonth: "2026-05",
      })
    ).resolves.toMatchObject({
      event: { title: "Clase cerrada" },
      occurrences: [expect.objectContaining({ title: "Clase cerrada" })],
      status: TRIBE_EVENT_MUTATION_STATUS.updated,
    });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ eventId: EVENT_ID }));
  });

  it("keeps the stored capacity when the update omits it and clears or sets it when explicit", async () => {
    const update = vi.fn(async () => ({
      attendances: [],
      event: createEvent({ capacity: 10 }),
      status: TRIBE_EVENT_MUTATION_STATUS.updated,
    }));
    const execute = updateTribeEvent({
      tribeEventRepository: createRepository({ update }),
    });
    const baseCommand = {
      description: "",
      endsAt: "",
      eventId: EVENT_ID,
      meetingUrl: "",
      recurrenceFrequency: "",
      recurrenceUntil: "",
      startsAt: "2026-05-06T18:00:00.000Z",
      title: "Clase abierta",
      tribeSlug: "matematica-pro",
    };

    // A legacy body without the field must not remove the existing limit.
    await execute(baseCommand);
    await execute({ ...baseCommand, capacity: "" });
    await execute({ ...baseCommand, capacity: " 15 " });

    expect(
      update.mock.calls.map((call) => ((call as unknown[])[0] as { capacity: unknown }).capacity)
    ).toEqual([
      { kind: "unchanged" },
      { capacity: null, kind: "set" },
      { capacity: 15, kind: "set" },
    ]);
  });

  it("rejects an invalid explicit capacity on update before calling the repository", async () => {
    const update = vi.fn();
    const execute = updateTribeEvent({
      tribeEventRepository: createRepository({ update }),
    });

    await expect(
      execute({
        capacity: "0",
        description: "",
        endsAt: "",
        eventId: EVENT_ID,
        meetingUrl: "",
        recurrenceFrequency: "",
        recurrenceUntil: "",
        startsAt: "2026-05-06T18:00:00.000Z",
        title: "Clase abierta",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({ status: TRIBE_EVENT_MUTATION_STATUS.invalidCapacity });
    expect(update).not.toHaveBeenCalled();
  });

  it("returns the visible month occurrences with the summaries read after the waitlist refill", async () => {
    const promotedAttendance = {
      ...EMPTY_ATTENDANCE,
      goingCount: 2,
      viewerStatus: "going" as const,
    };
    const update = vi.fn(async () => ({
      attendances: [
        {
          ...promotedAttendance,
          eventId: EVENT_ID,
          occurrenceStartsAt: "2026-05-13T18:00:00.000Z",
        },
      ],
      event: createEvent({ capacity: 2, recurrenceFrequency: "weekly" }),
      status: TRIBE_EVENT_MUTATION_STATUS.updated,
    }));
    const execute = updateTribeEvent({
      tribeEventRepository: createRepository({ update }),
    });

    const result = await execute({
      capacity: "2",
      description: "",
      endsAt: "",
      eventId: EVENT_ID,
      meetingUrl: "",
      recurrenceFrequency: "weekly",
      recurrenceUntil: "",
      startsAt: "2026-05-06T18:00:00.000Z",
      title: "Clase abierta",
      tribeSlug: "matematica-pro",
      visibleMonth: "2026-05",
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        attendanceRange: {
          rangeEnd: "2026-06-01T03:00:00.000Z",
          rangeStart: "2026-05-01T03:00:00.000Z",
        },
      })
    );
    expect(result).toMatchObject({ status: TRIBE_EVENT_MUTATION_STATUS.updated });
    const occurrences = "occurrences" in result ? result.occurrences : [];
    expect(
      occurrences.map((occurrence) => [occurrence.startsAt, occurrence.attendance])
    ).toEqual([
      ["2026-05-06T18:00:00.000Z", EMPTY_ATTENDANCE],
      ["2026-05-13T18:00:00.000Z", promotedAttendance],
      ["2026-05-20T18:00:00.000Z", EMPTY_ATTENDANCE],
      ["2026-05-27T18:00:00.000Z", EMPTY_ATTENDANCE],
    ]);
  });

  it("does not read attendance summaries when the visible month is missing", async () => {
    const update = vi.fn(async () => ({
      attendances: [],
      event: createEvent(),
      status: TRIBE_EVENT_MUTATION_STATUS.updated,
    }));

    await expect(
      updateTribeEvent({ tribeEventRepository: createRepository({ update }) })({
        description: "",
        endsAt: "",
        eventId: EVENT_ID,
        meetingUrl: "",
        recurrenceFrequency: "",
        recurrenceUntil: "",
        startsAt: "2026-05-06T18:00:00.000Z",
        title: "Clase abierta",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toMatchObject({ occurrences: [] });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ attendanceRange: null }));
  });

  it("treats malformed event ids as not found without querying", async () => {
    const repository = createRepository();

    await expect(
      updateTribeEvent({ tribeEventRepository: repository })({
        description: "",
        endsAt: "",
        eventId: "not-a-uuid",
        meetingUrl: "",
        recurrenceFrequency: "",
        recurrenceUntil: "",
        startsAt: "2026-05-06T18:00:00.000Z",
        title: "Clase abierta",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({ status: TRIBE_EVENT_MUTATION_STATUS.notFound });
    await expect(
      deleteTribeEvent({ tribeEventRepository: repository })({
        eventId: "not-a-uuid",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({ status: TRIBE_EVENT_MUTATION_STATUS.notFound });
    await expect(
      getTribeEvent({ tribeEventRepository: repository })({
        eventId: "not-a-uuid",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toBeNull();
    expect(repository.update).not.toHaveBeenCalled();
    expect(repository.delete).not.toHaveBeenCalled();
    expect(repository.findById).not.toHaveBeenCalled();
  });

  it("passes normalized identifiers when deleting an event", async () => {
    const deleteEvent = vi.fn(async () => ({
      status: TRIBE_EVENT_MUTATION_STATUS.deleted,
    }));
    const execute = deleteTribeEvent({
      tribeEventRepository: createRepository({ delete: deleteEvent }),
    });

    await expect(
      execute({
        eventId: ` ${EVENT_ID} `,
        tribeSlug: " matematica-pro ",
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
      rangeStart: "2026-05-10T12:00:00.000Z",
      tribeSlug: "matematica-pro",
    });
  });

  it("keeps a cross-day workshop that started hours ago while its explicit end is ahead", async () => {
    vi.useFakeTimers().setSystemTime(new Date("2026-05-10T22:00:00.000Z"));
    const listByTribeRange = vi.fn(async () =>
      createListing([
        createEvent({
          endsAt: "2026-05-11T02:00:00.000Z",
          startsAt: "2026-05-10T15:00:00.000Z",
          title: "Taller intensivo",
        }),
        createEvent({
          endsAt: "2026-05-10T21:00:00.000Z",
          id: OTHER_EVENT_ID,
          startsAt: "2026-05-10T14:00:00.000Z",
          title: "Terminado",
        }),
      ])
    );
    const execute = listUpcomingTribeEvents({
      tribeEventRepository: createRepository({ listByTribeRange }),
    });

    const result = await execute({ tribeSlug: "matematica-pro" });

    expect(result.events.map((occurrence) => occurrence.title)).toEqual([
      "Taller intensivo",
    ]);
    expect(listByTribeRange).toHaveBeenCalledWith(
      expect.objectContaining({ rangeStart: "2026-05-10T22:00:00.000Z" })
    );
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
