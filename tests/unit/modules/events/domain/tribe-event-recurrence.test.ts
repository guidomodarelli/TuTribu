import { describe, it, expect } from "vitest";
import type { TribeEventSchedule } from "@/src/modules/events/domain/entities/tribe-event";
import {
  buildTribeEventRecurrenceRule,
  expandTribeEventOccurrences,
  formatCalendarUtcDateTime,
  isTribeEventOccurrence,
} from "@/src/modules/events/domain/services/tribe-event-recurrence";
import { TRIBE_EVENT_RANGE_MATCH } from "@/src/modules/events/constants/tribe-events";

const MAY_2026 = {
  rangeEnd: "2026-06-01T03:00:00.000Z",
  rangeStart: "2026-05-01T03:00:00.000Z",
};

function createSchedule(overrides: Partial<TribeEventSchedule> = {}): TribeEventSchedule {
  return {
    endsAt: "2026-05-06T19:00:00.000Z",
    recurrenceFrequency: "none",
    recurrenceUntil: null,
    startsAt: "2026-05-06T18:00:00.000Z",
    ...overrides,
  };
}

describe("tribe event recurrence", () => {
  it("yields a single occurrence for a non-recurring event inside the range", () => {
    expect(expandTribeEventOccurrences(createSchedule(), MAY_2026)).toEqual([
      {
        endsAt: "2026-05-06T19:00:00.000Z",
        startsAt: "2026-05-06T18:00:00.000Z",
      },
    ]);
  });

  it("yields nothing for a non-recurring event outside the range", () => {
    expect(
      expandTribeEventOccurrences(
        createSchedule({
          endsAt: null,
          startsAt: "2026-06-06T18:00:00.000Z",
        }),
        MAY_2026
      )
    ).toEqual([]);
  });

  it("expands a weekly series across the month keeping the duration", () => {
    const occurrences = expandTribeEventOccurrences(
      createSchedule({ recurrenceFrequency: "weekly" }),
      MAY_2026
    );

    expect(occurrences.map((occurrence) => occurrence.startsAt)).toEqual([
      "2026-05-06T18:00:00.000Z",
      "2026-05-13T18:00:00.000Z",
      "2026-05-20T18:00:00.000Z",
      "2026-05-27T18:00:00.000Z",
    ]);
    expect(occurrences[1]?.endsAt).toBe("2026-05-13T19:00:00.000Z");
  });

  it("expands a biweekly series and stops at the until date", () => {
    const occurrences = expandTribeEventOccurrences(
      createSchedule({
        recurrenceFrequency: "biweekly",
        recurrenceUntil: "2026-05-21T02:59:59.000Z",
      }),
      MAY_2026
    );

    expect(occurrences.map((occurrence) => occurrence.startsAt)).toEqual([
      "2026-05-06T18:00:00.000Z",
      "2026-05-20T18:00:00.000Z",
    ]);
  });

  it("skips months that lack the anchor day for monthly series", () => {
    const occurrences = expandTribeEventOccurrences(
      createSchedule({
        endsAt: null,
        recurrenceFrequency: "monthly",
        startsAt: "2026-01-31T15:00:00.000Z",
      }),
      {
        rangeEnd: "2026-05-01T03:00:00.000Z",
        rangeStart: "2026-02-01T03:00:00.000Z",
      }
    );

    expect(occurrences.map((occurrence) => occurrence.startsAt)).toEqual([
      "2026-03-31T15:00:00.000Z",
    ]);
  });

  it("finds the occurrences of a long-running weekly series without walking its history", () => {
    const occurrences = expandTribeEventOccurrences(
      createSchedule({
        endsAt: null,
        recurrenceFrequency: "weekly",
        startsAt: "2020-05-06T18:00:00.000Z",
      }),
      MAY_2026
    );

    expect(occurrences.map((occurrence) => occurrence.startsAt)).toEqual([
      "2026-05-06T18:00:00.000Z",
      "2026-05-13T18:00:00.000Z",
      "2026-05-20T18:00:00.000Z",
      "2026-05-27T18:00:00.000Z",
    ]);
  });

  it("keeps a still-running occurrence that started before the range when matching by overlap", () => {
    const crossDayWorkshop = createSchedule({
      endsAt: "2026-05-07T02:00:00.000Z",
      startsAt: "2026-05-06T15:00:00.000Z",
    });
    const range = {
      rangeEnd: "2026-06-05T22:00:00.000Z",
      rangeStart: "2026-05-06T22:00:00.000Z",
    };

    expect(
      expandTribeEventOccurrences(crossDayWorkshop, range, TRIBE_EVENT_RANGE_MATCH.overlaps)
    ).toEqual([
      {
        endsAt: "2026-05-07T02:00:00.000Z",
        startsAt: "2026-05-06T15:00:00.000Z",
      },
    ]);
    expect(expandTribeEventOccurrences(crossDayWorkshop, range)).toEqual([]);
  });

  it("drops occurrences that already finished when matching by overlap", () => {
    const range = {
      rangeEnd: "2026-06-06T12:00:00.000Z",
      rangeStart: "2026-05-07T12:00:00.000Z",
    };

    expect(
      expandTribeEventOccurrences(createSchedule(), range, TRIBE_EVENT_RANGE_MATCH.overlaps)
    ).toEqual([]);
    expect(
      expandTribeEventOccurrences(
        createSchedule({ endsAt: null, startsAt: "2026-05-07T10:30:00.000Z" }),
        range,
        TRIBE_EVENT_RANGE_MATCH.overlaps
      )
    ).toEqual([]);
    expect(
      expandTribeEventOccurrences(
        createSchedule({ endsAt: null, startsAt: "2026-05-07T11:30:00.000Z" }),
        range,
        TRIBE_EVENT_RANGE_MATCH.overlaps
      )
    ).toEqual([{ endsAt: null, startsAt: "2026-05-07T11:30:00.000Z" }]);
  });

  it("finds the running slot of a long weekly series whose occurrences last several days", () => {
    const occurrences = expandTribeEventOccurrences(
      createSchedule({
        endsAt: "2020-05-09T18:00:00.000Z",
        recurrenceFrequency: "weekly",
        startsAt: "2020-05-06T18:00:00.000Z",
      }),
      {
        rangeEnd: "2026-05-16T00:00:00.000Z",
        rangeStart: "2026-05-08T00:00:00.000Z",
      },
      TRIBE_EVENT_RANGE_MATCH.overlaps
    );

    expect(occurrences).toEqual([
      {
        endsAt: "2026-05-09T18:00:00.000Z",
        startsAt: "2026-05-06T18:00:00.000Z",
      },
      {
        endsAt: "2026-05-16T18:00:00.000Z",
        startsAt: "2026-05-13T18:00:00.000Z",
      },
    ]);
  });

  it("keeps the last slot of a finished series while it still runs past the until date", () => {
    const occurrences = expandTribeEventOccurrences(
      createSchedule({
        endsAt: "2026-05-07T02:00:00.000Z",
        recurrenceFrequency: "weekly",
        recurrenceUntil: "2026-05-13T18:00:00.000Z",
        startsAt: "2026-05-06T18:00:00.000Z",
      }),
      {
        rangeEnd: "2026-06-13T23:00:00.000Z",
        rangeStart: "2026-05-13T23:00:00.000Z",
      },
      TRIBE_EVENT_RANGE_MATCH.overlaps
    );

    expect(occurrences.map((occurrence) => occurrence.startsAt)).toEqual([
      "2026-05-13T18:00:00.000Z",
    ]);
  });

  it("recognizes real slots of the series and rejects arbitrary instants", () => {
    const schedule = createSchedule({ recurrenceFrequency: "weekly" });

    expect(isTribeEventOccurrence(schedule, "2026-05-13T18:00:00.000Z")).toBe(true);
    expect(isTribeEventOccurrence(schedule, "2026-05-13T18:30:00.000Z")).toBe(false);
    expect(isTribeEventOccurrence(createSchedule(), "2026-05-13T18:00:00.000Z")).toBe(
      false
    );
    expect(isTribeEventOccurrence(schedule, "not-a-date")).toBe(false);
  });

  it("builds RFC 5545 recurrence rules", () => {
    expect(buildTribeEventRecurrenceRule(createSchedule())).toBeNull();
    expect(
      buildTribeEventRecurrenceRule(createSchedule({ recurrenceFrequency: "biweekly" }))
    ).toBe("FREQ=WEEKLY;INTERVAL=2");
    expect(
      buildTribeEventRecurrenceRule(
        createSchedule({
          recurrenceFrequency: "monthly",
          recurrenceUntil: "2026-06-30T02:59:59.000Z",
        })
      )
    ).toBe("FREQ=MONTHLY;UNTIL=20260630T025959Z");
    expect(formatCalendarUtcDateTime("2026-05-06T18:00:00.000Z")).toBe("20260506T180000Z");
  });
});
