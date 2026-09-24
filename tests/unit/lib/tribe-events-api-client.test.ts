import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import {
  deleteTribeEventRequest,
  fetchTribeEventAttendanceReportRequest,
  fetchTribeEventAttendanceStreakRequest,
  saveTribeEventAttendanceRequest,
  saveTribeEventRequest,
} from "@/lib/events/tribe-events-api-client";

const EVENT_ID = "6f3c7a1e-2b4d-4c8e-9f10-1a2b3c4d5e6f";
const STARTS_AT = "2026-05-06T18:00:00.000Z";

const attendance = {
  goingCount: 3,
  goingPreview: [{ id: "member-1", image: null, name: "Ana" }],
  maybeCount: 1,
  viewerStatus: "going",
  viewerWaitlistPosition: null,
  waitlistedCount: 0,
};
const occurrence = {
  attendance,
  capacity: 20,
  description: null,
  endsAt: null,
  eventId: EVENT_ID,
  meetingUrl: null,
  eventType: "live",
  exception: null,
  occurrenceKey: `${EVENT_ID}@${STARTS_AT}`,
  originalStartsAt: STARTS_AT,
  recurrenceFrequency: "weekly",
  recurrenceRule: "FREQ=WEEKLY",
  recurrenceUntil: null,
  seriesEndsAt: null,
  seriesStartsAt: STARTS_AT,
  startsAt: STARTS_AT,
  title: "Clase abierta",
};
const event = {
  capacity: 20,
  description: null,
  endsAt: null,
  eventType: "live",
  id: EVENT_ID,
  meetingUrl: null,
  recurrenceFrequency: "weekly",
  recurrenceRule: "FREQ=WEEKLY",
  recurrenceUntil: null,
  startsAt: STARTS_AT,
  title: "Clase abierta",
};
const savePayload = {
  capacity: "20",
  description: "",
  endsAt: "",
  meetingUrl: "",
  recurrenceFrequency: "weekly",
  recurrenceUntil: "",
  startsAt: STARTS_AT,
  title: "Clase abierta",
};

/**
 * Answers the next request with a real `Response` so the adapter reads the
 * body exactly as in the browser.
 */
function respondWith(body: unknown, status = 200) {
  (globalThis.fetch as Mock).mockResolvedValueOnce(
    new Response(typeof body === "string" ? body : JSON.stringify(body), {
      headers: { "Content-Type": "application/json" },
      status,
    })
  );
}

