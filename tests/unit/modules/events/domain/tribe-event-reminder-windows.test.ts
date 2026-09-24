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
  it("reads every occurrence that starts after now and within the longest lead", () => {
    expect(getTribeEventReminderRange(TRIBE_EVENT_REMINDERS, NOW)).toEqual({
      // Exclusive end one millisecond past the inclusive 24 h bound.
      rangeEnd: iso(NOW + 1440 * MINUTE + 1),
      rangeStart: iso(NOW),
    });
  });
});

function dueTypesFor(startsAt: string, now: number = NOW): string[] {
  return selectDueTribeEventReminders([weeklySeries(startsAt)], TRIBE_EVENT_REMINDERS, now).map(
    (reminder) => reminder.window.type
  );
}

describe("selectDueTribeEventReminders", () => {
  it("selects the day-before reminder for any start up to 24 h ahead and not beyond", () => {
    const inside = selectDueTribeEventReminders(
      [weeklySeries(iso(NOW + (1440 - 9) * MINUTE))],
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
    expect(dueTypesFor(iso(NOW + 1440 * MINUTE))).toEqual(["event_reminder_24h"]);
    expect(dueTypesFor(iso(NOW + 1440 * MINUTE + 1))).toEqual([]);
  });

  it("selects only the 15-minute reminder once the start is 15 minutes away or less", () => {
    expect(dueTypesFor(iso(NOW + 15 * MINUTE))).toEqual(["event_reminder_15m"]);
    expect(dueTypesFor(iso(NOW + 12 * MINUTE))).toEqual(["event_reminder_15m"]);
    expect(dueTypesFor(iso(NOW + 1 * MINUTE))).toEqual(["event_reminder_15m"]);
  });

  it("never reminds an occurrence that already started", () => {
    expect(dueTypesFor(iso(NOW))).toEqual([]);
    expect(dueTypesFor(iso(NOW - 5 * MINUTE))).toEqual([]);
  });

  it("does not send a day-before reminder for an occurrence that starts within the hour", () => {
    // Between the 15-minute call and one hour away, a "day before" nudge
    // would only land right before the 15-minute reminder.
    expect(dueTypesFor(iso(NOW + 60 * MINUTE))).toEqual([]);
    expect(dueTypesFor(iso(NOW + 30 * MINUTE))).toEqual([]);
    expect(dueTypesFor(iso(NOW + 60 * MINUTE + 1))).toEqual(["event_reminder_24h"]);
  });

  it("catches up a reminder when the scheduler runs 20 minutes late", () => {
    // Due at 24 h and at 15 min before the start, but the run happens later.
    const startsAt = NOW + 1440 * MINUTE;
    const lateDayBeforeRun = startsAt - (1440 - 20) * MINUTE;
    const lateSoonRun = startsAt - 15 * MINUTE + 12 * MINUTE;

    expect(dueTypesFor(iso(startsAt), lateDayBeforeRun)).toEqual(["event_reminder_24h"]);
    expect(dueTypesFor(iso(startsAt), lateSoonRun)).toEqual(["event_reminder_15m"]);
  });

  it("reminds an event created with less than 24 h of notice on the next run", () => {
    // Created 3 h before its start: the day-before reminder is due right away.
    expect(dueTypesFor(iso(NOW + 180 * MINUTE))).toEqual(["event_reminder_24h"]);
  });

  it("keeps producing the same reminder identity on every run so the dedupe key sends it once", () => {
    const startsAt = iso(NOW + 600 * MINUTE);
    const runs = [NOW, NOW + 5 * MINUTE, NOW + 45 * MINUTE].map((runTime) =>
      selectDueTribeEventReminders([weeklySeries(startsAt)], TRIBE_EVENT_REMINDERS, runTime).map(
        (reminder) => `${reminder.window.type}:${reminder.eventId}@${reminder.originalStartsAt}`
      )
    );

    expect(new Set(runs.flat())).toEqual(new Set([`event_reminder_24h:${EVENT_ID}@${startsAt}`]));
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
