import { vi, describe, it, expect, beforeEach, afterEach, type Mock } from "vitest";
import { PostgresTribeEventRepository } from "@/src/modules/events/infrastructure/repositories/postgres-tribe-event-repository";

const EVENT_ID = "6f3c7a1e-2b4d-4c8e-9f10-1a2b3c4d5e6f";

function getSqlText(statement: unknown): string {
  return ((statement as { queryChunks?: unknown[] }).queryChunks ?? [])
    .map((chunk) => {
      if (typeof chunk === "string") {
        return chunk;
      }

      if (
        chunk &&
        typeof chunk === "object" &&
        "value" in chunk &&
        Array.isArray((chunk as { value: unknown }).value)
      ) {
        return (chunk as { value: string[] }).value.join("");
      }

      if (chunk && typeof chunk === "object" && "queryChunks" in chunk) {
        return getSqlText(chunk);
      }

      return "";
    })
    .join("");
}

function createRepository(execute: Mock) {
  return new PostgresTribeEventRepository(async (callback) =>
    callback({ execute } as never)
  );
}

const eventRow = {
  can_manage_events: true,
  capacity: null,
  description: "Repaso mensual",
  ends_at: "2026-05-06T19:00:00.000Z",
  id: EVENT_ID,
  meeting_url: "https://meet.google.com/abc-defg-hij",
  recurrence_frequency: "weekly",
  recurrence_until: null,
  starts_at: "2026-05-06T18:00:00.000Z",
  title: "Clase abierta",
};

