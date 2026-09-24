import { vi, describe, it, expect, beforeEach, type Mock } from "vitest";
import { GET, POST } from "@/app/api/tribes/[slug]/events/route";
import {
  DELETE,
  PATCH,
} from "@/app/api/tribes/[slug]/events/[eventId]/route";
import {
  DELETE as DELETE_ATTENDANCE,
  GET as GET_ATTENDANCE,
  PUT as PUT_ATTENDANCE,
} from "@/app/api/tribes/[slug]/events/[eventId]/attendance/route";
import { GET as GET_ATTENDANCE_EXPORT } from "@/app/api/tribes/[slug]/events/[eventId]/attendance/export/route";
import { GET as GET_CALENDAR } from "@/app/api/tribes/[slug]/events/[eventId]/calendar/route";
import { createRequestModules } from "@/src/modules/setup";

const getAuthenticatedMember = vi.fn();
const listTribeEvents = vi.fn();
const createTribeEvent = vi.fn();
const updateTribeEvent = vi.fn();
const deleteTribeEvent = vi.fn();
const getTribeEvent = vi.fn();
const getTribeEventCalendar = vi.fn();
const setTribeEventAttendance = vi.fn();
const clearTribeEventAttendance = vi.fn();
const getTribeEventAttendanceReport = vi.fn();
const logError = vi.fn();
const logWarn = vi.fn();

vi.mock("@/src/modules/setup", () => ({
  createRequestModules: vi.fn(),
}));

