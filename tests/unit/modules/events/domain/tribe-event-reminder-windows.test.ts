import { describe, expect, it } from "vitest";

import { TRIBE_EVENT_REMINDERS } from "@/src/modules/events/constants/tribe-event-reminders";
import {
  getTribeEventReminderRange,
  selectDueTribeEventReminders,
  type TribeEventReminderSeries,
} from "@/src/modules/events/domain/services/tribe-event-reminder-windows";

const EVENT_ID = "6f3c7a1e-2b4d-4c8e-9f10-1a2b3c4d5e6f";
const TRIBE_ID = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const NOW = Date.parse("2026-05-06T12:00:00.000Z");
const MINUTE = 60_000;

function weeklySeries(
  startsAt: string,
  exceptions: TribeEventReminderSeries["exceptions"] = []
): TribeEventReminderSeries {
  return {
    event: {
      endsAt: null,
      id: EVENT_ID,
      recurrenceFrequency: "weekly",
      recurrenceUntil: null,
      startsAt,
    },
    exceptions,
    tribeId: TRIBE_ID,
  };
}

function iso(time: number): string {
  return new Date(time).toISOString();
}

describe("getTribeEventReminderRange", () => {
  it("covers the earliest and the latest reminder window", () => {
    expect(getTribeEventReminderRange(TRIBE_EVENT_REMINDERS, NOW)).toEqual({
      rangeEnd: iso(NOW + (1440 + 10) * MINUTE),
      rangeStart: iso(NOW + (15 - 5) * MINUTE),
    });
  });
});

describe("selectDueTribeEventReminders", () => {
  it("selects the day-before reminder inside its tolerance and not outside it", () => {
    const inside = selectDueTribeEventReminders(
      [weeklySeries(iso(NOW + (1440 - 9) * MINUTE))],
      TRIBE_EVENT_REMINDERS,
      NOW
    );
    const outside = selectDueTribeEventReminders(
      [weeklySeries(iso(NOW + (1440 + 11) * MINUTE))],
      TRIBE_EVENT_REMINDERS,
      NOW
    );

    expect(inside).toEqual([
      expect.objectContaining({
        eventId: EVENT_ID,
        originalStartsAt: iso(NOW + (1440 - 9) * MINUTE),
        startsAt: iso(NOW + (1440 - 9) * MINUTE),
        tribeId: TRIBE_ID,
        window: TRIBE_EVENT_REMINDERS[0],
      }),
    ]);
    expect(outside).toEqual([]);
  });

  it("selects the 15-minute reminder with its own window", () => {
    const due = selectDueTribeEventReminders(
      [weeklySeries(iso(NOW + 12 * MINUTE))],
      TRIBE_EVENT_REMINDERS,
      NOW
    );

    expect(due.map((reminder) => reminder.window.type)).toEqual(["event_reminder_15m"]);
  });

  it("still reminds every start when one 5-minute tick is skipped (jitter tolerance)", () => {
    const tickTimes = Array.from({ length: 13 }, (_, index) => NOW - 30 * MINUTE + index * 5 * MINUTE)
      // One tick of the cron never ran.
      .filter((tickTime) => tickTime !== NOW);

    for (let startMinute = 0; startMinute < 10; startMinute += 1) {
      for (const window of TRIBE_EVENT_REMINDERS) {
        const startsAt = iso(NOW + window.leadMinutes * MINUTE + startMinute * MINUTE);
        const hits = tickTimes.filter((tickTime) =>
          selectDueTribeEventReminders([weeklySeries(startsAt)], [window], tickTime).length > 0
        );

        expect(hits.length).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("skips a cancelled date and uses the new time of a moved date", () => {
    const originalStartsAt = iso(NOW + 12 * MINUTE);
    const cancelled = selectDueTribeEventReminders(
      [
        weeklySeries(originalStartsAt, [
          {
            eventId: EVENT_ID,
            kind: "cancelled",
            newEndsAt: null,
            newStartsAt: null,
            originalStartsAt,
            reason: null,
          },
        ]),
      ],
      TRIBE_EVENT_REMINDERS,
      NOW
    );
    const movedToTomorrow = iso(NOW + 1440 * MINUTE);
    const moved = selectDueTribeEventReminders(
      [
        weeklySeries(originalStartsAt, [
          {
            eventId: EVENT_ID,
            kind: "moved",
            newEndsAt: null,
            newStartsAt: movedToTomorrow,
            originalStartsAt,
            reason: null,
          },
        ]),
      ],
      TRIBE_EVENT_REMINDERS,
      NOW
    );

    expect(cancelled).toEqual([]);
    expect(moved).toEqual([
      expect.objectContaining({
        originalStartsAt,
        startsAt: movedToTomorrow,
        window: TRIBE_EVENT_REMINDERS[0],
      }),
    ]);
  });
});
