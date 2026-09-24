import { describe, expect, it } from "vitest";

import type {
  TribeEventOccurrenceException,
  TribeEventSchedule,
} from "@/src/modules/events/domain/entities/tribe-event";
import {
  expandTribeEventOccurrencesWithExceptions,
  findTribeEventOccurrenceException,
  resolveTribeEventOccurrenceByOriginalStart,
} from "@/src/modules/events/domain/services/tribe-event-occurrence-exceptions";

const EVENT_ID = "6f3c7a1e-2b4d-4c8e-9f10-1a2b3c4d5e6f";

// Weekly on Thursdays 18:00-19:00 Buenos Aires (21:00-22:00 UTC).
const weeklySeries: TribeEventSchedule = {
  endsAt: "2026-05-07T22:00:00.000Z",
  recurrenceFrequency: "weekly",
  recurrenceUntil: null,
  startsAt: "2026-05-07T21:00:00.000Z",
};
const MAY_RANGE = {
  rangeEnd: "2026-06-01T03:00:00.000Z",
  rangeStart: "2026-05-01T03:00:00.000Z",
};
const JUNE_RANGE = {
  rangeEnd: "2026-07-01T03:00:00.000Z",
  rangeStart: "2026-06-01T03:00:00.000Z",
};

function createException(
  overrides: Partial<TribeEventOccurrenceException>
): TribeEventOccurrenceException {
  return {
    eventId: EVENT_ID,
    kind: "cancelled",
    newEndsAt: null,
    newStartsAt: null,
    originalStartsAt: "2026-05-14T21:00:00.000Z",
    reason: null,
    ...overrides,
  };
}

describe("expandTribeEventOccurrencesWithExceptions", () => {
  it("keeps regular slots keyed by their original start", () => {
    const occurrences = expandTribeEventOccurrencesWithExceptions(weeklySeries, [], MAY_RANGE);

    expect(occurrences).toHaveLength(4);
    expect(occurrences[0]).toEqual({
      endsAt: "2026-05-07T22:00:00.000Z",
      exception: null,
      originalStartsAt: "2026-05-07T21:00:00.000Z",
      startsAt: "2026-05-07T21:00:00.000Z",
    });
  });

  it("marks a cancelled slot without removing it", () => {
    const occurrences = expandTribeEventOccurrencesWithExceptions(
      weeklySeries,
      [createException({ reason: "Feriado" })],
      MAY_RANGE
    );

    expect(occurrences).toHaveLength(4);
    expect(occurrences[1]).toEqual({
      endsAt: "2026-05-14T22:00:00.000Z",
      exception: { kind: "cancelled", reason: "Feriado" },
      originalStartsAt: "2026-05-14T21:00:00.000Z",
      startsAt: "2026-05-14T21:00:00.000Z",
    });
  });

  it("shows a moved slot at its new time, keeps the series duration, and sorts by the new start", () => {
    const occurrences = expandTribeEventOccurrencesWithExceptions(
      weeklySeries,
      [
        createException({
          kind: "moved",
          newStartsAt: "2026-05-22T21:30:00.000Z",
          originalStartsAt: "2026-05-14T21:00:00.000Z",
        }),
      ],
      MAY_RANGE
    );

    expect(occurrences.map((occurrence) => occurrence.startsAt)).toEqual([
      "2026-05-07T21:00:00.000Z",
      "2026-05-21T21:00:00.000Z",
      "2026-05-22T21:30:00.000Z",
      "2026-05-28T21:00:00.000Z",
    ]);
    expect(occurrences[2]).toEqual({
      endsAt: "2026-05-22T22:30:00.000Z",
      exception: { kind: "moved", reason: null },
      originalStartsAt: "2026-05-14T21:00:00.000Z",
      startsAt: "2026-05-22T21:30:00.000Z",
    });
  });

  it("uses the explicit new end of a moved slot", () => {
    const [occurrence] = expandTribeEventOccurrencesWithExceptions(
      weeklySeries,
      [
        createException({
          kind: "moved",
          newEndsAt: "2026-05-07T23:30:00.000Z",
          newStartsAt: "2026-05-07T22:00:00.000Z",
          originalStartsAt: "2026-05-07T21:00:00.000Z",
        }),
      ],
      MAY_RANGE
    );

    expect(occurrence.endsAt).toBe("2026-05-07T23:30:00.000Z");
  });

  it("moves a slot out of its original month into the month of its new start", () => {
    const movedToJune = createException({
      kind: "moved",
      newStartsAt: "2026-06-02T21:00:00.000Z",
      originalStartsAt: "2026-05-28T21:00:00.000Z",
    });

    const mayStarts = expandTribeEventOccurrencesWithExceptions(
      weeklySeries,
      [movedToJune],
      MAY_RANGE
    ).map((occurrence) => occurrence.originalStartsAt);
    const juneOccurrences = expandTribeEventOccurrencesWithExceptions(
      weeklySeries,
      [movedToJune],
      JUNE_RANGE
    );

    expect(mayStarts).not.toContain("2026-05-28T21:00:00.000Z");
    expect(juneOccurrences[0]).toMatchObject({
      originalStartsAt: "2026-05-28T21:00:00.000Z",
      startsAt: "2026-06-02T21:00:00.000Z",
    });
  });

  it("ignores exceptions whose original start is no longer a slot of the series", () => {
    const occurrences = expandTribeEventOccurrencesWithExceptions(
      weeklySeries,
      [
        createException({ originalStartsAt: "2026-05-15T21:00:00.000Z" }),
        createException({
          kind: "moved",
          newStartsAt: "2026-05-20T21:00:00.000Z",
          originalStartsAt: "2026-05-16T21:00:00.000Z",
        }),
      ],
      MAY_RANGE
    );

    expect(occurrences).toHaveLength(4);
    expect(occurrences.every((occurrence) => occurrence.exception === null)).toBe(true);
  });

  it("matches exceptions whatever the ISO form stored by the database", () => {
    const occurrences = expandTribeEventOccurrencesWithExceptions(
      weeklySeries,
      [createException({ originalStartsAt: "2026-05-14T18:00:00-03:00" })],
      MAY_RANGE
    );

    expect(occurrences[1].exception).toEqual({ kind: "cancelled", reason: null });
  });
});

