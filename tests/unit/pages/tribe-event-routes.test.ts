import { GET, POST } from "@/app/api/tribes/[slug]/events/route";
import {
  DELETE,
  PATCH,
} from "@/app/api/tribes/[slug]/events/[eventId]/route";
import { createRequestModules } from "@/src/modules/setup";

const getAuthenticatedMember = jest.fn();
const listTribeEvents = jest.fn();
const createTribeEvent = jest.fn();
const updateTribeEvent = jest.fn();
const deleteTribeEvent = jest.fn();

jest.mock("@/src/modules/setup", () => ({
  createRequestModules: jest.fn(),
}));

jest.mock(
  "@/src/modules/shared/infrastructure/observability/server-logger",
  () => ({
    createServerLogger: jest.fn(() => ({
      error: jest.fn(),
      info: jest.fn(),
    })),
  })
);

class MockJsonResponse {
  status: number;

  constructor(
    private readonly body: Record<string, unknown>,
    init?: ResponseInit
  ) {
    this.status = init?.status ?? 200;
  }

  static json(body: Record<string, unknown>, init?: ResponseInit) {
    return new MockJsonResponse(body, init);
  }

  async json() {
    return this.body;
  }
}

function buildJsonRequest(body: Record<string, unknown> = {}): Request {
  return {
    headers: new Headers({
      "Content-Type": "application/json",
    }),
    json: async () => body,
    method: "POST",
    url: "https://tutribu.example.com/api/tribes/matematica-pro/events?month=2026-05",
  } as unknown as Request;
}

function buildTribeContext() {
  return {
    params: Promise.resolve({
      slug: "matematica-pro",
    }),
  };
}

function buildEventContext() {
  return {
    params: Promise.resolve({
      eventId: "event-1",
      slug: "matematica-pro",
    }),
  };
}

describe("Tribe event routes", () => {
  const event = {
    description: "Repaso mensual",
    endsAt: "2026-05-06T19:00:00.000Z",
    id: "event-1",
    meetingUrl: "https://meet.google.com/abc-defg-hij",
    startsAt: "2026-05-06T18:00:00.000Z",
    title: "Clase abierta",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    global.Response = MockJsonResponse as unknown as typeof Response;
    getAuthenticatedMember.mockResolvedValue({
      avatarFallback: "GH",
      email: "member@example.com",
      id: "member-1",
      image: null,
      name: "Grace Hopper",
      role: "tribemate",
    });
    (createRequestModules as jest.Mock).mockResolvedValue({
      auth: {
        useCases: {
          getAuthenticatedMember,
        },
      },
      events: {
        useCases: {
          createTribeEvent,
          deleteTribeEvent,
          listTribeEvents,
          updateTribeEvent,
        },
      },
    });
  });

  it("lists events for a tribe month", async () => {
    listTribeEvents.mockResolvedValue({
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

    const response = await GET(buildJsonRequest(), buildTribeContext());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
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
    expect(listTribeEvents).toHaveBeenCalledWith({
      month: "2026-05",
      tribeSlug: "matematica-pro",
    });
  });

  it("creates an event from request body fields", async () => {
    createTribeEvent.mockResolvedValue({
      event,
      status: "created",
    });

    const response = await POST(
      buildJsonRequest({
        description: "Repaso mensual",
        endsAt: "2026-05-06T19:00:00.000Z",
        meetingUrl: "https://meet.google.com/abc-defg-hij",
        startsAt: "2026-05-06T18:00:00.000Z",
        title: "Clase abierta",
      }),
      buildTribeContext()
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      event,
      message: "Evento creado.",
    });
  });

  it("returns a safe validation message when event input is invalid", async () => {
    createTribeEvent.mockResolvedValue({
      status: "invalid_input",
    });

    const response = await POST(buildJsonRequest({ title: "" }), buildTribeContext());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "Completá el título y la fecha de inicio del evento.",
    });
  });

  it("updates an event from request body fields", async () => {
    updateTribeEvent.mockResolvedValue({
      event,
      status: "updated",
    });

    const response = await PATCH(
      buildJsonRequest({
        description: "Repaso mensual",
        endsAt: "2026-05-06T19:00:00.000Z",
        meetingUrl: "https://meet.google.com/abc-defg-hij",
        startsAt: "2026-05-06T18:00:00.000Z",
        title: "Clase abierta",
      }),
      buildEventContext()
    );

    expect(response.status).toBe(200);
    expect(updateTribeEvent).toHaveBeenCalledWith({
      description: "Repaso mensual",
      endsAt: "2026-05-06T19:00:00.000Z",
      eventId: "event-1",
      meetingUrl: "https://meet.google.com/abc-defg-hij",
      startsAt: "2026-05-06T18:00:00.000Z",
      title: "Clase abierta",
      tribeSlug: "matematica-pro",
    });
  });

  it("deletes an event by id", async () => {
    deleteTribeEvent.mockResolvedValue({
      status: "deleted",
    });

    const response = await DELETE(buildJsonRequest(), buildEventContext());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      message: "Evento eliminado.",
    });
    expect(deleteTribeEvent).toHaveBeenCalledWith({
      eventId: "event-1",
      tribeSlug: "matematica-pro",
    });
  });
});
