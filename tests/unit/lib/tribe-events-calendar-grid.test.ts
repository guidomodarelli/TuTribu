import { describe, expect, it } from "vitest";

import {
  createCalendarDays,
  groupAgendaDays,
  groupOccurrencesByDay,
  mergeSavedOccurrences,
  splitCalendarWeeks,
} from "@/lib/events/tribe-events-calendar-grid";
import type { TribeEventOccurrenceResult } from "@/src/modules/events/application/results/tribe-event-result";

const EVENT_ID = "6f3c7a1e-2b4d-4c8e-9f10-1a2b3c4d5e6f";
const OTHER_EVENT_ID = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";

function createOccurrence(
  overrides: Partial<TribeEventOccurrenceResult> = {}
): TribeEventOccurrenceResult {
  const startsAt = overrides.startsAt ?? "2026-05-06T18:00:00.000Z";
  const eventId = overrides.eventId ?? EVENT_ID;

  return {
    attendance: {
      goingCount: 0,
      goingPreview: [],
      maybeCount: 0,
      viewerStatus: null,
      viewerWaitlistPosition: null,
      waitlistedCount: 0,
    },
    capacity: null,
    description: null,
    endsAt: null,
    eventId,
    meetingUrl: null,
    eventType: "live",
    exception: null,
    occurrenceKey: `${eventId}@${startsAt}`,
    originalStartsAt: startsAt,
    recurrenceFrequency: "none",
    recurrenceRule: null,
    recurrenceUntil: null,
    seriesEndsAt: null,
    seriesStartsAt: startsAt,
    startsAt,
    title: "Clase abierta",
    ...overrides,
  };
}

describe("tribe events calendar grid", () => {
  it("builds Monday-first weeks padded with neighbour months", () => {
    // May 2026 starts on a Friday and has 31 days: 4 leading + 31 = 35 cells.
    const days = createCalendarDays("2026-05");
    const weeks = splitCalendarWeeks(days);

    expect(days).toHaveLength(35);
    expect(weeks).toHaveLength(5);
    expect(weeks.every((week) => week.length === 7)).toBe(true);
    expect(days[0]).toEqual({ dateKey: "2026-04-27", dayNumber: 27, isCurrentMonth: false });
    expect(days[4]).toEqual({ dateKey: "2026-05-01", dayNumber: 1, isCurrentMonth: true });
    expect(days.at(-1)).toEqual({ dateKey: "2026-05-31", dayNumber: 31, isCurrentMonth: true });
  });

  it("groups occurrences by Buenos Aires day, not by UTC day", () => {
    const lateNight = createOccurrence({ startsAt: "2026-05-07T02:00:00.000Z" });
    const evening = createOccurrence({
      eventId: OTHER_EVENT_ID,
      startsAt: "2026-05-06T18:00:00.000Z",
    });

    expect(groupOccurrencesByDay([evening, lateNight])).toEqual({
      "2026-05-06": [evening, lateNight],
    });
    expect(groupAgendaDays([evening, lateNight])).toEqual([
      { dayEvents: [evening, lateNight], dayKey: "2026-05-06" },
    ]);
  });

  it("keeps agenda days in the order of the sorted input", () => {
    const first = createOccurrence({ startsAt: "2026-05-06T18:00:00.000Z" });
    const second = createOccurrence({ startsAt: "2026-05-13T18:00:00.000Z" });

    expect(groupAgendaDays([first, second]).map((day) => day.dayKey)).toEqual([
      "2026-05-06",
      "2026-05-13",
    ]);
  });

  it("replaces the saved series with the attendance summaries returned by the save", () => {
    const staleWaitlisted = createOccurrence({
      attendance: {
        goingCount: 2,
        goingPreview: [],
        maybeCount: 0,
        viewerStatus: "waitlisted",
        viewerWaitlistPosition: 1,
        waitlistedCount: 1,
      },
      capacity: 2,
      startsAt: "2026-05-06T18:00:00.000Z",
    });
    const removed = createOccurrence({ startsAt: "2026-05-13T18:00:00.000Z" });
    const unrelated = createOccurrence({
      eventId: OTHER_EVENT_ID,
      startsAt: "2026-05-01T18:00:00.000Z",
    });
    const promotedAttendance = {
      goingCount: 3,
      goingPreview: [],
      maybeCount: 0,
      viewerStatus: "going" as const,
      viewerWaitlistPosition: null,
      waitlistedCount: 0,
    };
    const savedPromoted = createOccurrence({
      attendance: promotedAttendance,
      capacity: 3,
      startsAt: staleWaitlisted.startsAt,
      title: "Nuevo título",
    });
    const savedNew = createOccurrence({ startsAt: "2026-05-20T18:00:00.000Z" });

    const merged = mergeSavedOccurrences(
      [staleWaitlisted, removed, unrelated],
      [savedNew, savedPromoted],
      EVENT_ID
    );

    expect(merged.map((occurrence) => occurrence.startsAt)).toEqual([
      unrelated.startsAt,
      staleWaitlisted.startsAt,
      savedNew.startsAt,
    ]);
    expect(merged[1]).toMatchObject({
      attendance: promotedAttendance,
      capacity: 3,
      title: "Nuevo título",
    });
    expect(merged[2]?.attendance).toEqual(savedNew.attendance);
  });
});
