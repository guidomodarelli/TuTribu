import { describe, expect, it, vi } from "vitest";

import { sendTribeEventReminders } from "@/src/modules/events/application/use-cases/send-tribe-event-reminders-use-case";
import { TRIBE_EVENT_REMINDER_BATCH } from "@/src/modules/events/constants/tribe-event-reminders";
import type {
  TribeEventReminderRepository,
  TribeEventReminderSeriesPage,
} from "@/src/modules/events/domain/repositories/tribe-event-reminder-repository";

const NOW = "2026-05-06T12:00:00.000Z";
const TRIBE_ID = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const FIRST_EVENT_ID = "11111111-2b4d-4c8e-9f10-1a2b3c4d5e6f";
const SECOND_EVENT_ID = "22222222-2b4d-4c8e-9f10-1a2b3c4d5e6f";
const MINUTE = 60_000;

function singleEvent(id: string, startsAt: string) {
  return {
    event: {
      endsAt: null,
      id,
      recurrenceFrequency: "none" as const,
      recurrenceUntil: null,
      startsAt,
    },
    exceptions: [],
    tribeId: TRIBE_ID,
  };
}

function createRepository(pages: TribeEventReminderSeriesPage[]) {
  const listSeriesInRange = vi.fn();

  for (const page of pages) {
    listSeriesInRange.mockResolvedValueOnce(page);
  }

  return {
    enqueueReminders: vi.fn(async (candidates: readonly unknown[]) => candidates.length * 2),
    listSeriesInRange,
  } satisfies TribeEventReminderRepository;
}

describe("sendTribeEventReminders", () => {
  it("enqueues a deduplicated reminder per due occurrence with its audience", async () => {
    const soonStart = new Date(Date.parse(NOW) + 14 * MINUTE).toISOString();
    const tomorrowStart = new Date(Date.parse(NOW) + 1440 * MINUTE).toISOString();
    const repository = createRepository([
      {
        nextCursor: null,
        series: [singleEvent(FIRST_EVENT_ID, soonStart), singleEvent(SECOND_EVENT_ID, tomorrowStart)],
      },
    ]);

    const result = await sendTribeEventReminders({ tribeEventReminderRepository: repository })({
      now: NOW,
    });

    expect(repository.listSeriesInRange).toHaveBeenCalledWith({
      afterEventId: null,
      limit: TRIBE_EVENT_REMINDER_BATCH.seriesPerPage,
      rangeEnd: new Date(Date.parse(NOW) + 1450 * MINUTE).toISOString(),
      rangeStart: new Date(Date.parse(NOW) + 10 * MINUTE).toISOString(),
    });
    expect(repository.enqueueReminders).toHaveBeenCalledWith([
      {
        eventId: FIRST_EVENT_ID,
        notification: {
          dedupeKey: `event_reminder_15m:${FIRST_EVENT_ID}@${soonStart}`,
          payload: { eventId: FIRST_EVENT_ID, occurrenceStartsAt: soonStart, startsAt: soonStart },
          type: "event_reminder_15m",
        },
        originalStartsAt: soonStart,
        statuses: ["going"],
        tribeId: TRIBE_ID,
      },
      {
        eventId: SECOND_EVENT_ID,
        notification: {
          dedupeKey: `event_reminder_24h:${SECOND_EVENT_ID}@${tomorrowStart}`,
          payload: {
            eventId: SECOND_EVENT_ID,
            occurrenceStartsAt: tomorrowStart,
            startsAt: tomorrowStart,
          },
          type: "event_reminder_24h",
        },
        originalStartsAt: tomorrowStart,
        statuses: ["going", "maybe"],
        tribeId: TRIBE_ID,
      },
    ]);
    expect(result).toEqual({
      createdCount: 4,
      dueReminderCount: 2,
      isComplete: true,
      pageCount: 1,
      seriesCount: 2,
    });
  });

  it("walks keyset pages and skips the insert when nothing is due", async () => {
    const farStart = new Date(Date.parse(NOW) + 600 * MINUTE).toISOString();
    const repository = createRepository([
      { nextCursor: FIRST_EVENT_ID, series: [singleEvent(FIRST_EVENT_ID, farStart)] },
      { nextCursor: null, series: [singleEvent(SECOND_EVENT_ID, farStart)] },
    ]);

    const result = await sendTribeEventReminders({ tribeEventReminderRepository: repository })({
      now: NOW,
    });

    expect(repository.listSeriesInRange).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ afterEventId: FIRST_EVENT_ID })
    );
    expect(repository.enqueueReminders).not.toHaveBeenCalled();
    expect(result).toMatchObject({ createdCount: 0, isComplete: true, pageCount: 2 });
  });

  it("stops at the page cap and reports the run as incomplete", async () => {
    const farStart = new Date(Date.parse(NOW) + 600 * MINUTE).toISOString();
    const repository = createRepository(
      Array.from({ length: TRIBE_EVENT_REMINDER_BATCH.maxPagesPerRun }, () => ({
        nextCursor: FIRST_EVENT_ID,
        series: [singleEvent(FIRST_EVENT_ID, farStart)],
      }))
    );

    const result = await sendTribeEventReminders({ tribeEventReminderRepository: repository })({
      now: NOW,
    });

    expect(repository.listSeriesInRange).toHaveBeenCalledTimes(
      TRIBE_EVENT_REMINDER_BATCH.maxPagesPerRun
    );
    expect(result.isComplete).toBe(false);
  });
});
