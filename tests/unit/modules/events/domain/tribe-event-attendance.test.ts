import { describe, expect, it } from "vitest";

import {
  calculateTribeEventAttendanceStreak,
  getTribeEventRemainingSpots,
  getWaitlistRefillLookbackStart,
  selectRecentPastOccurrences,
  selectRefillableWaitlistOccurrenceStarts,
} from "@/src/modules/events/domain/services/tribe-event-attendance";

const NOW = Date.parse("2026-06-01T12:00:00.000Z");

function occurrence(startsAt: string, viewerStatus: string | null = null) {
  return { endsAt: null, startsAt, viewerStatus };
}

describe("getTribeEventRemainingSpots", () => {
  it("returns null when the event has no capacity", () => {
    expect(getTribeEventRemainingSpots(null, 40)).toBeNull();
  });

  it("returns the free seats and never a negative number", () => {
    expect(getTribeEventRemainingSpots(10, 7)).toBe(3);
    expect(getTribeEventRemainingSpots(10, 10)).toBe(0);
    // Capacity lowered below the people already going: nobody is expelled.
    expect(getTribeEventRemainingSpots(3, 5)).toBe(0);
  });
});

describe("selectRecentPastOccurrences", () => {
  it("keeps only finished occurrences, the latest ones, oldest first", () => {
    const occurrences = [
      occurrence("2026-05-04T18:00:00.000Z"),
      occurrence("2026-05-25T18:00:00.000Z"),
      occurrence("2026-05-11T18:00:00.000Z"),
      occurrence("2026-05-18T18:00:00.000Z"),
      // Still running at NOW (default duration of 60 minutes).
      occurrence("2026-06-01T11:30:00.000Z"),
      occurrence("2026-06-08T18:00:00.000Z"),
    ];

    expect(
      selectRecentPastOccurrences(occurrences, NOW, 3).map((item) => item.startsAt)
    ).toEqual([
      "2026-05-11T18:00:00.000Z",
      "2026-05-18T18:00:00.000Z",
      "2026-05-25T18:00:00.000Z",
    ]);
  });
});

describe("calculateTribeEventAttendanceStreak", () => {
  const rule = { minimumAttended: 2, windowSize: 5 };

  it("counts going answers among the last finished occurrences", () => {
    const occurrences = [
      occurrence("2026-04-27T18:00:00.000Z", "going"),
      occurrence("2026-05-04T18:00:00.000Z", "going"),
      occurrence("2026-05-11T18:00:00.000Z", "maybe"),
      occurrence("2026-05-18T18:00:00.000Z", "going"),
      occurrence("2026-05-25T18:00:00.000Z", "going"),
      occurrence("2026-05-28T18:00:00.000Z", "going"),
      occurrence("2026-06-08T18:00:00.000Z", "going"),
    ];

    expect(calculateTribeEventAttendanceStreak(occurrences, NOW, rule)).toEqual({
      attendedCount: 4,
      occurrenceCount: 5,
    });
  });

  it("does not count waitlisted, maybe, or not going answers as attended", () => {
    const occurrences = [
      occurrence("2026-05-11T18:00:00.000Z", "waitlisted"),
      occurrence("2026-05-18T18:00:00.000Z", "going"),
      occurrence("2026-05-25T18:00:00.000Z", "not_going"),
    ];

    expect(calculateTribeEventAttendanceStreak(occurrences, NOW, rule)).toBeNull();
  });

  it("reports the smaller window when the tribe has fewer past occurrences", () => {
    const occurrences = [
      occurrence("2026-05-18T18:00:00.000Z", "going"),
      occurrence("2026-05-25T18:00:00.000Z", "going"),
    ];

    expect(calculateTribeEventAttendanceStreak(occurrences, NOW, rule)).toEqual({
      attendedCount: 2,
      occurrenceCount: 2,
    });
  });
});

describe("selectRefillableWaitlistOccurrenceStarts", () => {
  const weeklySeries = {
    endsAt: "2026-05-06T19:00:00.000Z",
    recurrenceFrequency: "weekly" as const,
    recurrenceUntil: null,
    startsAt: "2026-05-06T18:00:00.000Z",
  };

  it("drops starts that are no longer slots of the updated schedule", () => {
    // Series moved from Wednesdays to Thursdays: the old Wednesday rows stay
    // as history and are never refilled.
    const movedSeries = {
      ...weeklySeries,
      endsAt: "2026-05-07T19:00:00.000Z",
      startsAt: "2026-05-07T18:00:00.000Z",
    };

    expect(
      selectRefillableWaitlistOccurrenceStarts(
        movedSeries,
        ["2026-06-03T18:00:00.000Z", "2026-06-04T18:00:00.000Z"],
        NOW
      )
    ).toEqual(["2026-06-04T18:00:00.000Z"]);
  });

  it("keeps an occurrence in progress and drops the ones that already ended", () => {
    const inProgressNow = Date.parse("2026-05-27T18:30:00.000Z");

    expect(
      selectRefillableWaitlistOccurrenceStarts(
        weeklySeries,
        [
          "2026-05-20T18:00:00.000Z",
          "2026-05-27T18:00:00.000Z",
          "2026-06-03T18:00:00.000Z",
        ],
        inProgressNow
      )
    ).toEqual(["2026-05-27T18:00:00.000Z", "2026-06-03T18:00:00.000Z"]);
  });

  it("uses the implicit duration when the series has no end time", () => {
    const openEndedSeries = { ...weeklySeries, endsAt: null };

    expect(
      selectRefillableWaitlistOccurrenceStarts(
        openEndedSeries,
        ["2026-05-27T18:00:00.000Z"],
        Date.parse("2026-05-27T18:59:00.000Z")
      )
    ).toEqual(["2026-05-27T18:00:00.000Z"]);
    expect(
      selectRefillableWaitlistOccurrenceStarts(
        openEndedSeries,
        ["2026-05-27T18:00:00.000Z"],
        Date.parse("2026-05-27T19:00:00.000Z")
      )
    ).toEqual([]);
  });

  it("normalizes the starts and ignores values that are not dates", () => {
    expect(
      selectRefillableWaitlistOccurrenceStarts(
        weeklySeries,
        ["2026-06-03T15:00:00-03:00", "not-a-date"],
        NOW
      )
    ).toEqual(["2026-06-03T18:00:00.000Z"]);
  });
});

describe("getWaitlistRefillLookbackStart", () => {
  it("reaches back one occurrence duration so occurrences in progress are candidates", () => {
    expect(
      getWaitlistRefillLookbackStart(
        {
          endsAt: "2026-05-06T20:30:00.000Z",
          recurrenceFrequency: "weekly",
          recurrenceUntil: null,
          startsAt: "2026-05-06T18:00:00.000Z",
        },
        NOW
      )
    ).toBe("2026-06-01T09:30:00.000Z");
  });

  it("uses the implicit duration when the series has no end time", () => {
    expect(
      getWaitlistRefillLookbackStart(
        {
          endsAt: null,
          recurrenceFrequency: "none",
          recurrenceUntil: null,
          startsAt: "2026-05-06T18:00:00.000Z",
        },
        NOW
      )
    ).toBe("2026-06-01T11:00:00.000Z");
  });
});
