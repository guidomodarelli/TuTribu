import { GET, POST } from "@/app/api/tribes/[slug]/events/route";
import {
  DELETE,
  PATCH,
} from "@/app/api/tribes/[slug]/events/[eventId]/route";
import {
  DELETE as DELETE_ATTENDANCE,
  PUT as PUT_ATTENDANCE,
} from "@/app/api/tribes/[slug]/events/[eventId]/attendance/route";
import { GET as GET_CALENDAR } from "@/app/api/tribes/[slug]/events/[eventId]/calendar/route";
import { createRequestModules } from "@/src/modules/setup";

const getAuthenticatedMember = jest.fn();
const listTribeEvents = jest.fn();
const createTribeEvent = jest.fn();
const updateTribeEvent = jest.fn();
const deleteTribeEvent = jest.fn();
const getTribeEvent = jest.fn();
const setTribeEventAttendance = jest.fn();
const clearTribeEventAttendance = jest.fn();

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

class MockResponse {
  headers: Headers;
  status: number;

  constructor(
    private readonly body: Record<string, unknown> | string,
    init?: ResponseInit
  ) {
    this.status = init?.status ?? 200;
    this.headers = new Headers(init?.headers);
  }

  static json(body: Record<string, unknown>, init?: ResponseInit) {
    return new MockResponse(body, init);
  }

  async json() {
    return this.body;
  }

  async text() {
    return typeof this.body === "string" ? this.body : JSON.stringify(this.body);
  }
}

const EVENT_ID = "6f3c7a1e-2b4d-4c8e-9f10-1a2b3c4d5e6f";
const BASE_URL = "https://tutribu.example.com/api/tribes/matematica-pro/events";

function buildRequest(
  body: Record<string, unknown> = {},
  url: string = `${BASE_URL}?month=2026-05`
): Request {
  return {
    headers: new Headers({
      "Content-Type": "application/json",
    }),
    json: async () => body,
    method: "POST",
    url,
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
      eventId: EVENT_ID,
      slug: "matematica-pro",
    }),
  };
}

