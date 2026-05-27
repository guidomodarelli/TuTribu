import {
  createTribeEvent,
  deleteTribeEvent,
  listTribeEvents,
  updateTribeEvent,
} from "@/src/modules/events/application/use-cases/manage-tribe-events-use-cases";
import { TRIBE_EVENT_MUTATION_STATUS } from "@/src/modules/events/constants/tribe-events";
import type { TribeEventRepository } from "@/src/modules/events/domain/repositories/tribe-event-repository";

function createRepository(overrides: Partial<TribeEventRepository> = {}) {
  return {
    create: jest.fn(),
    delete: jest.fn(),
    listByTribeMonth: jest.fn(),
    update: jest.fn(),
    ...overrides,
  } satisfies TribeEventRepository;
}

describe("tribe event use cases", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  const event = {
    id: "event-1",
    title: "Clase abierta",
    description: "Repaso mensual",
    meetingUrl: "https://meet.google.com/abc-defg-hij",
    startsAt: "2026-05-06T18:00:00.000Z",
    endsAt: "2026-05-06T19:00:00.000Z",
  };

  it("lists events for the requested Buenos Aires month", async () => {
    const listByTribeMonth = jest.fn(async () => ({
      events: [event],
      viewerPermissions: {
        canManageEvents: true,
      },
    }));
    const execute = listTribeEvents({
      tribeEventRepository: createRepository({ listByTribeMonth }),
    });

    await expect(
      execute({
        month: "2026-05",
        tribeSlug: " matematica-pro ",
      })
    ).resolves.toEqual({
      events: [event],
      month: {
        current: "2026-05",
        next: "2026-06",
        previous: "2026-04",
      },
      viewerPermissions: {
        canManageEvents: true,
      },
    });
    expect(listByTribeMonth).toHaveBeenCalledWith({
      monthEnd: "2026-06-01T03:00:00.000Z",
      monthStart: "2026-05-01T03:00:00.000Z",
      tribeSlug: "matematica-pro",
    });
  });

  it("uses the first month value when the route receives repeated month params", async () => {
    const listByTribeMonth = jest.fn(async () => ({
      events: [],
      viewerPermissions: {
        canManageEvents: false,
      },
    }));
    const execute = listTribeEvents({
      tribeEventRepository: createRepository({ listByTribeMonth }),
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
    const listByTribeMonth = jest.fn(async () => ({
      events: [],
      viewerPermissions: {
        canManageEvents: false,
      },
    }));
    const execute = listTribeEvents({
      tribeEventRepository: createRepository({ listByTribeMonth }),
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
    expect(listByTribeMonth).toHaveBeenCalledWith(
      expect.objectContaining({
        monthEnd: expect.stringMatching(/^\d{4}-\d{2}-01T03:00:00\.000Z$/),
        monthStart: expect.stringMatching(/^\d{4}-\d{2}-01T03:00:00\.000Z$/),
      })
    );
  });

  it("falls back to the current Buenos Aires month without Intl parsing when month is missing", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-05-06T02:30:00.000Z"));
    const listByTribeMonth = jest.fn(async () => ({
      events: [],
      viewerPermissions: {
        canManageEvents: false,
      },
    }));
    const execute = listTribeEvents({
      tribeEventRepository: createRepository({ listByTribeMonth }),
    });

    await expect(
      execute({
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

  it("creates an event with normalized optional fields", async () => {
    const create = jest.fn(async () => ({
      event,
      status: TRIBE_EVENT_MUTATION_STATUS.created,
    }));
    const execute = createTribeEvent({
      tribeEventRepository: createRepository({ create }),
    });

    await expect(
      execute({
        description: "  Repaso mensual  ",
        endsAt: "2026-05-06T19:00:00.000Z",
        meetingUrl: " https://meet.google.com/abc-defg-hij ",
        startsAt: "2026-05-06T18:00:00.000Z",
        title: " Clase abierta ",
        tribeSlug: " matematica-pro ",
      })
    ).resolves.toEqual({
      event,
      status: TRIBE_EVENT_MUTATION_STATUS.created,
    });
    expect(create).toHaveBeenCalledWith({
      description: "Repaso mensual",
      endsAt: "2026-05-06T19:00:00.000Z",
      meetingUrl: "https://meet.google.com/abc-defg-hij",
      startsAt: "2026-05-06T18:00:00.000Z",
      title: "Clase abierta",
      tribeSlug: "matematica-pro",
    });
  });

  it("rejects empty titles before calling the repository", async () => {
    const create = jest.fn();
    const execute = createTribeEvent({
      tribeEventRepository: createRepository({ create }),
    });

    await expect(
      execute({
        description: "",
        endsAt: "",
        meetingUrl: "",
        startsAt: "2026-05-06T18:00:00.000Z",
        title: "   ",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({ status: TRIBE_EVENT_MUTATION_STATUS.invalidInput });
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects meeting links that are not http or https URLs", async () => {
    const create = jest.fn();
    const execute = createTribeEvent({
      tribeEventRepository: createRepository({ create }),
    });

    await expect(
      execute({
        description: "",
        endsAt: "",
        meetingUrl: "ftp://meet.example.com/event",
        startsAt: "2026-05-06T18:00:00.000Z",
        title: "Clase abierta",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({ status: TRIBE_EVENT_MUTATION_STATUS.invalidMeetingUrl });
    expect(create).not.toHaveBeenCalled();
  });

  it("prioritizes required event fields before meeting link validation", async () => {
    const create = jest.fn();
    const execute = createTribeEvent({
      tribeEventRepository: createRepository({ create }),
    });

    await expect(
      execute({
        description: "",
        endsAt: "",
        meetingUrl: "ftp://meet.example.com/event",
        startsAt: "2026-05-06T18:00:00.000Z",
        title: "   ",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({ status: TRIBE_EVENT_MUTATION_STATUS.invalidInput });
    expect(create).not.toHaveBeenCalled();
  });

  it("accepts Zoom meeting links through the shared meeting URL rules", async () => {
    const create = jest.fn(async () => ({
      event: {
        ...event,
        meetingUrl: "https://zoom.us/j/123456789",
      },
      status: TRIBE_EVENT_MUTATION_STATUS.created,
    }));
    const execute = createTribeEvent({
      tribeEventRepository: createRepository({ create }),
    });

    await expect(
      execute({
        description: "",
        endsAt: "",
        meetingUrl: " https://zoom.us/j/123456789 ",
        startsAt: "2026-05-06T18:00:00.000Z",
        title: "Clase abierta",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toMatchObject({
      event: {
        meetingUrl: "https://zoom.us/j/123456789",
      },
      status: TRIBE_EVENT_MUTATION_STATUS.created,
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        meetingUrl: "https://zoom.us/j/123456789",
      })
    );
  });

  it("rejects end dates that are not after the start date", async () => {
    const update = jest.fn();
    const execute = updateTribeEvent({
      tribeEventRepository: createRepository({ update }),
    });

    await expect(
      execute({
        description: "",
        endsAt: "2026-05-06T17:00:00.000Z",
        eventId: " event-1 ",
        meetingUrl: "",
        startsAt: "2026-05-06T18:00:00.000Z",
        title: "Clase abierta",
        tribeSlug: " matematica-pro ",
      })
    ).resolves.toEqual({ status: TRIBE_EVENT_MUTATION_STATUS.invalidDate });
    expect(update).not.toHaveBeenCalled();
  });

  it("passes normalized identifiers when deleting an event", async () => {
    const deleteEvent = jest.fn(async () => ({
      status: TRIBE_EVENT_MUTATION_STATUS.deleted,
    }));
    const execute = deleteTribeEvent({
      tribeEventRepository: createRepository({ delete: deleteEvent }),
    });

    await expect(
      execute({
        eventId: " event-1 ",
        tribeSlug: " matematica-pro ",
      })
    ).resolves.toEqual({ status: TRIBE_EVENT_MUTATION_STATUS.deleted });
    expect(deleteEvent).toHaveBeenCalledWith({
      eventId: "event-1",
      tribeSlug: "matematica-pro",
    });
  });
});