// The logger writes to the console; the double lets the tests assert what is
// logged (issue paths and codes, never the rejected values).
vi.mock(
  "@/src/modules/shared/infrastructure/observability/server-logger",
  () => ({
    createServerLogger: vi.fn(() => ({
      error: logError,
      info: vi.fn(),
      warn: logWarn,
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
const TRIBE_SLUG = "matematica-pro";
const BASE_URL = `https://tutribu.example.com/api/tribes/${TRIBE_SLUG}/events`;
const OCCURRENCE_STARTS_AT = "2026-05-13T18:00:00.000Z";
const OCCURRENCE_QUERY = `?occurrence=${encodeURIComponent(OCCURRENCE_STARTS_AT)}`;

function buildRequest(
  body: unknown = {},
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

function buildTribeContext(slug: string = TRIBE_SLUG) {
  return {
    params: Promise.resolve({ slug }),
  };
}

function buildEventContext(eventId: string = EVENT_ID, slug: string = TRIBE_SLUG) {
  return {
    params: Promise.resolve({ eventId, slug }),
  };
}

const EMPTY_ATTENDANCE = {
  goingCount: 0,
  goingPreview: [],
  maybeCount: 0,
  viewerStatus: null,
  viewerWaitlistPosition: null,
  waitlistedCount: 0,
};

const VALID_EVENT_BODY = {
  description: "Repaso mensual",
  endsAt: "2026-05-06T19:00:00.000Z",
  meetingUrl: "https://meet.google.com/abc-defg-hij",
  recurrenceFrequency: "weekly",
  recurrenceUntil: "",
  startsAt: "2026-05-06T18:00:00.000Z",
  title: "Clase abierta",
};

/**
 * Asserts a public error body: only the safe message, no Zod diagnostics,
 * issue codes, or echoed input.
 */
async function expectSafeErrorBody(response: Response, message: string) {
  const body = await response.json();

  expect(body).toEqual({ message });
  expect(JSON.stringify(body)).not.toMatch(/issues|invalid_|expected|received|zod/i);
}

describe("Tribe event routes", () => {
  const event = {
    capacity: null,
    description: "Repaso mensual",
    endsAt: "2026-05-06T19:00:00.000Z",
    eventType: "live",
    id: EVENT_ID,
    meetingUrl: "https://meet.google.com/abc-defg-hij",
    recurrenceFrequency: "none",
    recurrenceRule: null,
    recurrenceUntil: null,
    startsAt: "2026-05-06T18:00:00.000Z",
    title: "Clase abierta",
  };
  const occurrence = {
    attendance: EMPTY_ATTENDANCE,
    capacity: null,
    description: event.description,
    endsAt: event.endsAt,
    eventId: EVENT_ID,
    meetingUrl: event.meetingUrl,
    eventType: "live",
    exception: null,
    occurrenceKey: `${EVENT_ID}@${event.startsAt}`,
    originalStartsAt: event.startsAt,
    recurrenceFrequency: "none",
    recurrenceRule: null,
    recurrenceUntil: null,
    seriesEndsAt: event.endsAt,
    seriesStartsAt: event.startsAt,
    startsAt: event.startsAt,
    title: event.title,
  };
  const listing = {
    events: [occurrence],
    month: {
      current: "2026-05",
      next: "2026-06",
      previous: "2026-04",
    },
    pendingProposalCount: 0,
    recordedOccurrenceKeys: [],
    selectedOccurrenceKey: null,
    viewerPermissions: {
      canManageEvents: true,
      canProposeEvents: false,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    global.Response = MockResponse as unknown as typeof Response;
    getAuthenticatedMember.mockResolvedValue({
      avatarFallback: "GH",
      email: "member@example.com",
      id: "member-1",
      image: null,
      name: "Grace Hopper",
      role: "tribemate",
    });
    (createRequestModules as Mock).mockResolvedValue({
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
          getTribeEventAttendanceReport,
          getTribeEventCalendar,
          listTribeEvents,
          setTribeEventAttendance,
          updateTribeEvent,
        },
      },
    });
  });

  it("lists events for a tribe month", async () => {
    listTribeEvents.mockResolvedValue(listing);

    const response = await GET(buildRequest(), buildTribeContext());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(listing);
    expect(listTribeEvents).toHaveBeenCalledWith({
      eventTypes: [],
      month: "2026-05",
      occurrence: null,
      tribeSlug: TRIBE_SLUG,
    });
  });

  it("lists the current month when no month is requested", async () => {
    listTribeEvents.mockResolvedValue(listing);

    await GET(buildRequest({}, BASE_URL), buildTribeContext());

    expect(listTribeEvents).toHaveBeenCalledWith({
      eventTypes: [],
      month: null,
      occurrence: null,
      tribeSlug: TRIBE_SLUG,
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

  it("creates an event from the validated body and returns the month occurrences", async () => {
    createTribeEvent.mockResolvedValue({
      event,
      occurrences: [occurrence],
      status: "created" as const,
    });

    const response = await POST(
      buildRequest({ ...VALID_EVENT_BODY, capacity: " 12 ", title: " Clase abierta " }),
      buildTribeContext()
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      event,
      message: "Evento creado.",
      occurrences: [occurrence],
    });
    // The use case receives the schema output: no raw strings left to re-read.
    expect(createTribeEvent).toHaveBeenCalledWith({
      capacity: 12,
      description: "Repaso mensual",
      endsAt: "2026-05-06T19:00:00.000Z",
      eventType: "live",
      meetingUrl: "https://meet.google.com/abc-defg-hij",
      recurrenceFrequency: "weekly",
      recurrenceUntil: null,
      startsAt: "2026-05-06T18:00:00.000Z",
      title: "Clase abierta",
      tribeSlug: TRIBE_SLUG,
      visibleMonth: "2026-05",
    });
  });

  it("maps business rule failures of the use case to safe messages", async () => {
    createTribeEvent.mockResolvedValueOnce({ status: "invalid_recurrence" as const });

    const invalidRecurrenceResponse = await POST(
      buildRequest(VALID_EVENT_BODY),
      buildTribeContext()
    );

    expect(invalidRecurrenceResponse.status).toBe(400);
    await expectSafeErrorBody(
      invalidRecurrenceResponse,
      "Elegí una repetición válida y una fecha de fin posterior al inicio."
    );

    createTribeEvent.mockResolvedValueOnce({ status: "invalid_date" as const });

    const invalidDateResponse = await POST(buildRequest(VALID_EVENT_BODY), buildTribeContext());

    expect(invalidDateResponse.status).toBe(400);
    await expectSafeErrorBody(
      invalidDateResponse,
      "La fecha de fin debe ser posterior al inicio."
    );
  });

  it("updates an event from the validated body", async () => {
    updateTribeEvent.mockResolvedValue({
      event,
      occurrences: [occurrence],
      status: "updated" as const,
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
      capacity: null,
      description: "Repaso mensual",
      endsAt: "2026-05-06T19:00:00.000Z",
      eventType: "live",
      eventId: EVENT_ID,
      meetingUrl: "https://meet.google.com/abc-defg-hij",
      recurrenceFrequency: "none",
      recurrenceUntil: null,
      startsAt: "2026-05-06T18:00:00.000Z",
      title: "Clase abierta",
      tribeSlug: TRIBE_SLUG,
      visibleMonth: "2026-05",
    });
  });

  it("deletes an event by id and maps forbidden deletions", async () => {
    deleteTribeEvent.mockResolvedValueOnce({ status: "deleted" as const });

    const response = await DELETE(buildRequest(), buildEventContext());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      message: "Evento eliminado.",
    });
    expect(deleteTribeEvent).toHaveBeenCalledWith({
      eventId: EVENT_ID,
      tribeSlug: TRIBE_SLUG,
    });

    deleteTribeEvent.mockResolvedValueOnce({ status: "forbidden" as const });

    const forbiddenResponse = await DELETE(buildRequest(), buildEventContext());

    expect(forbiddenResponse.status).toBe(403);
  });

  it("records the viewer attendance for an occurrence", async () => {
    const attendance = { ...EMPTY_ATTENDANCE, goingCount: 3, viewerStatus: "going" };
    setTribeEventAttendance.mockResolvedValue({
      attendance,
      status: "attendance_saved" as const,
    });

    const response = await PUT_ATTENDANCE(
      buildRequest(
        {
          occurrenceStartsAt: "2026-05-13T15:00:00-03:00",
          status: "going" as const,
        },
        `${BASE_URL}/${EVENT_ID}/attendance`
      ),
      buildEventContext()
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      attendance,
      message: "Respuesta guardada.",
    });
    expect(setTribeEventAttendance).toHaveBeenCalledWith({
      eventId: EVENT_ID,
      occurrenceStartsAt: OCCURRENCE_STARTS_AT,
      status: "going" as const,
      tribeSlug: TRIBE_SLUG,
    });
  });

  it("maps attendance failures of the use case to safe responses", async () => {
    const validBody = { occurrenceStartsAt: OCCURRENCE_STARTS_AT, status: "going" };
    setTribeEventAttendance.mockResolvedValueOnce({ status: "forbidden" as const });

    const forbiddenResponse = await PUT_ATTENDANCE(
      buildRequest(validBody, `${BASE_URL}/${EVENT_ID}/attendance`),
      buildEventContext()
    );

    expect(forbiddenResponse.status).toBe(403);
    await expectSafeErrorBody(
      forbiddenResponse,
      "Solo los miembros activos pueden responder a un evento."
    );

    setTribeEventAttendance.mockResolvedValueOnce({ status: "invalid_attendance" as const });

    const invalidResponse = await PUT_ATTENDANCE(
      buildRequest(validBody, `${BASE_URL}/${EVENT_ID}/attendance`),
      buildEventContext()
    );

    expect(invalidResponse.status).toBe(400);
  });

  it("clears the viewer attendance for the occurrence in the query", async () => {
    const attendance = { ...EMPTY_ATTENDANCE, goingCount: 2 };
    clearTribeEventAttendance.mockResolvedValue({
      attendance,
      status: "attendance_cleared" as const,
    });

    const response = await DELETE_ATTENDANCE(
      buildRequest({}, `${BASE_URL}/${EVENT_ID}/attendance${OCCURRENCE_QUERY}`),
      buildEventContext()
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      attendance,
      message: "Respuesta eliminada.",
    });
    expect(clearTribeEventAttendance).toHaveBeenCalledWith({
      eventId: EVENT_ID,
      occurrenceStartsAt: OCCURRENCE_STARTS_AT,
      tribeSlug: TRIBE_SLUG,
    });
  });

  it("exports the event as a downloadable ICS file", async () => {
    getTribeEventCalendar.mockResolvedValue({ event, occurrenceExceptions: [] });

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
    expect(getTribeEventCalendar).toHaveBeenCalledWith({
      eventId: EVENT_ID,
      tribeSlug: TRIBE_SLUG,
    });
  });

  it("returns not found when the event to export does not exist", async () => {
    getTribeEventCalendar.mockResolvedValue(null);

    const response = await GET_CALENDAR(
      buildRequest({}, `${BASE_URL}/${EVENT_ID}/calendar`),
      buildEventContext()
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      message: "No pudimos encontrar el evento.",
    });
  });

  it("tells the viewer when a going answer landed on the waitlist", async () => {
    const attendance = {
      goingCount: 10,
      goingPreview: [],
      maybeCount: 0,
      viewerStatus: "waitlisted",
      viewerWaitlistPosition: 2,
      waitlistedCount: 2,
    };
    setTribeEventAttendance.mockResolvedValue({
      attendance,
      status: "attendance_saved" as const,
    });

    const response = await PUT_ATTENDANCE(
      buildRequest(
        { occurrenceStartsAt: OCCURRENCE_STARTS_AT, status: "going" },
        `${BASE_URL}/${EVENT_ID}/attendance`
      ),
      buildEventContext()
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      attendance,
      message: "El evento está completo: quedaste en la lista de espera.",
    });
  });

  describe("attendance report", () => {
    const report = {
      attendeeGroups: {
        going: [{ name: "Ana", respondedAt: "2026-05-10T15:05:00.000Z", status: "going" }],
        maybe: [],
        notGoing: [{ name: "=cmd", respondedAt: "2026-05-10T16:00:00.000Z", status: "not_going" }],
        waitlisted: [],
      },
      eventTitle: "Clase abierta",
      occurrenceStartsAt: OCCURRENCE_STARTS_AT,
      trend: [],
    };
    const reportUrl = `${BASE_URL}/${EVENT_ID}/attendance${OCCURRENCE_QUERY}`;
    const exportUrl = `${BASE_URL}/${EVENT_ID}/attendance/export${OCCURRENCE_QUERY}`;

    it("returns the manager report as JSON", async () => {
      getTribeEventAttendanceReport.mockResolvedValue({ report, status: "found" as const });

      const response = await GET_ATTENDANCE(buildRequest({}, reportUrl), buildEventContext());

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ report });
      expect(getTribeEventAttendanceReport).toHaveBeenCalledWith({
        eventId: EVENT_ID,
        occurrenceStartsAt: OCCURRENCE_STARTS_AT,
        tribeSlug: TRIBE_SLUG,
      });
    });

    it("rejects members who cannot manage events, even if they call the endpoints directly", async () => {
      getTribeEventAttendanceReport.mockResolvedValue({ status: "forbidden" as const });

      const jsonResponse = await GET_ATTENDANCE(buildRequest({}, reportUrl), buildEventContext());
      const csvResponse = await GET_ATTENDANCE_EXPORT(
        buildRequest({}, exportUrl),
        buildEventContext()
      );

      for (const response of [jsonResponse, csvResponse]) {
        expect(response.status).toBe(403);
        await expect(response.json()).resolves.toEqual({
          message: "Solo quienes gestionan eventos pueden ver la asistencia.",
        });
      }
    });

    it("requires a session for both endpoints", async () => {
      getAuthenticatedMember.mockResolvedValue(null);

      const jsonResponse = await GET_ATTENDANCE(buildRequest({}, reportUrl), buildEventContext());
      const csvResponse = await GET_ATTENDANCE_EXPORT(
        buildRequest({}, exportUrl),
        buildEventContext()
      );

      expect(jsonResponse.status).toBe(401);
      expect(csvResponse.status).toBe(401);
      expect(getTribeEventAttendanceReport).not.toHaveBeenCalled();
    });

    it("downloads the attendance as an escaped CSV attachment", async () => {
      getTribeEventAttendanceReport.mockResolvedValue({ report, status: "found" as const });

      const response = await GET_ATTENDANCE_EXPORT(buildRequest({}, exportUrl), buildEventContext());

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
      expect(response.headers.get("Content-Disposition")).toBe(
        'attachment; filename="asistencia-clase-abierta-2026-05-13.csv"'
      );
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      const content = await response.text();

      expect(content).toContain("Nombre,Estado,Respondido el");
      expect(content).toContain("Ana,Va,2026-05-10 12:05");
      expect(content).toContain("'=cmd,No va,2026-05-10 13:00");
    });

    it("hides unexpected failures behind a safe message", async () => {
      getTribeEventAttendanceReport.mockRejectedValue(new Error("connection reset"));

      const response = await GET_ATTENDANCE_EXPORT(buildRequest({}, exportUrl), buildEventContext());

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({
        message: "No pudimos generar el archivo de asistencia.",
      });
    });
  });

  describe("input boundary", () => {
    const useCases = [
      listTribeEvents,
      createTribeEvent,
      updateTribeEvent,
      deleteTribeEvent,
      getTribeEvent,
      setTribeEventAttendance,
      clearTribeEventAttendance,
      getTribeEventAttendanceReport,
    ];
    const invalidSlug = "Mate Pro";
    const invalidEventId = "not-a-uuid";
    const eventUrl = `${BASE_URL}/${EVENT_ID}`;
    const attendanceUrl = `${eventUrl}/attendance`;
    const validAttendanceBody = { occurrenceStartsAt: OCCURRENCE_STARTS_AT, status: "going" };

    it.each([
      ["GET /events", () => GET(buildRequest(), buildTribeContext(invalidSlug)), "No pudimos encontrar la tribu."],
      [
        "POST /events",
        () => POST(buildRequest(VALID_EVENT_BODY), buildTribeContext(invalidSlug)),
        "No pudimos encontrar la tribu.",
      ],
      [
        "PATCH /events/[eventId]",
        () => PATCH(buildRequest(VALID_EVENT_BODY, eventUrl), buildEventContext(invalidEventId)),
        "No pudimos encontrar el evento.",
      ],
      [
        "DELETE /events/[eventId]",
        () => DELETE(buildRequest({}, eventUrl), buildEventContext(EVENT_ID, invalidSlug)),
        "No pudimos encontrar la tribu.",
      ],
      [
        "GET /attendance",
        () =>
          GET_ATTENDANCE(
            buildRequest({}, `${attendanceUrl}${OCCURRENCE_QUERY}`),
            buildEventContext(invalidEventId)
          ),
        "No pudimos encontrar el evento.",
      ],
      [
        "PUT /attendance",
        () =>
          PUT_ATTENDANCE(
            buildRequest(validAttendanceBody, attendanceUrl),
            buildEventContext(invalidEventId)
          ),
        "No pudimos encontrar el evento.",
      ],
      [
        "DELETE /attendance",
        () =>
          DELETE_ATTENDANCE(
            buildRequest({}, `${attendanceUrl}${OCCURRENCE_QUERY}`),
            buildEventContext(invalidEventId)
          ),
        "No pudimos encontrar el evento.",
      ],
      [
        "GET /attendance/export",
        () =>
          GET_ATTENDANCE_EXPORT(
            buildRequest({}, `${attendanceUrl}/export${OCCURRENCE_QUERY}`),
            buildEventContext(invalidEventId)
          ),
        "No pudimos encontrar el evento.",
      ],
      [
        "GET /calendar",
        () => GET_CALENDAR(buildRequest({}, `${eventUrl}/calendar`), buildEventContext(invalidEventId)),
        "No pudimos encontrar el evento.",
      ],
    ])("rejects invalid params of %s before any use case runs", async (_route, callRoute, message) => {
      const response = await callRoute();

      expect(response.status).toBe(400);
      await expectSafeErrorBody(response, message);
      for (const useCase of useCases) {
        expect(useCase).not.toHaveBeenCalled();
      }
      expect(logWarn).toHaveBeenCalledWith({
        message: "Tribe event route input rejected",
        metadata: { issues: [expect.objectContaining({ path: expect.any(String) })], part: "params" },
      });
      expect(JSON.stringify(logWarn.mock.calls)).not.toContain(invalidEventId);
      expect(JSON.stringify(logWarn.mock.calls)).not.toContain(invalidSlug);
    });

    it.each([
      [
        "GET /events",
        () => GET(buildRequest({}, `${BASE_URL}?month=2026-13`), buildTribeContext()),
        "Elegí un mes válido del calendario.",
      ],
      [
        "POST /events",
        () => POST(buildRequest(VALID_EVENT_BODY, `${BASE_URL}?month=mayo`), buildTribeContext()),
        "Elegí un mes válido del calendario.",
      ],
      [
        "PATCH /events/[eventId]",
        () =>
          PATCH(
            buildRequest(VALID_EVENT_BODY, `${eventUrl}?month=2026-05&month=2026-06`),
            buildEventContext()
          ),
        "Elegí un mes válido del calendario.",
      ],
      [
        "GET /attendance",
        () => GET_ATTENDANCE(buildRequest({}, attendanceUrl), buildEventContext()),
        "Elegí una fecha válida del evento para responder.",
      ],
      [
        "DELETE /attendance",
        () =>
          DELETE_ATTENDANCE(
            buildRequest({}, `${attendanceUrl}?occurrence=yesterday`),
            buildEventContext()
          ),
        "Elegí una fecha válida del evento para responder.",
      ],
      [
        "GET /attendance/export",
        () =>
          GET_ATTENDANCE_EXPORT(
            buildRequest({}, `${attendanceUrl}/export?occurrence=2026-05-13`),
            buildEventContext()
          ),
        "Elegí una fecha válida del evento para responder.",
      ],
    ])("rejects an invalid query of %s before any use case runs", async (_route, callRoute, message) => {
      const response = await callRoute();

      expect(response.status).toBe(400);
      await expectSafeErrorBody(response, message);
      for (const useCase of useCases) {
        expect(useCase).not.toHaveBeenCalled();
      }
      expect(logWarn).toHaveBeenCalledWith(
        expect.objectContaining({ metadata: expect.objectContaining({ part: "query" }) })
      );
    });

    it.each([
      [
        "POST /events without title",
        () => POST(buildRequest({ ...VALID_EVENT_BODY, title: "   " }), buildTribeContext()),
        "Completá el título y la fecha de inicio del evento.",
      ],
      [
        "POST /events with a non-JSON body",
        () => POST(buildRequest(undefined), buildTribeContext()),
        "Completá el título y la fecha de inicio del evento.",
      ],
      [
        "POST /events with an invalid capacity",
        () => POST(buildRequest({ ...VALID_EVENT_BODY, capacity: "0" }), buildTribeContext()),
        "Ingresá un cupo entre 1 y 10000, o dejalo vacío para no limitarlo.",
      ],
      [
        "PATCH /events/[eventId] with an unknown frequency",
        () =>
          PATCH(
            buildRequest({ ...VALID_EVENT_BODY, recurrenceFrequency: "daily" }, eventUrl),
            buildEventContext()
          ),
        "Elegí una repetición válida y una fecha de fin posterior al inicio.",
      ],
      [
        "PATCH /events/[eventId] with a malformed start",
        () =>
          PATCH(
            buildRequest({ ...VALID_EVENT_BODY, startsAt: "mañana" }, eventUrl),
            buildEventContext()
          ),
        "La fecha de fin debe ser posterior al inicio.",
      ],
      [
        "PUT /attendance with waitlisted",
        () =>
          PUT_ATTENDANCE(
            buildRequest({ ...validAttendanceBody, status: "waitlisted" }, attendanceUrl),
            buildEventContext()
          ),
        "Elegí una fecha válida del evento para responder.",
      ],
      [
        "PUT /attendance with an empty body",
        () => PUT_ATTENDANCE(buildRequest({}, attendanceUrl), buildEventContext()),
        "Elegí una fecha válida del evento para responder.",
      ],
    ])("rejects an invalid body: %s", async (_route, callRoute, message) => {
      const response = await callRoute();

      expect(response.status).toBe(400);
      await expectSafeErrorBody(response, message);
      for (const useCase of useCases) {
        expect(useCase).not.toHaveBeenCalled();
      }
      expect(logWarn).toHaveBeenCalledWith(
        expect.objectContaining({ metadata: expect.objectContaining({ part: "body" }) })
      );
    });

    it("never echoes the rejected body in the response or the log", async () => {
      const secretLikeTitle = "x".repeat(121) + "<script>token-123</script>";

      const response = await POST(
        buildRequest({ ...VALID_EVENT_BODY, title: secretLikeTitle }),
        buildTribeContext()
      );

      expect(response.status).toBe(400);
      expect(JSON.stringify(await response.json())).not.toContain("token-123");
      expect(JSON.stringify(logWarn.mock.calls)).not.toContain("token-123");
    });
  });

  describe("public DTO boundary", () => {
    it("drops fields outside the public contract", async () => {
      listTribeEvents.mockResolvedValue({
        ...listing,
        events: [{ ...occurrence, createdBy: "user-secret-id" }],
        internalCursor: "db-cursor",
      });

      const response = await GET(buildRequest(), buildTribeContext());
      const body = JSON.stringify(await response.json());

      expect(response.status).toBe(200);
      expect(body).not.toContain("user-secret-id");
      expect(body).not.toContain("db-cursor");
    });

    it.each([
      [
        "GET /events",
        () => {
          listTribeEvents.mockResolvedValue({ ...listing, viewerPermissions: null });

          return GET(buildRequest(), buildTribeContext());
        },
        "No pudimos cargar los eventos. Intentá de nuevo.",
      ],
      [
        "POST /events",
        () => {
          createTribeEvent.mockResolvedValue({
            event: { ...event, recurrenceFrequency: "daily" },
            occurrences: [],
            status: "created" as const,
          });

          return POST(buildRequest(VALID_EVENT_BODY), buildTribeContext());
        },
        "No pudimos guardar el evento. Intentá de nuevo.",
      ],
      [
        "PATCH /events/[eventId]",
        () => {
          updateTribeEvent.mockResolvedValue({
            event,
            occurrences: [{ ...occurrence, startsAt: "raw-db-value" }],
            status: "updated" as const,
          });

          return PATCH(buildRequest(VALID_EVENT_BODY, `${BASE_URL}/${EVENT_ID}`), buildEventContext());
        },
        "No pudimos actualizar el evento. Intentá de nuevo.",
      ],
      [
        "PUT /attendance",
        () => {
          setTribeEventAttendance.mockResolvedValue({
            attendance: { ...EMPTY_ATTENDANCE, goingCount: -1 },
            status: "attendance_saved" as const,
          });

          return PUT_ATTENDANCE(
            buildRequest(
              { occurrenceStartsAt: OCCURRENCE_STARTS_AT, status: "going" },
              `${BASE_URL}/${EVENT_ID}/attendance`
            ),
            buildEventContext()
          );
        },
        "No pudimos guardar tu respuesta. Intentá de nuevo.",
      ],
      [
        "DELETE /attendance",
        () => {
          clearTribeEventAttendance.mockResolvedValue({
            attendance: { goingCount: 2 },
            status: "attendance_cleared" as const,
          });

          return DELETE_ATTENDANCE(
            buildRequest({}, `${BASE_URL}/${EVENT_ID}/attendance${OCCURRENCE_QUERY}`),
            buildEventContext()
          );
        },
        "No pudimos guardar tu respuesta. Intentá de nuevo.",
      ],
      [
        "GET /attendance",
        () => {
          getTribeEventAttendanceReport.mockResolvedValue({
            report: { eventTitle: "Clase abierta" },
            status: "found" as const,
          });

          return GET_ATTENDANCE(
            buildRequest({}, `${BASE_URL}/${EVENT_ID}/attendance${OCCURRENCE_QUERY}`),
            buildEventContext()
          );
        },
        "No pudimos cargar la asistencia. Intentá de nuevo.",
      ],
    ])("turns an unusable DTO of %s into a safe 500", async (_route, callRoute, message) => {
      const response = await callRoute();

      expect(response.status).toBe(500);
      await expectSafeErrorBody(response, message);
      expect(logError).toHaveBeenCalledWith({
        message: "Tribe event public DTO rejected",
        metadata: expect.objectContaining({
          issues: expect.arrayContaining([
            expect.objectContaining({ code: expect.any(String), path: expect.any(String) }),
          ]),
          reason: "public_dto_rejected",
        }),
      });
      expect(JSON.stringify(logError.mock.calls)).not.toContain("raw-db-value");
    });
  });
});