describe("Tribe event routes", () => {
  const event = {
    description: "Repaso mensual",
    endsAt: "2026-05-06T19:00:00.000Z",
    id: EVENT_ID,
    meetingUrl: "https://meet.google.com/abc-defg-hij",
    recurrenceFrequency: "none",
    recurrenceRule: null,
    recurrenceUntil: null,
    startsAt: "2026-05-06T18:00:00.000Z",
    title: "Clase abierta",
  };
  const occurrence = {
    attendance: { goingCount: 0, viewerStatus: null },
    description: event.description,
    endsAt: event.endsAt,
    eventId: EVENT_ID,
    meetingUrl: event.meetingUrl,
    occurrenceKey: `${EVENT_ID}@${event.startsAt}`,
    recurrenceFrequency: "none",
    recurrenceRule: null,
    recurrenceUntil: null,
    seriesEndsAt: event.endsAt,
    seriesStartsAt: event.startsAt,
    startsAt: event.startsAt,
    title: event.title,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    global.Response = MockResponse as unknown as typeof Response;
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
          clearTribeEventAttendance,
          createTribeEvent,
          deleteTribeEvent,
          getTribeEvent,
          listTribeEvents,
          setTribeEventAttendance,
          updateTribeEvent,
        },
      },
    });
  });

  it("lists events for a tribe month", async () => {
    listTribeEvents.mockResolvedValue({
      events: [occurrence],
      month: {
        current: "2026-05",
        next: "2026-06",
        previous: "2026-04",
      },
      viewerPermissions: {
        canManageEvents: true,
      },
    });

    const response = await GET(buildRequest(), buildTribeContext());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      events: [occurrence],
      month: { current: "2026-05" },
    });
    expect(listTribeEvents).toHaveBeenCalledWith({
      month: "2026-05",
      tribeSlug: "matematica-pro",
    });
  });

  it("rejects unauthenticated viewers with a Spanish message", async () => {
    getAuthenticatedMember.mockResolvedValueOnce(null);

    const response = await GET(buildRequest(), buildTribeContext());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      message: "Iniciá sesión para gestionar eventos.",
    });
  });

  it("creates an event from request body fields and returns the month occurrences", async () => {
    createTribeEvent.mockResolvedValue({
      event,
      occurrences: [occurrence],
      status: "created",
    });

    const response = await POST(
      buildRequest({
        description: "Repaso mensual",
        endsAt: "2026-05-06T19:00:00.000Z",
        meetingUrl: "https://meet.google.com/abc-defg-hij",
        recurrenceFrequency: "weekly",
        recurrenceUntil: "",
        startsAt: "2026-05-06T18:00:00.000Z",
        title: "Clase abierta",
      }),
      buildTribeContext()
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      event,
      message: "Evento creado.",
      occurrences: [occurrence],
    });
    expect(createTribeEvent).toHaveBeenCalledWith({
      description: "Repaso mensual",
      endsAt: "2026-05-06T19:00:00.000Z",
      meetingUrl: "https://meet.google.com/abc-defg-hij",
      recurrenceFrequency: "weekly",
      recurrenceUntil: "",
      startsAt: "2026-05-06T18:00:00.000Z",
      title: "Clase abierta",
      tribeSlug: "matematica-pro",
      visibleMonth: "2026-05",
    });
  });

  it("returns safe validation messages when event input is invalid", async () => {
    createTribeEvent.mockResolvedValueOnce({ status: "invalid_input" });

    const invalidInputResponse = await POST(buildRequest({ title: "" }), buildTribeContext());

    expect(invalidInputResponse.status).toBe(400);
    await expect(invalidInputResponse.json()).resolves.toEqual({
      message: "Completá el título y la fecha de inicio del evento.",
    });

    createTribeEvent.mockResolvedValueOnce({ status: "invalid_recurrence" });

    const invalidRecurrenceResponse = await POST(buildRequest(), buildTribeContext());

    expect(invalidRecurrenceResponse.status).toBe(400);
    await expect(invalidRecurrenceResponse.json()).resolves.toEqual({
      message: "Elegí una repetición válida y una fecha de fin posterior al inicio.",
    });
  });

  it("updates an event from request body fields", async () => {
    updateTribeEvent.mockResolvedValue({
      event,
      occurrences: [occurrence],
      status: "updated",
    });

    const response = await PATCH(
      buildRequest(
        {
          description: "Repaso mensual",
          endsAt: "2026-05-06T19:00:00.000Z",
          meetingUrl: "https://meet.google.com/abc-defg-hij",
          startsAt: "2026-05-06T18:00:00.000Z",
          title: "Clase abierta",
        },
        `${BASE_URL}/${EVENT_ID}?month=2026-05`
      ),
      buildEventContext()
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      message: "Evento actualizado.",
      occurrences: [occurrence],
    });
    expect(updateTribeEvent).toHaveBeenCalledWith({
      description: "Repaso mensual",
      endsAt: "2026-05-06T19:00:00.000Z",
      eventId: EVENT_ID,
      meetingUrl: "https://meet.google.com/abc-defg-hij",
      recurrenceFrequency: "",
      recurrenceUntil: "",
      startsAt: "2026-05-06T18:00:00.000Z",
      title: "Clase abierta",
      tribeSlug: "matematica-pro",
      visibleMonth: "2026-05",
    });
  });

  it("deletes an event by id and maps forbidden deletions", async () => {
    deleteTribeEvent.mockResolvedValueOnce({ status: "deleted" });

    const response = await DELETE(buildRequest(), buildEventContext());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      message: "Evento eliminado.",
    });
    expect(deleteTribeEvent).toHaveBeenCalledWith({
      eventId: EVENT_ID,
      tribeSlug: "matematica-pro",
    });

    deleteTribeEvent.mockResolvedValueOnce({ status: "forbidden" });

    const forbiddenResponse = await DELETE(buildRequest(), buildEventContext());

    expect(forbiddenResponse.status).toBe(403);
  });

  it("records the viewer attendance for an occurrence", async () => {
    setTribeEventAttendance.mockResolvedValue({
      attendance: { goingCount: 3, viewerStatus: "going" },
      status: "attendance_saved",
    });

    const response = await PUT_ATTENDANCE(
      buildRequest(
        {
          occurrenceStartsAt: "2026-05-13T18:00:00.000Z",
          status: "going",
        },
        `${BASE_URL}/${EVENT_ID}/attendance`
      ),
      buildEventContext()
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      attendance: { goingCount: 3, viewerStatus: "going" },
      message: "Respuesta guardada.",
    });
    expect(setTribeEventAttendance).toHaveBeenCalledWith({
      eventId: EVENT_ID,
      occurrenceStartsAt: "2026-05-13T18:00:00.000Z",
      status: "going",
      tribeSlug: "matematica-pro",
    });
  });

  it("maps attendance failures to safe responses", async () => {
    setTribeEventAttendance.mockResolvedValueOnce({ status: "forbidden" });

    const forbiddenResponse = await PUT_ATTENDANCE(
      buildRequest({}, `${BASE_URL}/${EVENT_ID}/attendance`),
      buildEventContext()
    );

    expect(forbiddenResponse.status).toBe(403);
    await expect(forbiddenResponse.json()).resolves.toEqual({
      message: "Solo los miembros activos pueden responder a un evento.",
    });

    setTribeEventAttendance.mockResolvedValueOnce({ status: "invalid_attendance" });

    const invalidResponse = await PUT_ATTENDANCE(
      buildRequest({}, `${BASE_URL}/${EVENT_ID}/attendance`),
      buildEventContext()
    );

    expect(invalidResponse.status).toBe(400);
  });

  it("clears the viewer attendance for the occurrence in the query", async () => {
    clearTribeEventAttendance.mockResolvedValue({
      attendance: { goingCount: 2, viewerStatus: null },
      status: "attendance_cleared",
    });

    const response = await DELETE_ATTENDANCE(
      buildRequest(
        {},
        `${BASE_URL}/${EVENT_ID}/attendance?occurrence=${encodeURIComponent(
          "2026-05-13T18:00:00.000Z"
        )}`
      ),
      buildEventContext()
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      attendance: { goingCount: 2, viewerStatus: null },
      message: "Respuesta eliminada.",
    });
    expect(clearTribeEventAttendance).toHaveBeenCalledWith({
      eventId: EVENT_ID,
      occurrenceStartsAt: "2026-05-13T18:00:00.000Z",
      tribeSlug: "matematica-pro",
    });
  });

  it("exports the event as a downloadable ICS file", async () => {
    getTribeEvent.mockResolvedValue(event);

    const response = await GET_CALENDAR(
      buildRequest({}, `${BASE_URL}/${EVENT_ID}/calendar`),
      buildEventContext()
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/calendar; charset=utf-8");
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="evento-clase-abierta.ics"'
    );
    await expect(response.text()).resolves.toContain("BEGIN:VCALENDAR");
    expect(getTribeEvent).toHaveBeenCalledWith({
      eventId: EVENT_ID,
      tribeSlug: "matematica-pro",
    });
  });

  it("returns not found when the event to export does not exist", async () => {
    getTribeEvent.mockResolvedValue(null);

    const response = await GET_CALENDAR(
      buildRequest({}, `${BASE_URL}/${EVENT_ID}/calendar`),
      buildEventContext()
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      message: "No pudimos encontrar el evento.",
    });
  });
});
