import { describe, expect, it, vi, type Mock } from "vitest";

import { PostgresTribeEventReminderRepository } from "@/src/modules/events/infrastructure/repositories/postgres-tribe-event-reminder-repository";

const TRIBE_ID = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const FIRST_EVENT_ID = "11111111-2b4d-4c8e-9f10-1a2b3c4d5e6f";
const SECOND_EVENT_ID = "22222222-2b4d-4c8e-9f10-1a2b3c4d5e6f";
const OCCURRENCE = "2026-05-07T21:00:00.000Z";

function getSqlText(statement: unknown): string {
  return ((statement as { queryChunks?: unknown[] }).queryChunks ?? [])
    .map((chunk) => {
      if (typeof chunk === "string") {
        return chunk;
      }

      if (chunk && typeof chunk === "object" && "value" in chunk && Array.isArray((chunk as { value: unknown }).value)) {
        return (chunk as { value: string[] }).value.join("");
      }

      if (chunk && typeof chunk === "object" && "queryChunks" in chunk) {
        return getSqlText(chunk);
      }

      return "";
    })
    .join("");
}

function createExecutor(execute: Mock) {
  return async <T,>(callback: (database: never) => Promise<T>) => callback({ execute } as never);
}

function seriesRow(id: string) {
  return {
    capacity: null,
    description: null,
    ends_at: null,
    event_type: "live",
    id,
    meeting_url: null,
    recurrence_frequency: "weekly",
    recurrence_until: null,
    starts_at: new Date("2026-04-30T21:00:00.000Z"),
    title: "Taller",
    tribe_id: TRIBE_ID,
  };
}

describe("PostgresTribeEventReminderRepository", () => {
  it("pages series by id and groups their exceptions without N+1", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [seriesRow(FIRST_EVENT_ID), seriesRow(SECOND_EVENT_ID)] })
      .mockResolvedValueOnce({
        rows: [
          {
            event_id: FIRST_EVENT_ID,
            kind: "cancelled",
            new_ends_at: null,
            new_starts_at: null,
            original_starts_at: OCCURRENCE,
            reason: null,
          },
        ],
      });
    const repository = new PostgresTribeEventReminderRepository(createExecutor(execute));

    const page = await repository.listSeriesInRange({
      afterEventId: null,
      limit: 1,
      rangeEnd: "2026-05-07T12:10:00.000Z",
      rangeStart: "2026-05-06T12:10:00.000Z",
    });

    expect(page.nextCursor).toBe(FIRST_EVENT_ID);
    expect(page.series).toHaveLength(1);
    expect(page.series[0]).toMatchObject({
      event: { id: FIRST_EVENT_ID, recurrenceFrequency: "weekly" },
      exceptions: [{ eventId: FIRST_EVENT_ID, kind: "cancelled", originalStartsAt: OCCURRENCE }],
      tribeId: TRIBE_ID,
    });
    expect(execute).toHaveBeenCalledTimes(2);
    expect(getSqlText(execute.mock.calls[0]?.[0])).toContain("order by events.id asc");
  });

  it("reads series and exceptions only through the owner-executed maintenance functions", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [seriesRow(FIRST_EVENT_ID)] })
      .mockResolvedValueOnce({ rows: [] });
    const repository = new PostgresTribeEventReminderRepository(createExecutor(execute));

    await repository.listSeriesInRange({
      afterEventId: null,
      limit: 200,
      rangeEnd: "2026-05-07T12:10:00.000Z",
      rangeStart: "2026-05-06T12:10:00.000Z",
    });

    const seriesSql = getSqlText(execute.mock.calls[0]?.[0]);
    const exceptionsSql = getSqlText(execute.mock.calls[1]?.[0]);

    expect(seriesSql).toContain("from public.list_tribe_event_reminder_series(");
    expect(seriesSql).not.toContain("from public.events");
    expect(exceptionsSql).toContain("from public.list_tribe_event_reminder_exceptions(");
    expect(exceptionsSql).not.toContain("from public.event_occurrence_exceptions");
  });

  it("returns an empty last page without querying exceptions", async () => {
    const execute = vi.fn().mockResolvedValueOnce({ rows: [] });
    const repository = new PostgresTribeEventReminderRepository(createExecutor(execute));

    await expect(
      repository.listSeriesInRange({
        afterEventId: SECOND_EVENT_ID,
        limit: 200,
        rangeEnd: "2026-05-07T12:10:00.000Z",
        rangeStart: "2026-05-06T12:10:00.000Z",
      })
    ).resolves.toEqual({ nextCursor: null, series: [] });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("fans reminders out to eligible members with insert-or-ignore", async () => {
    const execute = vi.fn().mockResolvedValueOnce({ rows: [{ created_count: 3 }] });
    const repository = new PostgresTribeEventReminderRepository(createExecutor(execute));

    await expect(
      repository.enqueueReminders([
        {
          eventId: FIRST_EVENT_ID,
          notification: {
            dedupeKey: `event_reminder_24h:${FIRST_EVENT_ID}@${OCCURRENCE}`,
            payload: { eventId: FIRST_EVENT_ID, occurrenceStartsAt: OCCURRENCE, startsAt: OCCURRENCE },
            type: "event_reminder_24h",
          },
          minimumLeadMinutes: 60,
          originalStartsAt: OCCURRENCE,
          statuses: ["going", "maybe"],
          tribeId: TRIBE_ID,
        },
      ])
    ).resolves.toBe(3);

    const enqueueStatement = execute.mock.calls[0]?.[0] as { queryChunks?: unknown[] };
    const enqueueSql = getSqlText(enqueueStatement);
    const candidatesParam = (enqueueStatement.queryChunks ?? [])
      .map((chunk) =>
        chunk && typeof chunk === "object" && "value" in chunk
          ? (chunk as { value: unknown }).value
          : chunk
      )
      .find((value): value is string => typeof value === "string" && value.startsWith("["));

    expect(enqueueSql).toContain("public.enqueue_tribe_event_reminders(");
    expect(enqueueSql).not.toContain("insert into public.notifications");
    expect(JSON.parse(candidatesParam ?? "[]")).toEqual([
      {
        dedupe_key: `event_reminder_24h:${FIRST_EVENT_ID}@${OCCURRENCE}`,
        event_id: FIRST_EVENT_ID,
        minimum_lead_minutes: 60,
        occurrence_starts_at: OCCURRENCE,
        payload: { eventId: FIRST_EVENT_ID, occurrenceStartsAt: OCCURRENCE, startsAt: OCCURRENCE },
        statuses: ["going", "maybe"],
        tribe_id: TRIBE_ID,
        type: "event_reminder_24h",
      },
    ]);
  });

  it("does not touch the database when nothing is due", async () => {
    const execute = vi.fn();
    const repository = new PostgresTribeEventReminderRepository(createExecutor(execute));

    await expect(repository.enqueueReminders([])).resolves.toBe(0);
    expect(execute).not.toHaveBeenCalled();
  });
});