describe("tribe events API client", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    // `fetch` is the transport port of this adapter; the DTO guard runs for real.
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("save event", () => {
    it("returns the occurrences of a valid DTO", async () => {
      respondWith({ event, message: "Evento creado.", occurrences: [occurrence] }, 201);

      await expect(
        saveTribeEventRequest({
          eventId: null,
          month: "2026-05",
          payload: savePayload,
          tribeSlug: "matematica-pro",
        })
      ).resolves.toEqual({
        isSuccess: true,
        message: "Evento creado.",
        occurrences: [occurrence],
      });
    });

    it("drops fields outside the public contract", async () => {
      respondWith(
        {
          event,
          message: "Evento creado.",
          occurrences: [{ ...occurrence, createdBy: "user-secret-id" }],
        },
        201
      );

      const result = await saveTribeEventRequest({
        eventId: null,
        month: "2026-05",
        payload: savePayload,
        tribeSlug: "matematica-pro",
      });

      expect(JSON.stringify(result)).not.toContain("user-secret-id");
    });

    it("rejects a 2xx body that breaks the contract without exposing its content", async () => {
      respondWith(
        {
          event,
          message: "stack trace at db.ts:42",
          occurrences: [{ ...occurrence, recurrenceFrequency: "daily" }],
        },
        201
      );

      await expect(
        saveTribeEventRequest({
          eventId: EVENT_ID,
          month: "2026-05",
          payload: savePayload,
          tribeSlug: "matematica-pro",
        })
      ).resolves.toEqual({ isSuccess: false, message: null });
    });

    it("returns the safe message of a failed request", async () => {
      respondWith({ message: "No tenés permisos para gestionar eventos." }, 403);

      await expect(
        saveTribeEventRequest({
          eventId: null,
          month: "2026-05",
          payload: savePayload,
          tribeSlug: "matematica-pro",
        })
      ).resolves.toEqual({
        isSuccess: false,
        message: "No tenés permisos para gestionar eventos.",
      });
    });

    it("yields no message for failures without a usable body", async () => {
      for (const [body, status] of [
        ["<html>Bad gateway</html>", 502],
        [{ message: 42, stack: "Error: boom" }, 500],
        [{ error: "internal" }, 500],
      ] as const) {
        respondWith(body, status);

        await expect(
          saveTribeEventRequest({
            eventId: null,
            month: "2026-05",
            payload: savePayload,
            tribeSlug: "matematica-pro",
          })
        ).resolves.toEqual({ isSuccess: false, message: null });
      }
    });
  });

  describe("attendance", () => {
    it("returns the fresh summary of a valid DTO", async () => {
      respondWith({ attendance, message: "Respuesta guardada." });

      await expect(
        saveTribeEventAttendanceRequest({
          occurrence: { eventId: EVENT_ID, originalStartsAt: STARTS_AT },
          status: "going",
          tribeSlug: "matematica-pro",
        })
      ).resolves.toEqual({ attendance, isSuccess: true, message: "Respuesta guardada." });
    });

    it("rejects a summary with an unknown status", async () => {
      respondWith({ attendance: { ...attendance, viewerStatus: "vip" }, message: "ok" });

      await expect(
        saveTribeEventAttendanceRequest({
          occurrence: { eventId: EVENT_ID, originalStartsAt: STARTS_AT },
          status: null,
          tribeSlug: "matematica-pro",
        })
      ).resolves.toEqual({ isSuccess: false, message: null });
    });
  });

  describe("attendance report", () => {
    const report = {
      attendeeGroups: {
        going: [{ name: "Ana", respondedAt: "2026-05-01T12:00:00.000Z", status: "going" }],
        maybe: [],
        notGoing: [],
        waitlisted: [],
      },
      eventTitle: "Clase abierta",
      occurrenceStartsAt: STARTS_AT,
      trend: [{ goingCount: 4, occurrenceStartsAt: "2026-04-29T18:00:00.000Z" }],
    };

    it("returns a valid report", async () => {
      respondWith({ report });

      await expect(
        fetchTribeEventAttendanceReportRequest({
          eventId: EVENT_ID,
          occurrenceStartsAt: STARTS_AT,
          tribeSlug: "matematica-pro",
        })
      ).resolves.toEqual({ isSuccess: true, message: null, report });
    });

    it("rejects a report whose groups are missing", async () => {
      respondWith({ report: { eventTitle: "Clase abierta" } });

      await expect(
        fetchTribeEventAttendanceReportRequest({
          eventId: EVENT_ID,
          occurrenceStartsAt: STARTS_AT,
          tribeSlug: "matematica-pro",
        })
      ).resolves.toEqual({ isSuccess: false, message: null });
    });
  });

  describe("delete event", () => {
    it("returns the route message on success", async () => {
      respondWith({ message: "Evento eliminado." });

      await expect(
        deleteTribeEventRequest({ eventId: EVENT_ID, tribeSlug: "matematica-pro" })
      ).resolves.toEqual({ isSuccess: true, message: "Evento eliminado." });
    });

    it("treats a success without a usable message as a failure", async () => {
      respondWith({ ok: true });

      await expect(
        deleteTribeEventRequest({ eventId: EVENT_ID, tribeSlug: "matematica-pro" })
      ).resolves.toEqual({ isSuccess: false, message: null });
    });

    it("returns the refreshed streak, including null for no streak", async () => {
      respondWith({ attendanceStreak: null, message: "Evento eliminado." });

      await expect(
        deleteTribeEventRequest({ eventId: EVENT_ID, tribeSlug: "matematica-pro" })
      ).resolves.toEqual({ attendanceStreak: null, isSuccess: true, message: "Evento eliminado." });
    });
  });

  describe("attendance streak refresh", () => {
    it("applies a valid streak from a save response", async () => {
      respondWith({
        attendanceStreak: { attendedCount: 2, occurrenceCount: 5 },
        event,
        message: "Evento creado.",
        occurrences: [],
      });

      await expect(
        saveTribeEventRequest({
          eventId: null,
          month: "2026-05",
          payload: savePayload,
          tribeSlug: "matematica-pro",
        })
      ).resolves.toEqual({
        attendanceStreak: { attendedCount: 2, occurrenceCount: 5 },
        isSuccess: true,
        message: "Evento creado.",
        occurrences: [],
      });
    });

    it("drops an unusable streak but keeps the successful save", async () => {
      respondWith({
        attendanceStreak: { attendedCount: "2" },
        event,
        message: "Evento creado.",
        occurrences: [],
      });

      const result = await saveTribeEventRequest({
        eventId: null,
        month: "2026-05",
        payload: savePayload,
        tribeSlug: "matematica-pro",
      });

      expect(result).toEqual({ isSuccess: true, message: "Evento creado.", occurrences: [] });
      expect(result).not.toHaveProperty("attendanceStreak");
    });

    it("reads the streak endpoint and ignores unusable bodies or failures", async () => {
      respondWith({ attendanceStreak: { attendedCount: 3, occurrenceCount: 5 } });
      respondWith({ attendanceStreak: { attendedCount: -1, occurrenceCount: 5 } });
      respondWith({ message: "No pudimos actualizar tu racha." }, 500);

      await expect(
        fetchTribeEventAttendanceStreakRequest({ tribeSlug: "matematica-pro" })
      ).resolves.toEqual({ attendanceStreak: { attendedCount: 3, occurrenceCount: 5 } });
      await expect(
        fetchTribeEventAttendanceStreakRequest({ tribeSlug: "matematica-pro" })
      ).resolves.toEqual({});
      await expect(
        fetchTribeEventAttendanceStreakRequest({ tribeSlug: "matematica-pro" })
      ).resolves.toEqual({});
    });
  });
});
