import { vi, describe, it, expect, type Mock } from "vitest";
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
            occurrence_starts_at: new Date("2026-05-13T18:00:00.000Z"),
            viewer_status: "going",
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
          occurrenceStartsAt: "2026-05-13T18:00:00.000Z",
          viewerStatus: "going",
        },
      ],
      events: [
        {
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

  it("upserts the viewer attendance and adds the own vote to the going count", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({
      rows: [{ other_going_count: "2", status: "attendance_saved" as const }],
    }); });
    const repository = createRepository(execute);

    await expect(
      repository.setAttendance({
        eventId: EVENT_ID,
        occurrenceStartsAt: "2026-05-13T18:00:00.000Z",
        status: "going" as const,
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      attendance: { goingCount: 3, viewerStatus: "going" },
      status: "attendance_saved" as const,
    });

    const sqlText = getSqlText(execute.mock.calls[0]?.[0]);

    expect(sqlText).toContain("insert into public.event_attendances");
    expect(sqlText).toContain("on conflict (event_id, occurrence_starts_at, user_id)");
    expect(sqlText).toContain("public.is_active_tribe_member(target_event.tribe_id)");

    execute.mockResolvedValueOnce({
      rows: [{ other_going_count: 2, status: "attendance_saved" as const }],
    });

    await expect(
      repository.setAttendance({
        eventId: EVENT_ID,
        occurrenceStartsAt: "2026-05-13T18:00:00.000Z",
        status: "not_going" as const,
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      attendance: { goingCount: 2, viewerStatus: "not_going" },
      status: "attendance_saved" as const,
    });
  });

  it("clears the viewer attendance and reports forbidden for inactive members", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({
      rows: [{ other_going_count: 1, status: "attendance_cleared" as const }],
    }); });
    const repository = createRepository(execute);

    await expect(
      repository.clearAttendance({
        eventId: EVENT_ID,
        occurrenceStartsAt: "2026-05-13T18:00:00.000Z",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      attendance: { goingCount: 1, viewerStatus: null },
      status: "attendance_cleared" as const,
    });
    expect(getSqlText(execute.mock.calls[0]?.[0])).toContain(
      "delete from public.event_attendances"
    );

    execute.mockResolvedValueOnce({
      rows: [{ other_going_count: 1, status: "forbidden" as const }],
    });

    await expect(
      repository.clearAttendance({
        eventId: EVENT_ID,
        occurrenceStartsAt: "2026-05-13T18:00:00.000Z",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({ status: "forbidden" as const });
  });
});
