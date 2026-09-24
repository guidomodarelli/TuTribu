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

const weeklySchedule = {
  endsAt: "2026-05-06T19:00:00.000Z",
  recurrenceFrequency: "weekly" as const,
  recurrenceUntil: null,
  startsAt: "2026-05-06T18:00:00.000Z",
};

function getSqlParams(statement: unknown): unknown[] {
  return ((statement as { queryChunks?: unknown[] }).queryChunks ?? []).flatMap((chunk) => {
    if (chunk && typeof chunk === "object" && "queryChunks" in chunk) {
      return getSqlParams(chunk);
    }

    if (
      chunk &&
      typeof chunk === "object" &&
      "value" in chunk &&
      Array.isArray((chunk as { value: unknown }).value)
    ) {
      return [];
    }

    // Template text is a StringChunk (handled above); anything else is a
    // bound parameter value.
    return [chunk];
  });
}

/** Event row as locked `FOR UPDATE` before the UPDATE (capacity 10). */
const lockedEventRow = {
  capacity: 10,
  ends_at: new Date("2026-05-06T19:00:00.000Z"),
  recurrence_frequency: "weekly",
  recurrence_until: null,
  starts_at: new Date("2026-05-06T18:00:00.000Z"),
};

const eventRow = {
  can_manage_events: true,
  can_propose_events: false,
  event_type: "live",
  pending_proposal_count: "0",
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
      .mockResolvedValueOnce({ rows: [] })
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
          eventType: "live",
          id: EVENT_ID,
          meetingUrl: "https://meet.google.com/abc-defg-hij",
          recurrenceFrequency: "weekly",
          recurrenceUntil: null,
          startsAt: "2026-05-06T18:00:00.000Z",
          title: "Clase abierta",
        },
      ],
      exceptions: [],
      pendingProposalCount: 0,
      viewerPermissions: { canManageEvents: true, canProposeEvents: false },
    });

    const eventsSql = getSqlText(execute.mock.calls[0]?.[0]);
    const exceptionsSql = getSqlText(execute.mock.calls[1]?.[0]);
    const attendanceSql = getSqlText(execute.mock.calls[2]?.[0]);

    expect(eventsSql).toContain("public.can_manage_tribe_events");
    expect(eventsSql).toContain("public.can_read_tribe_content(target_tribe.id)");
    expect(eventsSql).toContain("events.recurrence_until is null");
    expect(eventsSql).toContain("order by event_rows.starts_at asc");
    expect(exceptionsSql).toContain("from public.event_occurrence_exceptions");
    expect(exceptionsSql).toContain("public.can_read_tribe_content(tribes.id)");
    // Active-member totals come from the definer function, one call per range,
    // including the dates moved into the month.
    expect(attendanceSql).toContain("public.summarize_tribe_event_attendances(");
    expect(getSqlParams(execute.mock.calls[2]?.[0])).toEqual([
      "matematica-pro",
      "2026-05-01T03:00:00.000Z",
      "2026-06-01T03:00:00.000Z",
      true,
      expect.any(Number),
      null,
      true,
    ]);
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
      exceptions: [],
      pendingProposalCount: 0,
      viewerPermissions: { canManageEvents: true, canProposeEvents: false },
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
        eventType: "live",
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
    // The lock finds no manageable row; the UPDATE statement classifies it.
    execute.mockResolvedValueOnce({ rows: [] });
    const repository = createRepository(execute);

    await expect(
      repository.update({
        attendanceRange: null,
        capacity: { capacity: null, kind: "set" },
        description: null,
        endsAt: null,
        eventId: EVENT_ID,
        eventType: "live",
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
        schedule: weeklySchedule,
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
    // The validated schedule travels with the write so the function can
    // refuse it when a manager changed the schedule in between.
    expect(getSqlParams(execute.mock.calls[0]?.[0])).toEqual([
      "matematica-pro",
      EVENT_ID,
      "2026-05-13T18:00:00.000Z",
      "going",
      "2026-05-06T18:00:00.000Z",
      "2026-05-06T19:00:00.000Z",
      "weekly",
      null,
    ]);
    expect(getSqlParams(execute.mock.calls[1]?.[0])).toEqual([
      "matematica-pro",
      "2026-05-13T18:00:00.000Z",
      "2026-05-13T18:00:00.001Z",
      false,
      expect.any(Number),
      EVENT_ID,
      false,
    ]);
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
        schedule: weeklySchedule,
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
      })
      .mockResolvedValueOnce({
        rows: [{ attendance_status: null, outcome: "schedule_changed", promoted_count: 0 }],
      })
      .mockResolvedValueOnce({
        rows: [{ attendance_status: null, outcome: "schedule_changed", promoted_count: 0 }],
      });
    const repository = createRepository(execute);
    const key = {
      eventId: EVENT_ID,
      occurrenceStartsAt: "2026-05-13T18:00:00.000Z",
      schedule: weeklySchedule,
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
    // A manager edited the schedule between validation and write.
    await expect(repository.setAttendance({ ...key, status: "going" })).resolves.toEqual({
      status: "schedule_changed",
    });
    await expect(repository.clearAttendance(key)).resolves.toEqual({
      status: "schedule_changed",
    });
    expect(execute).toHaveBeenCalledTimes(6);
  });

  describe("waitlist refill after an update", () => {
    const updateCommand = {
      attendanceRange: null,
      capacity: { capacity: 12, kind: "set" as const },
      description: null,
      endsAt: "2026-05-06T19:00:00.000Z",
      eventId: EVENT_ID,
      eventType: "live" as const,
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

    it("refills only waitlists of dates valid under the updated schedule in the same transaction", async () => {
      const execute = vi
        .fn()
        .mockResolvedValueOnce({ rows: [lockedEventRow] })
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
        // Exceptions of the series: none.
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ promoted_count: 2 }] });
      const repository = createRepository(execute);

      await expect(repository.update(updateCommand)).resolves.toMatchObject({
        attendances: [],
        event: { capacity: 12 },
        status: "updated",
      });

      const candidateSql = getSqlText(execute.mock.calls[2]?.[0]);
      const refillSql = getSqlText(execute.mock.calls[4]?.[0]);

      expect(candidateSql).toContain("event_attendances.status =");
      // Lower bound = DATABASE clock minus one occurrence duration (one hour):
      // the application clock never prunes a candidate.
      expect(candidateSql).toContain("clock_timestamp()");
      expect(candidateSql).not.toContain("2026-05-13T17:30:00.000Z");
      expect(getSqlParams(execute.mock.calls[2]?.[0])).toContain(3_600_000);
      expect(refillSql).toContain("public.refill_tribe_event_waitlists(");
      expect(refillSql).toContain("2026-05-13T18:00:00.000Z");
      expect(refillSql).toContain("2026-05-20T18:00:00.000Z");
      expect(refillSql).not.toContain("2026-05-19T18:00:00.000Z");
      expect(execute).toHaveBeenCalledTimes(5);
    });

    it("keys moved dates by their original start and skips cancelled dates", async () => {
      const execute = vi
        .fn()
        .mockResolvedValueOnce({ rows: [lockedEventRow] })
        .mockResolvedValueOnce({ rows: [{ ...eventRow, capacity: 12, status: "updated" }] })
        .mockResolvedValueOnce({
          rows: [
            // Original slot already over, moved to the future: refilled
            // under its original start (the attendance key).
            { occurrence_starts_at: "2026-05-06T18:00:00.000Z" },
            // Future slot that was cancelled: takes no answers, not refilled.
            { occurrence_starts_at: "2026-05-20T18:00:00.000Z" },
            // Future slot moved to a time that already ended: still sent, the
            // refill function decides "ended" with its effective end.
            { occurrence_starts_at: "2026-05-27T18:00:00.000Z" },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              event_id: EVENT_ID,
              kind: "moved",
              new_ends_at: null,
              new_starts_at: "2026-05-14T18:00:00.000Z",
              original_starts_at: "2026-05-06T18:00:00.000Z",
              reason: null,
            },
            {
              event_id: EVENT_ID,
              kind: "cancelled",
              new_ends_at: null,
              new_starts_at: null,
              original_starts_at: "2026-05-20T18:00:00.000Z",
              reason: null,
            },
            {
              event_id: EVENT_ID,
              kind: "moved",
              new_ends_at: null,
              new_starts_at: "2026-05-12T18:00:00.000Z",
              original_starts_at: "2026-05-27T18:00:00.000Z",
              reason: null,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ promoted_count: 1 }] });
      const repository = createRepository(execute);

      await repository.update(updateCommand);

      const candidateSql = getSqlText(execute.mock.calls[2]?.[0]);
      const refillSql = getSqlText(execute.mock.calls[4]?.[0]);

      // Waitlists of moved dates are candidates even before the lookback.
      expect(candidateSql).toContain("public.event_occurrence_exceptions moved_exceptions");
      expect(refillSql).toContain("2026-05-06T18:00:00.000Z");
      expect(refillSql).not.toContain("2026-05-20T18:00:00.000Z");
      expect(refillSql).toContain("2026-05-27T18:00:00.000Z");
      expect(execute).toHaveBeenCalledTimes(5);
    });

    it("passes an occurrence in its last seconds even when the application clock is ahead", async () => {
      // The application host is 5 s ahead: by its clock the 18:00 occurrence
      // already ended at 19:00, but PostgreSQL may still see it in progress.
      // The locked SQL function decides with clock_timestamp(), so the start
      // must reach it instead of being pruned with Date.now().
      vi.setSystemTime(new Date("2026-05-13T19:00:05.000Z"));
      const execute = vi
        .fn()
        .mockResolvedValueOnce({ rows: [lockedEventRow] })
        .mockResolvedValueOnce({ rows: [{ ...eventRow, capacity: 12, status: "updated" }] })
        .mockResolvedValueOnce({
          rows: [{ occurrence_starts_at: new Date("2026-05-13T18:00:00.000Z") }],
        })
        // Exceptions of the series: none.
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ promoted_count: 1 }] });
      const repository = createRepository(execute);

      await expect(repository.update(updateCommand)).resolves.toMatchObject({
        status: "updated",
      });

      const candidateSql = getSqlText(execute.mock.calls[2]?.[0]);
      const refillSql = getSqlText(execute.mock.calls[4]?.[0]);

      expect(candidateSql).not.toContain("2026-05-13T18:00:05.000Z");
      expect(refillSql).toContain("public.refill_tribe_event_waitlists(");
      expect(refillSql).toContain("2026-05-13T18:00:00.000Z");
      expect(execute).toHaveBeenCalledTimes(5);
    });

    it("locks the event row first and compares the UPDATE with the locked version", async () => {
      // A concurrent manager lowered the capacity to 5 while this edit waited:
      // the lock returns that committed version, so restoring 10 is a change.
      const execute = vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ ...lockedEventRow, capacity: "5" }] })
        .mockResolvedValueOnce({
          rows: [{ ...eventRow, capacity: 10, status: "updated", waitlist_refill_needed: true }],
        })
        .mockResolvedValueOnce({ rows: [] });
      const repository = createRepository(execute);

      await expect(
        repository.update({ ...updateCommand, capacity: { capacity: 10, kind: "set" } })
      ).resolves.toMatchObject({ event: { capacity: 10 }, status: "updated" });

      const lockSql = getSqlText(execute.mock.calls[0]?.[0]);
      const updateSql = getSqlText(execute.mock.calls[1]?.[0]);

      expect(lockSql).toContain("for update of events");
      expect(lockSql).toContain("public.can_manage_tribe_events(events.tribe_id)");
      expect(getSqlParams(execute.mock.calls[0]?.[0])).toEqual(
        expect.arrayContaining(["matematica-pro", EVENT_ID])
      );
      expect(updateSql).toContain("update public.events");
      // The previous values come from the locked row, not from a CTE that
      // keeps the statement snapshot.
      expect(updateSql).not.toContain("target_event.capacity");
      expect(getSqlParams(execute.mock.calls[1]?.[0])).toEqual(
        expect.arrayContaining([
          "5",
          "2026-05-06T18:00:00.000Z",
          "2026-05-06T19:00:00.000Z",
          "weekly",
        ])
      );
      // Candidates were read because the change was reported.
      expect(execute).toHaveBeenCalledTimes(3);
    });

    it("refills conservatively when the lock found no row but the UPDATE went through", async () => {
      const execute = vi
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ ...eventRow, capacity: 12, status: "updated", waitlist_refill_needed: null }],
        })
        .mockResolvedValueOnce({ rows: [] });
      const repository = createRepository(execute);

      await expect(repository.update(updateCommand)).resolves.toMatchObject({
        status: "updated",
      });
      expect(getSqlText(execute.mock.calls[1]?.[0])).toContain("null::boolean");
      expect(getSqlText(execute.mock.calls[2]?.[0])).toContain(
        "event_attendances.status ="
      );
      expect(execute).toHaveBeenCalledTimes(3);
    });

    it("keeps the stored capacity and skips the refill when neither capacity nor schedule changed", async () => {
      const execute = vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ ...lockedEventRow, capacity: 5 }] })
        .mockResolvedValueOnce({
          rows: [
            { ...eventRow, capacity: 5, status: "updated", waitlist_refill_needed: false },
          ],
        });
      const repository = createRepository(execute);

      await expect(
        repository.update({ ...updateCommand, capacity: { kind: "unchanged" } })
      ).resolves.toMatchObject({
        attendances: [],
        event: { capacity: 5 },
        status: "updated",
      });

      const updateSql = getSqlText(execute.mock.calls[1]?.[0]);

      // The UPDATE never touches the capacity column, so the stored limit stays.
      expect(updateSql).not.toMatch(/capacity\s*=/);
      expect(updateSql).toContain("waitlist_refill_needed");
      // No candidate lookup and no promotion: the waitlists stay as they are.
      expect(execute).toHaveBeenCalledTimes(2);
    });

    it("writes an explicit capacity removal and refills when the change is reported", async () => {
      const execute = vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ ...lockedEventRow, capacity: 12 }] })
        .mockResolvedValueOnce({
          rows: [{ ...eventRow, status: "updated", waitlist_refill_needed: true }],
        })
        .mockResolvedValueOnce({
          rows: [{ occurrence_starts_at: "2026-05-20T18:00:00.000Z" }],
        })
        // Exceptions of the series: none.
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ promoted_count: 3 }] });
      const repository = createRepository(execute);

      await expect(
        repository.update({ ...updateCommand, capacity: { capacity: null, kind: "set" } })
      ).resolves.toMatchObject({ event: { capacity: null }, status: "updated" });

      expect(getSqlText(execute.mock.calls[1]?.[0])).toMatch(/capacity\s*=/);
      expect(getSqlText(execute.mock.calls[4]?.[0])).toContain(
        "public.refill_tribe_event_waitlists("
      );
      expect(execute).toHaveBeenCalledTimes(5);
    });

    it("skips the refill call when no waitlisted occurrence is still valid", async () => {
      const execute = vi
        .fn()
        .mockResolvedValueOnce({ rows: [lockedEventRow] })
        .mockResolvedValueOnce({ rows: [{ ...eventRow, capacity: 12, status: "updated" }] })
        .mockResolvedValueOnce({
          rows: [{ occurrence_starts_at: "2026-05-19T18:00:00.000Z" }],
        })
        .mockResolvedValueOnce({ rows: [] });
      const repository = createRepository(execute);

      await expect(repository.update(updateCommand)).resolves.toMatchObject({
        attendances: [],
        status: "updated",
      });
      // Lock, update, waitlist candidates, and the exceptions of the series.
      expect(execute).toHaveBeenCalledTimes(4);
    });
  });

  it("reads the event attendance summaries of the range after the refill", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [lockedEventRow] })
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
        capacity: { capacity: 12, kind: "set" },
        description: null,
        endsAt: null,
        eventId: EVENT_ID,
        eventType: "live",
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
    expect(execute).toHaveBeenCalledTimes(4);
    expect(getSqlText(execute.mock.calls[3]?.[0])).toContain(
      "public.summarize_tribe_event_attendances("
    );
    expect(getSqlParams(execute.mock.calls[3]?.[0])).toContain(EVENT_ID);
  });

  it("skips the refill and the summary read when the update is rejected", async () => {
    // A viewer who cannot manage the event locks nothing.
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ status: "forbidden" }] });
    const repository = createRepository(execute);

    await expect(
      repository.update({
        attendanceRange: {
          rangeEnd: "2026-06-01T03:00:00.000Z",
          rangeStart: "2026-05-01T03:00:00.000Z",
        },
        capacity: { capacity: 12, kind: "set" },
        description: null,
        endsAt: null,
        eventId: EVENT_ID,
        eventType: "live",
        meetingUrl: null,
        recurrenceFrequency: "weekly",
        recurrenceUntil: null,
        startsAt: "2026-05-06T18:00:00.000Z",
        title: "Clase abierta",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({ status: "forbidden" });
    expect(execute).toHaveBeenCalledTimes(2);
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

  it("reads the streak snapshot in one transaction and one statement", async () => {
    const execute = vi.fn().mockResolvedValueOnce({
      rows: [
        {
          ...eventRow,
          snapshot_reference_time: new Date("2026-05-27T18:29:57.123Z"),
          viewer_attendances: [
            {
              event_id: EVENT_ID,
              occurrence_starts_at: "2026-05-13T18:00:00+00:00",
              status: "going",
            },
            {
              event_id: EVENT_ID,
              occurrence_starts_at: "2026-05-20T18:00:00+00:00",
              status: "unknown",
            },
            { event_id: EVENT_ID, occurrence_starts_at: "not a date", status: "maybe" },
            null,
          ],
          occurrence_exceptions: [
            {
              event_id: EVENT_ID,
              kind: "cancelled",
              new_ends_at: null,
              new_starts_at: null,
              original_starts_at: "2026-05-20T18:00:00+00:00",
              reason: null,
            },
            { kind: "moved" },
          ],
        },
      ],
    });
    const executeWithDatabase = vi.fn(async (callback: (database: never) => unknown) =>
      callback({ execute } as never)
    );
    const repository = new PostgresTribeEventRepository(
      executeWithDatabase as unknown as ConstructorParameters<
        typeof PostgresTribeEventRepository
      >[0]
    );

    await expect(
      repository.readViewerAttendanceStreakSnapshot({
        eventRange: {
          rangeEnd: "2026-07-01T03:00:00.000Z",
          rangeStart: "2026-01-01T03:00:00.000Z",
        },
        tribeSlug: "matematica-pro",
        viewerAttendanceRange: {
          rangeEnd: "2026-06-01T03:00:00.000Z",
          rangeStart: "2026-01-01T03:00:00.000Z",
        },
      })
    ).resolves.toEqual({
      events: [expect.objectContaining({ id: EVENT_ID })],
      // The exceptions come from the same statement, so the streak never
      // mixes a schedule with the exceptions of another version.
      exceptions: [
        {
          eventId: EVENT_ID,
          kind: "cancelled",
          newEndsAt: null,
          newStartsAt: null,
          originalStartsAt: "2026-05-20T18:00:00.000Z",
          reason: null,
        },
      ],
      referenceTime: "2026-05-27T18:29:57.123Z",
      viewerAttendances: [
        { eventId: EVENT_ID, occurrenceStartsAt: "2026-05-13T18:00:00.000Z", status: "going" },
      ],
    });
    // The series and the viewer answers share one request transaction and a
    // single statement, so they come from one database snapshot.
    expect(executeWithDatabase).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(1);
    // The reference instant is the database clock of that same statement.
    expect(getSqlText(execute.mock.calls[0][0])).toContain(
      "statement_timestamp() as snapshot_reference_time"
    );
    expect(getSqlParams(execute.mock.calls[0][0])).toEqual(
      expect.arrayContaining([
        "matematica-pro",
        "2026-07-01T03:00:00.000Z",
        "2026-01-01T03:00:00.000Z",
        "2026-06-01T03:00:00.000Z",
      ])
    );
  });

  it("returns an empty snapshot when the tribe has no series in the range", async () => {
    const execute = vi.fn().mockResolvedValueOnce({
      rows: [
        {
          can_manage_events: false,
          capacity: null,
          description: null,
          ends_at: null,
          id: null,
          meeting_url: null,
          recurrence_frequency: null,
          recurrence_until: null,
          starts_at: null,
          snapshot_reference_time: "2026-05-27 18:29:57.123+00",
          title: null,
          viewer_attendances: [],
        },
      ],
    });
    const repository = createRepository(execute);

    await expect(
      repository.readViewerAttendanceStreakSnapshot({
        eventRange: {
          rangeEnd: "2026-07-01T03:00:00.000Z",
          rangeStart: "2026-01-01T03:00:00.000Z",
        },
        tribeSlug: "matematica-pro",
        viewerAttendanceRange: {
          rangeEnd: "2026-06-01T03:00:00.000Z",
          rangeStart: "2026-01-01T03:00:00.000Z",
        },
      })
    ).resolves.toEqual({
      events: [],
      exceptions: [],
      referenceTime: "2026-05-27T18:29:57.123Z",
      viewerAttendances: [],
    });
  });

  it("fails loudly when the snapshot statement returns no database reference time", async () => {
    const execute = vi.fn().mockResolvedValueOnce({ rows: [] });
    const repository = createRepository(execute);

    await expect(
      repository.readViewerAttendanceStreakSnapshot({
        eventRange: {
          rangeEnd: "2026-07-01T03:00:00.000Z",
          rangeStart: "2026-01-01T03:00:00.000Z",
        },
        tribeSlug: "matematica-pro",
        viewerAttendanceRange: {
          rangeEnd: "2026-06-01T03:00:00.000Z",
          rangeStart: "2026-01-01T03:00:00.000Z",
        },
      })
    ).rejects.toThrow("returned no database reference time");
  });
});