describe("findTribeEventOccurrenceException", () => {
  it("finds the exception of an original start", () => {
    const exception = createException({});

    expect(
      findTribeEventOccurrenceException([exception], "2026-05-14T21:00:00.000Z")
    ).toBe(exception);
    expect(findTribeEventOccurrenceException([exception], "2026-05-21T21:00:00.000Z")).toBeNull();
  });
});

describe("overlap matching and resolution by original start", () => {
  // A window that starts in the middle of the 20 May (moved) date.
  const IN_PROGRESS_RANGE = {
    rangeEnd: "2026-06-19T21:30:00.000Z",
    rangeStart: "2026-05-20T21:30:00.000Z",
  };
  const movedToWednesday = createException({
    kind: "moved",
    newStartsAt: "2026-05-20T21:00:00.000Z",
  });

  it("keeps a moved date that is still in progress when matching by overlap", () => {
    const byStart = expandTribeEventOccurrencesWithExceptions(
      weeklySeries,
      [movedToWednesday],
      IN_PROGRESS_RANGE
    );
    const byOverlap = expandTribeEventOccurrencesWithExceptions(
      weeklySeries,
      [movedToWednesday],
      IN_PROGRESS_RANGE,
      "overlaps"
    );

    expect(byStart.map((occurrence) => occurrence.originalStartsAt)).not.toContain(
      "2026-05-14T21:00:00.000Z"
    );
    expect(byOverlap[0]).toMatchObject({
      endsAt: "2026-05-20T22:00:00.000Z",
      originalStartsAt: "2026-05-14T21:00:00.000Z",
      startsAt: "2026-05-20T21:00:00.000Z",
    });
  });

  it("resolves the effective times of a slot from its original start", () => {
    expect(
      resolveTribeEventOccurrenceByOriginalStart(
        weeklySeries,
        [movedToWednesday],
        "2026-05-14T21:00:00.000Z"
      )
    ).toMatchObject({ originalStartsAt: "2026-05-14T21:00:00.000Z", startsAt: "2026-05-20T21:00:00.000Z" });
    expect(
      resolveTribeEventOccurrenceByOriginalStart(weeklySeries, [], "2026-05-21T21:00:00.000Z")
    ).toEqual({
      endsAt: "2026-05-21T22:00:00.000Z",
      exception: null,
      originalStartsAt: "2026-05-21T21:00:00.000Z",
      startsAt: "2026-05-21T21:00:00.000Z",
    });
    expect(
      resolveTribeEventOccurrenceByOriginalStart(weeklySeries, [], "2026-05-22T21:00:00.000Z")
    ).toBeNull();
  });
});
