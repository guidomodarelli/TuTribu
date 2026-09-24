import { describe, expect, it } from "vitest";

import { getTribeEventOccurrenceEndTime } from "@/src/modules/events/domain/services/tribe-event-occurrence-timing";

describe("getTribeEventOccurrenceEndTime", () => {
  it("uses the explicit end when the occurrence has one", () => {
    expect(
      getTribeEventOccurrenceEndTime({
        endsAt: "2026-05-06T20:30:00.000Z",
        startsAt: "2026-05-06T18:00:00.000Z",
      })
    ).toBe(Date.parse("2026-05-06T20:30:00.000Z"));
  });

  it("assumes the default duration when the occurrence has no end", () => {
    expect(
      getTribeEventOccurrenceEndTime({
        endsAt: null,
        startsAt: "2026-05-06T18:00:00.000Z",
      })
    ).toBe(Date.parse("2026-05-06T19:00:00.000Z"));
  });
});
