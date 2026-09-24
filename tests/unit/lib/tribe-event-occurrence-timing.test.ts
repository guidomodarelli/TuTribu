import { describe, expect, it } from "vitest";

import {
  TRIBE_EVENT_OCCURRENCE_PHASE,
  formatOccurrenceCountdown,
  getOccurrencePhase,
  getOccurrencePhaseChangeTimes,
  hasOccurrenceFinishedBetween,
  isOccurrenceJoinable,
} from "@/lib/events/tribe-event-occurrence-timing";

const STARTS_AT = "2026-05-06T18:00:00.000Z";
const START_TIME = Date.parse(STARTS_AT);
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("getOccurrencePhase", () => {
  const withEnd = { endsAt: "2026-05-06T19:30:00.000Z", startsAt: STARTS_AT };
  const withoutEnd = { endsAt: null, startsAt: STARTS_AT };

  it("is upcoming before the start", () => {
    expect(getOccurrencePhase(withEnd, START_TIME - MINUTE)).toBe(
      TRIBE_EVENT_OCCURRENCE_PHASE.upcoming
    );
  });

  it("is live from the start until right before the end", () => {
    expect(getOccurrencePhase(withEnd, START_TIME)).toBe(TRIBE_EVENT_OCCURRENCE_PHASE.live);
    expect(getOccurrencePhase(withEnd, Date.parse(withEnd.endsAt) - MINUTE)).toBe(
      TRIBE_EVENT_OCCURRENCE_PHASE.live
    );
  });

  it("is past once the end is reached", () => {
    expect(getOccurrencePhase(withEnd, Date.parse(withEnd.endsAt))).toBe(
      TRIBE_EVENT_OCCURRENCE_PHASE.past
    );
  });

  it("keeps an occurrence without end live for the default duration", () => {
    expect(getOccurrencePhase(withoutEnd, START_TIME + 30 * MINUTE)).toBe(
      TRIBE_EVENT_OCCURRENCE_PHASE.live
    );
    expect(getOccurrencePhase(withoutEnd, START_TIME + HOUR)).toBe(
      TRIBE_EVENT_OCCURRENCE_PHASE.past
    );
  });
});

describe("isOccurrenceJoinable", () => {
  const occurrence = { endsAt: null, startsAt: STARTS_AT };

  it("opens the join window 15 minutes before the start", () => {
    expect(isOccurrenceJoinable(occurrence, START_TIME - 16 * MINUTE)).toBe(false);
    expect(isOccurrenceJoinable(occurrence, START_TIME - 15 * MINUTE)).toBe(true);
  });

  it("stays open while live and closes after the end", () => {
    expect(isOccurrenceJoinable(occurrence, START_TIME + 10 * MINUTE)).toBe(true);
    expect(isOccurrenceJoinable(occurrence, START_TIME + HOUR)).toBe(false);
  });
});

describe("formatOccurrenceCountdown", () => {
  it("counts whole days when the start is a day or more away", () => {
    expect(formatOccurrenceCountdown(STARTS_AT, START_TIME - 3 * DAY - 5 * HOUR)).toBe(
      "Empieza en 3 días"
    );
    expect(formatOccurrenceCountdown(STARTS_AT, START_TIME - DAY)).toBe("Empieza en 1 día");
  });

  it("counts hours and minutes within the same day", () => {
    expect(formatOccurrenceCountdown(STARTS_AT, START_TIME - 2 * HOUR - 15 * MINUTE)).toBe(
      "Empieza en 2 h 15 min"
    );
    expect(formatOccurrenceCountdown(STARTS_AT, START_TIME - 2 * HOUR)).toBe(
      "Empieza en 2 h"
    );
  });

  it("counts minutes in the last hour and never shows zero", () => {
    expect(formatOccurrenceCountdown(STARTS_AT, START_TIME - 8 * MINUTE)).toBe(
      "Empieza en 8 min"
    );
    expect(formatOccurrenceCountdown(STARTS_AT, START_TIME - 20_000)).toBe(
      "Empieza en 1 min"
    );
  });
});

describe("hasOccurrenceFinishedBetween", () => {
  const withEnd = { endsAt: "2026-05-06T19:00:00.000Z", startsAt: STARTS_AT };
  const withoutEnd = { endsAt: null, startsAt: "2026-05-07T18:00:00.000Z" };
  const endTime = Date.parse(withEnd.endsAt);

  it("detects an occurrence whose end falls inside the elapsed interval", () => {
    expect(hasOccurrenceFinishedBetween([withEnd], endTime - MINUTE, endTime)).toBe(true);
    expect(hasOccurrenceFinishedBetween([withEnd], endTime - HOUR, endTime + HOUR)).toBe(true);
  });

  it("ignores occurrences that finished before or finish after the interval", () => {
    expect(hasOccurrenceFinishedBetween([withEnd], endTime, endTime + MINUTE)).toBe(false);
    expect(hasOccurrenceFinishedBetween([withEnd], endTime - 2 * MINUTE, endTime - MINUTE)).toBe(
      false
    );
  });

  it("uses the default duration for occurrences without an explicit end", () => {
    const defaultEndTime = Date.parse(withoutEnd.startsAt) + HOUR;

    expect(
      hasOccurrenceFinishedBetween([withoutEnd], defaultEndTime - MINUTE, defaultEndTime)
    ).toBe(true);
  });

  it("never reports a finish when the clock did not move forward", () => {
    expect(hasOccurrenceFinishedBetween([withEnd], endTime, endTime)).toBe(false);
    expect(hasOccurrenceFinishedBetween([withEnd], endTime + MINUTE, endTime - MINUTE)).toBe(
      false
    );
  });
});

describe("getOccurrencePhaseChangeTimes", () => {
  it("lists the join window start, the start and the end of the occurrence", () => {
    expect(
      getOccurrencePhaseChangeTimes({ endsAt: "2026-05-06T19:30:15.000Z", startsAt: STARTS_AT })
    ).toEqual([START_TIME - 15 * MINUTE, START_TIME, Date.parse("2026-05-06T19:30:15.000Z")]);
  });

  it("uses the default duration as the end of an occurrence without end", () => {
    expect(getOccurrencePhaseChangeTimes({ endsAt: null, startsAt: STARTS_AT })).toEqual([
      START_TIME - 15 * MINUTE,
      START_TIME,
      START_TIME + HOUR,
    ]);
  });
});