describe("PostgresTribeEventRepository", () => {
  it("lists series intersecting the range with attendance summaries and viewer permissions", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [eventRow] })
      .mockResolvedValueOnce({
        rows: [
          {
            event_id: EVENT_ID,
            going_count: "2",
            going_preview: [],
            maybe_count: "0",
            occurrence_starts_at: new Date("2026-05-13T18:00:00.000Z"),
            viewer_status: "going",
            viewer_waitlist_position: null,
            waitlisted_count: "0",
          },
        ],
      });
    const repository = createRepository(execute);

    await expect(
      repository.listByTribeRange({
        rangeEnd: "2026-06-01T03:00:00.000Z",
        rangeStart: "2026-05-01T03:00:00.000Z",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      attendances: [
        {
          eventId: EVENT_ID,
          goingCount: 2,
          goingPreview: [],
          maybeCount: 0,
          occurrenceStartsAt: "2026-05-13T18:00:00.000Z",
          viewerStatus: "going",
          viewerWaitlistPosition: null,
          waitlistedCount: 0,
        },
      ],
      events: [
        {
          capacity: null,
          description: "Repaso mensual",
          endsAt: "2026-05-06T19:00:00.000Z",
          id: EVENT_ID,
          meetingUrl: "https://meet.google.com/abc-defg-hij",
          recurrenceFrequency: "weekly",
          recurrenceUntil: null,
          startsAt: "2026-05-06T18:00:00.000Z",
          title: "Clase abierta",
        },
      ],
      viewerPermissions: { canManageEvents: true },
    });

    const eventsSql = getSqlText(execute.mock.calls[0]?.[0]);
    const attendanceSql = getSqlText(execute.mock.calls[1]?.[0]);

    expect(eventsSql).toContain("public.can_manage_tribe_events");
    expect(eventsSql).toContain("public.can_read_tribe_content(target_tribe.id)");
    expect(eventsSql).toContain("events.recurrence_until is null");
    expect(eventsSql).toContain("order by event_rows.starts_at asc");
    expect(attendanceSql).toContain("from public.event_attendances");
    expect(attendanceSql).toContain("public.current_app_user_id()");
  });

  it("keeps viewer permissions and skips the attendance query when the range has no events", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({
      rows: [
        {
          can_manage_events: true,
          capacity: null,
          description: null,
          ends_at: null,
          id: null,
          meeting_url: null,
          recurrence_frequency: null,
          recurrence_until: null,
          starts_at: null,
          title: null,
        },
      ],
    }); });
    const repository = createRepository(execute);

    await expect(
      repository.listByTribeRange({
        rangeEnd: "2026-06-01T03:00:00.000Z",
        rangeStart: "2026-05-01T03:00:00.000Z",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      attendances: [],
      events: [],
      viewerPermissions: { canManageEvents: true },
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("finds a single event readable by the viewer", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({ rows: [eventRow] }); });
    const repository = createRepository(execute);

    await expect(
      repository.findById({ eventId: EVENT_ID, tribeSlug: "matematica-pro" })
    ).resolves.toMatchObject({ id: EVENT_ID, recurrenceFrequency: "weekly" });
    expect(getSqlText(execute.mock.calls[0]?.[0])).toContain(
      "public.can_read_tribe_content(tribes.id)"
    );

    execute.mockResolvedValueOnce({ rows: [] });

    await expect(
      repository.findById({ eventId: EVENT_ID, tribeSlug: "matematica-pro" })
    ).resolves.toBeNull();
  });

  it("creates events guarded by leader or guardian membership", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({
      rows: [{ ...eventRow, can_manage_events: undefined, status: "created" as const }],
    }); });
    const repository = createRepository(execute);

    await expect(
      repository.create({
        capacity: null,
        description: null,
        endsAt: null,
        meetingUrl: "https://meet.google.com/abc-defg-hij",
        recurrenceFrequency: "weekly",
        recurrenceUntil: null,
        startsAt: "2026-05-06T18:00:00.000Z",
        title: "Clase abierta",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toMatchObject({
      event: { id: EVENT_ID, recurrenceFrequency: "weekly", title: "Clase abierta" },
      status: "created" as const,
    });

    const sqlText = getSqlText(execute.mock.calls[0]?.[0]);

    expect(sqlText).toContain("insert into public.events");
    expect(sqlText).toContain("recurrence_frequency");
    expect(sqlText).toContain("public.can_manage_tribe_events");
  });

  it("maps update failures to not found or forbidden", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({ rows: [{ status: "not_found" as const }] }); });
    const repository = createRepository(execute);

    await expect(
      repository.update({
        attendanceRange: null,
        capacity: null,
        description: null,
        endsAt: null,
        eventId: EVENT_ID,
        meetingUrl: null,
        recurrenceFrequency: "none",
        recurrenceUntil: null,
        startsAt: "2026-05-06T18:00:00.000Z",
        title: "Clase abierta",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({ status: "not_found" as const });

    execute.mockResolvedValueOnce({ rows: [] });

    await expect(
      repository.delete({ eventId: EVENT_ID, tribeSlug: "matematica-pro" })
    ).resolves.toEqual({ status: "forbidden" as const });
  });

  it("answers through the definer function and returns the fresh occurrence summary", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [{ attendance_status: "waitlisted", outcome: "saved", promoted_count: 0 }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            event_id: EVENT_ID,
            going_count: "5",
            going_preview: [
              { id: "user-ana", image: "https://example.test/ana.png", name: "Ana" },
              { id: "user-beto", image: null, name: "Beto" },
              { name: "sin id" },
            ],
            maybe_count: "1",
            occurrence_starts_at: "2026-05-13T18:00:00.000Z",
            viewer_status: "waitlisted",
            viewer_waitlist_position: "2",
            waitlisted_count: "2",
          },
        ],
      });
    const repository = createRepository(execute);

    await expect(
      repository.setAttendance({
        eventId: EVENT_ID,
        occurrenceStartsAt: "2026-05-13T18:00:00.000Z",
        status: "going",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      attendance: {
        goingCount: 5,
        goingPreview: [
          { id: "user-ana", image: "https://example.test/ana.png", name: "Ana" },
          { id: "user-beto", image: null, name: "Beto" },
        ],
        maybeCount: 1,
        viewerStatus: "waitlisted",
        viewerWaitlistPosition: 2,
        waitlistedCount: 2,
      },
      status: "attendance_saved",
    });
    expect(getSqlText(execute.mock.calls[0]?.[0])).toContain(
      "public.respond_to_tribe_event_occurrence("
    );
  });

  it("clears the answer and reports an empty summary when nobody else answered", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [{ attendance_status: null, outcome: "cleared", promoted_count: 1 }],
      })
      .mockResolvedValueOnce({ rows: [] });
    const repository = createRepository(execute);

    await expect(
      repository.clearAttendance({
        eventId: EVENT_ID,
        occurrenceStartsAt: "2026-05-13T18:00:00.000Z",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      attendance: {
        goingCount: 0,
        goingPreview: [],
        maybeCount: 0,
        viewerStatus: null,
        viewerWaitlistPosition: null,
        waitlistedCount: 0,
      },
      status: "attendance_cleared",
    });
  });

  it("maps definer function refusals without reading the summary", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [{ attendance_status: null, outcome: "forbidden", promoted_count: 0 }],
      })
      .mockResolvedValueOnce({
        rows: [{ attendance_status: null, outcome: "not_found", promoted_count: 0 }],
      })
      .mockResolvedValueOnce({
        rows: [{ attendance_status: null, outcome: "ended", promoted_count: 0 }],
      })
      .mockResolvedValueOnce({
        rows: [{ attendance_status: null, outcome: "ended", promoted_count: 0 }],
      });
    const repository = createRepository(execute);
    const key = {
      eventId: EVENT_ID,
      occurrenceStartsAt: "2026-05-13T18:00:00.000Z",
      tribeSlug: "matematica-pro",
    };

    await expect(repository.setAttendance({ ...key, status: "maybe" })).resolves.toEqual({
      status: "forbidden",
    });
    await expect(repository.clearAttendance(key)).resolves.toEqual({ status: "not_found" });
    // Defense in depth: the definer function also refuses finished occurrences.
    await expect(repository.setAttendance({ ...key, status: "going" })).resolves.toEqual({
      status: "occurrence_ended",
    });
    await expect(repository.clearAttendance(key)).resolves.toEqual({
      status: "occurrence_ended",
    });
    expect(execute).toHaveBeenCalledTimes(4);
  });

  describe("waitlist refill after an update", () => {
    const updateCommand = {
      attendanceRange: null,
      capacity: 12,
      description: null,
      endsAt: "2026-05-06T19:00:00.000Z",
      eventId: EVENT_ID,
      meetingUrl: null,
      recurrenceFrequency: "weekly" as const,
      recurrenceUntil: null,
      startsAt: "2026-05-06T18:00:00.000Z",
      title: "Clase abierta",
      tribeSlug: "matematica-pro",
    };

    beforeEach(() => {
      // Wednesday 2026-05-13 18:30Z: that weekly occurrence is in progress.
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-05-13T18:30:00.000Z"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("refills only waitlists of valid, not yet ended occurrences in the same transaction", async () => {
      const execute = vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ ...eventRow, capacity: 12, status: "updated" }] })
        .mockResolvedValueOnce({
          rows: [
            // In progress under the updated schedule: refilled.
            { occurrence_starts_at: new Date("2026-05-13T18:00:00.000Z") },
            // Future slot of the updated schedule: refilled.
            { occurrence_starts_at: "2026-05-20T18:00:00.000Z" },
            // Old Tuesday slot that the edit removed: kept as history.
            { occurrence_starts_at: new Date("2026-05-19T18:00:00.000Z") },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ promoted_count: 2 }] });
      const repository = createRepository(execute);

      await expect(repository.update(updateCommand)).resolves.toMatchObject({
        attendances: [],
        event: { capacity: 12 },
        status: "updated",
      });

      const candidateSql = getSqlText(execute.mock.calls[1]?.[0]);
      const refillSql = getSqlText(execute.mock.calls[2]?.[0]);

      expect(candidateSql).toContain("event_attendances.status =");
      // Lower bound = now minus one occurrence duration (one hour).
      expect(candidateSql).toContain("2026-05-13T17:30:00.000Z");
      expect(refillSql).toContain("public.refill_tribe_event_waitlists(");
      expect(refillSql).toContain("2026-05-13T18:00:00.000Z");
      expect(refillSql).toContain("2026-05-20T18:00:00.000Z");
      expect(refillSql).not.toContain("2026-05-19T18:00:00.000Z");
      expect(execute).toHaveBeenCalledTimes(3);
    });

    it("skips the refill call when no waitlisted occurrence is still valid", async () => {
      const execute = vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ ...eventRow, capacity: 12, status: "updated" }] })
        .mockResolvedValueOnce({
          rows: [{ occurrence_starts_at: "2026-05-19T18:00:00.000Z" }],
        });
      const repository = createRepository(execute);

      await expect(repository.update(updateCommand)).resolves.toMatchObject({
        attendances: [],
        status: "updated",
      });
      expect(execute).toHaveBeenCalledTimes(2);
    });
  });

  it("reads the event attendance summaries of the range after the refill", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ ...eventRow, capacity: 12, status: "updated" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            event_id: EVENT_ID,
            going_count: "12",
            going_preview: [],
            maybe_count: "0",
            occurrence_starts_at: new Date("2026-05-13T18:00:00.000Z"),
            viewer_status: "going",
            viewer_waitlist_position: null,
            waitlisted_count: "0",
          },
        ],
      });
    const repository = createRepository(execute);

    await expect(
      repository.update({
        attendanceRange: {
          rangeEnd: "2026-06-01T03:00:00.000Z",
          rangeStart: "2026-05-01T03:00:00.000Z",
        },
        capacity: 12,
        description: null,
        endsAt: null,
        eventId: EVENT_ID,
        meetingUrl: null,
        recurrenceFrequency: "weekly",
        recurrenceUntil: null,
        startsAt: "2026-05-06T18:00:00.000Z",
        title: "Clase abierta",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toMatchObject({
      attendances: [
        {
          eventId: EVENT_ID,
          goingCount: 12,
          occurrenceStartsAt: "2026-05-13T18:00:00.000Z",
          viewerStatus: "going",
          viewerWaitlistPosition: null,
          waitlistedCount: 0,
        },
      ],
      status: "updated",
    });
    // Update, waitlist candidates (none), then the range summary.
    expect(execute).toHaveBeenCalledTimes(3);
    expect(getSqlText(execute.mock.calls[2]?.[0])).toContain(
      "and event_attendances.event_id ="
    );
  });

  it("skips the refill and the summary read when the update is rejected", async () => {
    const execute = vi.fn().mockResolvedValueOnce({ rows: [{ status: "forbidden" }] });
    const repository = createRepository(execute);

    await expect(
      repository.update({
        attendanceRange: {
          rangeEnd: "2026-06-01T03:00:00.000Z",
          rangeStart: "2026-05-01T03:00:00.000Z",
        },
        capacity: 12,
        description: null,
        endsAt: null,
        eventId: EVENT_ID,
        meetingUrl: null,
        recurrenceFrequency: "weekly",
        recurrenceUntil: null,
        startsAt: "2026-05-06T18:00:00.000Z",
        title: "Clase abierta",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({ status: "forbidden" });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("returns the manager report with attendees and trend, or the access failure", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ status: "found" }] })
      .mockResolvedValueOnce({
        rows: [
          { name: "Ana", responded_at: new Date("2026-05-10T12:00:00.000Z"), status: "going" },
          { name: "Beto", responded_at: "2026-05-10T13:00:00.000Z", status: "waitlisted" },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ going_count: "4", occurrence_starts_at: new Date("2026-05-06T18:00:00.000Z") }],
      })
      .mockResolvedValueOnce({ rows: [{ status: "forbidden" }] });
    const repository = createRepository(execute);
    const query = {
      eventId: EVENT_ID,
      occurrenceStartsAt: "2026-05-13T18:00:00.000Z",
      trendOccurrenceStartsAts: ["2026-05-06T18:00:00.000Z"],
      tribeSlug: "matematica-pro",
    };

    await expect(repository.getOccurrenceAttendanceReport(query)).resolves.toEqual({
      attendees: [
        { name: "Ana", respondedAt: "2026-05-10T12:00:00.000Z", status: "going" },
        { name: "Beto", respondedAt: "2026-05-10T13:00:00.000Z", status: "waitlisted" },
      ],
      status: "found",
      trend: [{ goingCount: 4, occurrenceStartsAt: "2026-05-06T18:00:00.000Z" }],
    });
    await expect(repository.getOccurrenceAttendanceReport(query)).resolves.toEqual({
      status: "forbidden",
    });
    expect(execute).toHaveBeenCalledTimes(4);
  });

  it("returns the viewer history with only recognized statuses", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [eventRow] })
      .mockResolvedValueOnce({
        rows: [
          { event_id: EVENT_ID, occurrence_starts_at: "2026-05-13T18:00:00.000Z", status: "going" },
          { event_id: EVENT_ID, occurrence_starts_at: "2026-05-20T18:00:00.000Z", status: "unknown" },
        ],
      });
    const repository = createRepository(execute);

    await expect(
      repository.listViewerAttendanceHistory({
        rangeEnd: "2026-06-01T03:00:00.000Z",
        rangeStart: "2026-01-01T03:00:00.000Z",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toMatchObject({
      events: [{ id: EVENT_ID }],
      viewerAttendances: [
        { eventId: EVENT_ID, occurrenceStartsAt: "2026-05-13T18:00:00.000Z", status: "going" },
      ],
    });
  });
});
