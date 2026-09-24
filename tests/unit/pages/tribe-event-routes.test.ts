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
import { GET as GET_ATTENDANCE_STREAK } from "@/app/api/tribes/[slug]/events/attendance-streak/route";
import { createRequestModules } from "@/src/modules/setup";

const getAuthenticatedMember = vi.fn();
const listTribeEvents = vi.fn();
const createTribeEvent = vi.fn();
const updateTribeEvent = vi.fn();
const deleteTribeEvent = vi.fn();
const getTribeEvent = vi.fn();
const setTribeEventAttendance = vi.fn();
const clearTribeEventAttendance = vi.fn();
const getTribeEventAttendanceReport = vi.fn();
const getTribeEventAttendanceStreak = vi.fn();
const getTribeEventAttendanceStreakNextRefreshAt = vi.fn();
const { logError } = vi.hoisted(() => ({ logError: vi.fn() }));

vi.mock("@/src/modules/setup", () => ({
  createRequestModules: vi.fn(),
}));

vi.mock(
  "@/src/modules/shared/infrastructure/observability/server-logger",
  () => ({
    createServerLogger: vi.fn(() => ({
      error: logError,
      info: vi.fn(),
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
    getTribeEventAttendanceStreak.mockResolvedValue(null);
    getTribeEventAttendanceStreakNextRefreshAt.mockResolvedValue(null);
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
          getTribeEventAttendanceStreak,
          getTribeEventAttendanceStreakNextRefreshAt,
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
      status: "created" as const,
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
      attendanceStreak: null,
      event,
      message: "Evento creado.",
      occurrences: [occurrence],
    });
    expect(createTribeEvent).toHaveBeenCalledWith({
      capacity: "",
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
    createTribeEvent.mockResolvedValueOnce({ status: "invalid_input" as const });

    const invalidInputResponse = await POST(buildRequest({ title: "" }), buildTribeContext());

    expect(invalidInputResponse.status).toBe(400);
    await expect(invalidInputResponse.json()).resolves.toEqual({
      message: "Completá el título y la fecha de inicio del evento.",
    });

    createTribeEvent.mockResolvedValueOnce({ status: "invalid_recurrence" as const });

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
      capacity: "",
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
    deleteTribeEvent.mockResolvedValueOnce({ status: "deleted" as const });

    const response = await DELETE(buildRequest(), buildEventContext());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      attendanceStreak: null,
      message: "Evento eliminado.",
    });
    expect(deleteTribeEvent).toHaveBeenCalledWith({
      eventId: EVENT_ID,
      tribeSlug: "matematica-pro",
    });

    deleteTribeEvent.mockResolvedValueOnce({ status: "forbidden" as const });

    const forbiddenResponse = await DELETE(buildRequest(), buildEventContext());

    expect(forbiddenResponse.status).toBe(403);
  });

  describe("attendance streak after series mutations", () => {
    const streak = { attendedCount: 3, occurrenceCount: 5 };

    function buildPatchRequest() {
      return buildRequest(
        {
          startsAt: "2026-05-06T18:00:00.000Z",
          title: "Clase abierta",
        },
        `${BASE_URL}/${EVENT_ID}?month=2026-05`
      );
    }

    it("returns the recomputed viewer streak with the updated occurrences", async () => {
      updateTribeEvent.mockResolvedValue({
        event,
        occurrences: [occurrence],
        status: "updated" as const,
      });
      getTribeEventAttendanceStreak.mockResolvedValue(streak);

      const response = await PATCH(buildPatchRequest(), buildEventContext());

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        attendanceStreak: streak,
        occurrences: [occurrence],
      });
      expect(getTribeEventAttendanceStreak).toHaveBeenCalledTimes(1);
      expect(getTribeEventAttendanceStreak).toHaveBeenCalledWith({
        tribeSlug: "matematica-pro",
      });
    });

    it("returns the recomputed viewer streak after creating an event", async () => {
      createTribeEvent.mockResolvedValue({
        event,
        occurrences: [occurrence],
        status: "created" as const,
      });
      getTribeEventAttendanceStreak.mockResolvedValue(streak);

      const response = await POST(
        buildRequest({
          startsAt: "2026-05-06T18:00:00.000Z",
          title: "Clase abierta",
        }),
        buildTribeContext()
      );

      expect(response.status).toBe(201);
      await expect(response.json()).resolves.toMatchObject({
        attendanceStreak: streak,
        occurrences: [occurrence],
      });
      expect(getTribeEventAttendanceStreak).toHaveBeenCalledTimes(1);
      expect(getTribeEventAttendanceStreak).toHaveBeenCalledWith({
        tribeSlug: "matematica-pro",
      });
    });

    it("keeps the creation successful and omits the streak when recomputing it fails", async () => {
      const streakError = new Error("history query failed");
      createTribeEvent.mockResolvedValue({
        event,
        occurrences: [occurrence],
        status: "created" as const,
      });
      getTribeEventAttendanceStreak.mockRejectedValue(streakError);

      const response = await POST(
        buildRequest({
          startsAt: "2026-05-06T18:00:00.000Z",
          title: "Clase abierta",
        }),
        buildTribeContext()
      );

      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body).toMatchObject({ occurrences: [occurrence] });
      expect(body).not.toHaveProperty("attendanceStreak");
      expect(logError).toHaveBeenCalledWith(
        expect.objectContaining({
          error: streakError,
          message: "Failed to recompute tribe event attendance streak after mutation",
          metadata: expect.objectContaining({
            eventId: EVENT_ID,
            slug: "matematica-pro",
            viewerId: "member-1",
          }),
        })
      );
    });

    it("does not recompute the streak when the creation is rejected", async () => {
      createTribeEvent.mockResolvedValue({ status: "forbidden" as const });

      const response = await POST(
        buildRequest({
          startsAt: "2026-05-06T18:00:00.000Z",
          title: "Clase abierta",
        }),
        buildTribeContext()
      );

      expect(response.status).toBe(403);
      expect(getTribeEventAttendanceStreak).not.toHaveBeenCalled();
    });

    it("returns the recomputed viewer streak after deleting a series", async () => {
      deleteTribeEvent.mockResolvedValue({ status: "deleted" as const });
      getTribeEventAttendanceStreak.mockResolvedValue(streak);

      const response = await DELETE(buildRequest(), buildEventContext());

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        attendanceStreak: streak,
        message: "Evento eliminado.",
      });
      expect(getTribeEventAttendanceStreak).toHaveBeenCalledTimes(1);
    });

    it("keeps the mutation successful and omits the streak when recomputing it fails", async () => {
      const streakError = new Error("history query failed");
      updateTribeEvent.mockResolvedValue({
        event,
        occurrences: [occurrence],
        status: "updated" as const,
      });
      deleteTribeEvent.mockResolvedValue({ status: "deleted" as const });
      getTribeEventAttendanceStreak.mockRejectedValue(streakError);

      const updateResponse = await PATCH(buildPatchRequest(), buildEventContext());
      const deleteResponse = await DELETE(buildRequest(), buildEventContext());

      expect(updateResponse.status).toBe(200);
      expect(deleteResponse.status).toBe(200);
      const updateBody = await updateResponse.json();
      const deleteBody = await deleteResponse.json();
      expect(updateBody).toMatchObject({ occurrences: [occurrence] });
      expect(updateBody).not.toHaveProperty("attendanceStreak");
      expect(deleteBody).toEqual({ message: "Evento eliminado." });
      expect(logError).toHaveBeenCalledTimes(2);
      expect(logError).toHaveBeenCalledWith(
        expect.objectContaining({
          error: streakError,
          message: "Failed to recompute tribe event attendance streak after mutation",
          metadata: expect.objectContaining({
            eventId: EVENT_ID,
            slug: "matematica-pro",
            viewerId: "member-1",
          }),
        })
      );
    });

    it("does not recompute the streak when the mutation is rejected", async () => {
      updateTribeEvent.mockResolvedValue({ status: "forbidden" as const });
      deleteTribeEvent.mockResolvedValue({ status: "not_found" as const });

      await PATCH(buildPatchRequest(), buildEventContext());
      await DELETE(buildRequest(), buildEventContext());

      expect(getTribeEventAttendanceStreak).not.toHaveBeenCalled();
    });
  });

  describe("attendance streak endpoint", () => {
    const streakUrl = `${BASE_URL}/attendance-streak`;

    function buildStreakContext(slug: string) {
      return { params: Promise.resolve({ slug }) };
    }

    it("returns only the public streak fields of the viewer", async () => {
      getTribeEventAttendanceStreak.mockResolvedValue({
        attendedCount: 3,
        internalNote: "not public",
        occurrenceCount: 5,
      });

      const response = await GET_ATTENDANCE_STREAK(
        buildRequest({}, streakUrl),
        buildStreakContext("matematica-pro")
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        attendanceStreak: { attendedCount: 3, occurrenceCount: 5 },
        attendanceStreakNextRefreshAt: null,
      });
      expect(getTribeEventAttendanceStreak).toHaveBeenCalledWith({
        tribeSlug: "matematica-pro",
      });
    });

    it("returns the next instant at which the streak can change", async () => {
      getTribeEventAttendanceStreakNextRefreshAt.mockResolvedValue("2026-06-01T05:00:00.000Z");

      const response = await GET_ATTENDANCE_STREAK(
        buildRequest({}, streakUrl),
        buildStreakContext("matematica-pro")
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        attendanceStreak: null,
        attendanceStreakNextRefreshAt: "2026-06-01T05:00:00.000Z",
      });
      expect(getTribeEventAttendanceStreakNextRefreshAt).toHaveBeenCalledWith({
        tribeSlug: "matematica-pro",
      });
    });

    it("still returns the streak when the next refresh instant cannot be computed", async () => {
      const nextRefreshError = new Error("upcoming query failed");
      getTribeEventAttendanceStreak.mockResolvedValue({ attendedCount: 3, occurrenceCount: 5 });
      getTribeEventAttendanceStreakNextRefreshAt.mockRejectedValue(nextRefreshError);

      const response = await GET_ATTENDANCE_STREAK(
        buildRequest({}, streakUrl),
        buildStreakContext("matematica-pro")
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toEqual({ attendanceStreak: { attendedCount: 3, occurrenceCount: 5 } });
      expect(body).not.toHaveProperty("attendanceStreakNextRefreshAt");
      expect(logError).toHaveBeenCalledWith(
        expect.objectContaining({
          error: nextRefreshError,
          message: "Tribe event attendance streak next refresh lookup failed",
          metadata: expect.objectContaining({
            slug: "matematica-pro",
            viewerId: "member-1",
          }),
        })
      );
    });

    it("returns null when the viewer has no streak", async () => {
      getTribeEventAttendanceStreak.mockResolvedValue(null);

      const response = await GET_ATTENDANCE_STREAK(
        buildRequest({}, streakUrl),
        buildStreakContext("matematica-pro")
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        attendanceStreak: null,
        attendanceStreakNextRefreshAt: null,
      });
    });

    it("requires a session", async () => {
      getAuthenticatedMember.mockResolvedValueOnce(null);

      const response = await GET_ATTENDANCE_STREAK(
        buildRequest({}, streakUrl),
        buildStreakContext("matematica-pro")
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({
        message: "Iniciá sesión para gestionar eventos.",
      });
      expect(getTribeEventAttendanceStreak).not.toHaveBeenCalled();
    });

    it("rejects a malformed tribe slug as not found before touching the session", async () => {
      const response = await GET_ATTENDANCE_STREAK(
        buildRequest({}, streakUrl),
        buildStreakContext("Matemática Pro!")
      );

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({
        message: "No pudimos encontrar la tribu.",
      });
      expect(createRequestModules).not.toHaveBeenCalled();
      expect(getTribeEventAttendanceStreak).not.toHaveBeenCalled();
    });

    it("logs failures and answers with a safe Spanish message", async () => {
      const streakError = new Error("history query failed");
      getTribeEventAttendanceStreak.mockRejectedValue(streakError);

      const response = await GET_ATTENDANCE_STREAK(
        buildRequest({}, streakUrl),
        buildStreakContext("matematica-pro")
      );

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({
        message: "No pudimos actualizar tu racha.",
      });
      expect(logError).toHaveBeenCalledWith(
        expect.objectContaining({
          error: streakError,
          message: "Tribe event attendance streak lookup failed",
          metadata: expect.objectContaining({
            slug: "matematica-pro",
            viewerId: "member-1",
          }),
        })
      );
    });
  });

  it("records the viewer attendance for an occurrence", async () => {
    setTribeEventAttendance.mockResolvedValue({
      attendance: { goingCount: 3, viewerStatus: "going" },
      status: "attendance_saved" as const,
    });

    const response = await PUT_ATTENDANCE(
      buildRequest(
        {
          occurrenceStartsAt: "2026-05-13T18:00:00.000Z",
          status: "going" as const,
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
      status: "going" as const,
      tribeSlug: "matematica-pro",
    });
  });

  it("maps attendance failures to safe responses", async () => {
    setTribeEventAttendance.mockResolvedValueOnce({ status: "forbidden" as const });

    const forbiddenResponse = await PUT_ATTENDANCE(
      buildRequest({}, `${BASE_URL}/${EVENT_ID}/attendance`),
      buildEventContext()
    );

    expect(forbiddenResponse.status).toBe(403);
    await expect(forbiddenResponse.json()).resolves.toEqual({
      message: "Solo los miembros activos pueden responder a un evento.",
    });

    setTribeEventAttendance.mockResolvedValueOnce({ status: "invalid_attendance" as const });

    const invalidResponse = await PUT_ATTENDANCE(
      buildRequest({}, `${BASE_URL}/${EVENT_ID}/attendance`),
      buildEventContext()
    );

    expect(invalidResponse.status).toBe(400);
  });

  it("answers 409 with a safe message when the occurrence already ended", async () => {
    setTribeEventAttendance.mockResolvedValueOnce({ status: "occurrence_ended" as const });
    clearTribeEventAttendance.mockResolvedValueOnce({ status: "occurrence_ended" as const });

    const putResponse = await PUT_ATTENDANCE(
      buildRequest(
        { occurrenceStartsAt: "2026-05-13T18:00:00.000Z", status: "going" as const },
        `${BASE_URL}/${EVENT_ID}/attendance`
      ),
      buildEventContext()
    );
    const deleteResponse = await DELETE_ATTENDANCE(
      buildRequest(
        {},
        `${BASE_URL}/${EVENT_ID}/attendance?occurrence=${encodeURIComponent(
          "2026-05-13T18:00:00.000Z"
        )}`
      ),
      buildEventContext()
    );

    for (const response of [putResponse, deleteResponse]) {
      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toEqual({
        code: "occurrence_ended",
        message: "Este evento ya terminó; no se pueden cambiar las respuestas.",
      });
    }
  });

  it("answers 409 asking to reload when the schedule changed during the answer", async () => {
    setTribeEventAttendance.mockResolvedValueOnce({ status: "schedule_changed" as const });
    clearTribeEventAttendance.mockResolvedValueOnce({ status: "schedule_changed" as const });

    const putResponse = await PUT_ATTENDANCE(
      buildRequest(
        { occurrenceStartsAt: "2026-05-13T18:00:00.000Z", status: "going" as const },
        `${BASE_URL}/${EVENT_ID}/attendance`
      ),
      buildEventContext()
    );
    const deleteResponse = await DELETE_ATTENDANCE(
      buildRequest(
        {},
        `${BASE_URL}/${EVENT_ID}/attendance?occurrence=${encodeURIComponent(
          "2026-05-13T18:00:00.000Z"
        )}`
      ),
      buildEventContext()
    );

    for (const response of [putResponse, deleteResponse]) {
      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toEqual({
        message: "El evento cambió; recargá para ver las fechas actualizadas.",
      });
    }
  });

  it("clears the viewer attendance for the occurrence in the query", async () => {
    clearTribeEventAttendance.mockResolvedValue({
      attendance: { goingCount: 2, viewerStatus: null },
      status: "attendance_cleared" as const,
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

  it("rejects an invalid capacity with a safe Spanish message", async () => {
    createTribeEvent.mockResolvedValueOnce({ status: "invalid_capacity" as const });

    const response = await POST(buildRequest({ capacity: "0" }), buildTribeContext());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "Ingresá un cupo entre 1 y 10000, o dejalo vacío para no limitarlo.",
    });
    expect(createTribeEvent).toHaveBeenCalledWith(expect.objectContaining({ capacity: "0" }));
  });

  describe("capacity body field", () => {
    const INVALID_CAPACITY_MESSAGE =
      "Ingresá un cupo entre 1 y 10000, o dejalo vacío para no limitarlo.";
    const EVENT_URL = `${BASE_URL}/${EVENT_ID}?month=2026-05`;
    const UNSUPPORTED_CAPACITY_VALUES: Array<[string, unknown]> = [
      ["a fractional number", 12.5],
      ["a boolean", true],
      ["an object", { value: 12 }],
      ["an array", [12]],
      ["a non-finite number", Number.POSITIVE_INFINITY],
    ];

    // Decision: a JSON integer (the natural form `"capacity": 12`) is accepted
    // and forwarded as its decimal text, so the use case keeps owning the
    // 1..10000 business range. Absent, null, and "" keep meaning "no limit".
    it("forwards a JSON integer capacity to the use case on POST and PATCH", async () => {
      createTribeEvent.mockResolvedValueOnce({
        event,
        occurrences: [occurrence],
        status: "created" as const,
      });
      updateTribeEvent.mockResolvedValueOnce({
        event,
        occurrences: [occurrence],
        status: "updated" as const,
      });

      const createResponse = await POST(buildRequest({ capacity: 12 }), buildTribeContext());
      const updateResponse = await PATCH(
        buildRequest({ capacity: 30 }, EVENT_URL),
        buildEventContext()
      );

      expect(createResponse.status).toBe(201);
      expect(updateResponse.status).toBe(200);
      expect(createTribeEvent).toHaveBeenCalledWith(expect.objectContaining({ capacity: "12" }));
      expect(updateTribeEvent).toHaveBeenCalledWith(expect.objectContaining({ capacity: "30" }));
    });

    it("keeps null and absent capacity as unlimited", async () => {
      createTribeEvent.mockResolvedValue({
        event,
        occurrences: [occurrence],
        status: "created" as const,
      });

      await POST(buildRequest({ capacity: null }), buildTribeContext());
      await POST(buildRequest({}), buildTribeContext());

      expect(createTribeEvent).toHaveBeenNthCalledWith(1, expect.objectContaining({ capacity: "" }));
      expect(createTribeEvent).toHaveBeenNthCalledWith(2, expect.objectContaining({ capacity: "" }));
    });

    it.each(UNSUPPORTED_CAPACITY_VALUES)(
      "rejects %s capacity on POST instead of creating an unlimited event",
      async (_label, capacity) => {
        const response = await POST(buildRequest({ capacity }), buildTribeContext());

        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toEqual({ message: INVALID_CAPACITY_MESSAGE });
        expect(createTribeEvent).not.toHaveBeenCalled();
      }
    );

    it.each(UNSUPPORTED_CAPACITY_VALUES)(
      "rejects %s capacity on PATCH instead of removing the existing limit",
      async (_label, capacity) => {
        const response = await PATCH(
          buildRequest({ capacity }, EVENT_URL),
          buildEventContext()
        );

        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toEqual({ message: INVALID_CAPACITY_MESSAGE });
        expect(updateTribeEvent).not.toHaveBeenCalled();
      }
    );
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
        { occurrenceStartsAt: "2026-05-13T18:00:00.000Z", status: "going" },
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
      occurrenceStartsAt: "2026-05-13T18:00:00.000Z",
      trend: [],
    };
    const reportUrl = `${BASE_URL}/${EVENT_ID}/attendance?occurrence=${encodeURIComponent(
      "2026-05-13T18:00:00.000Z"
    )}`;
    const exportUrl = `${BASE_URL}/${EVENT_ID}/attendance/export?occurrence=${encodeURIComponent(
      "2026-05-13T18:00:00.000Z"
    )}`;

    it("returns the manager report as JSON", async () => {
      getTribeEventAttendanceReport.mockResolvedValue({ report, status: "found" as const });

      const response = await GET_ATTENDANCE(buildRequest({}, reportUrl), buildEventContext());

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ report });
      expect(getTribeEventAttendanceReport).toHaveBeenCalledWith({
        eventId: EVENT_ID,
        occurrenceStartsAt: "2026-05-13T18:00:00.000Z",
        tribeSlug: "matematica-pro",
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
});
