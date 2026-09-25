import { describe, expect, it } from "vitest";

import type {
  TribeEvent,
  TribeEventOccurrenceException,
} from "@/src/modules/events/domain/entities/tribe-event";
import {
  createEmptyTribeEventReactionSummary,
  isTribeEventOccurrenceFinished,
  resolveTribeEventOccurrenceSlot,
} from "@/src/modules/events/domain/services/tribe-event-post-event";

const EVENT_ID = "6f3c7a1e-2b4d-4c8e-9f10-1a2b3c4d5e6f";

const weeklySeries: TribeEvent = {
  capacity: null,
  description: "Repaso semanal",
  endsAt: "2026-05-07T22:00:00.000Z",
  eventType: "workshop",
  id: EVENT_ID,
  meetingUrl: null,
  recurrenceFrequency: "weekly",
  recurrenceUntil: null,
  startsAt: "2026-05-07T21:00:00.000Z",
  title: "Taller semanal",
};

function buildException(
  overrides: Partial<TribeEventOccurrenceException>
): TribeEventOccurrenceException {
  return {
    eventId: EVENT_ID,
    kind: "moved",
    newEndsAt: null,
    newStartsAt: null,
    originalStartsAt: "2026-05-14T21:00:00.000Z",
    reason: null,
    ...overrides,
  };
}

describe("resolveTribeEventOccurrenceSlot", () => {
  it("resolves a regular slot of the series with its end", () => {
    expect(
      resolveTribeEventOccurrenceSlot(weeklySeries, null, "2026-05-14T21:00:00.000Z")
    ).toEqual({
      endsAt: "2026-05-14T22:00:00.000Z",
      exception: null,
      originalStartsAt: "2026-05-14T21:00:00.000Z",
      startsAt: "2026-05-14T21:00:00.000Z",
    });
  });

  it("returns null for an instant that is not a slot of the series", () => {
    expect(
      resolveTribeEventOccurrenceSlot(weeklySeries, null, "2026-05-15T21:00:00.000Z")
    ).toBeNull();
  });

  it("uses the effective times of a moved date", () => {
    const slot = resolveTribeEventOccurrenceSlot(
      weeklySeries,
      buildException({ newStartsAt: "2026-05-16T15:00:00.000Z" }),
      "2026-05-14T21:00:00.000Z"
    );

    expect(slot).toMatchObject({
      endsAt: "2026-05-16T16:00:00.000Z",
      originalStartsAt: "2026-05-14T21:00:00.000Z",
      startsAt: "2026-05-16T15:00:00.000Z",
    });
  });

  it("keeps a cancelled date flagged as cancelled", () => {
    const slot = resolveTribeEventOccurrenceSlot(
      weeklySeries,
      buildException({ kind: "cancelled" }),
      "2026-05-14T21:00:00.000Z"
    );

    expect(slot?.exception?.kind).toBe("cancelled");
  });
});

describe("isTribeEventOccurrenceFinished", () => {
  const slot = {
    endsAt: "2026-05-14T22:00:00.000Z",
    startsAt: "2026-05-14T21:00:00.000Z",
  };

  it("is finished once the effective end passed", () => {
    expect(isTribeEventOccurrenceFinished(slot, Date.parse("2026-05-14T22:00:00.000Z"))).toBe(
      true
    );
  });

  it("is not finished while the occurrence runs", () => {
    expect(isTribeEventOccurrenceFinished(slot, Date.parse("2026-05-14T21:30:00.000Z"))).toBe(
      false
    );
  });

  it("assumes the default duration when the occurrence has no end", () => {
    const openEnded = { endsAt: null, startsAt: "2026-05-14T21:00:00.000Z" };

    expect(
      isTribeEventOccurrenceFinished(openEnded, Date.parse("2026-05-14T21:59:00.000Z"))
    ).toBe(false);
    expect(
      isTribeEventOccurrenceFinished(openEnded, Date.parse("2026-05-14T22:00:00.000Z"))
    ).toBe(true);
  });
});

describe("createEmptyTribeEventReactionSummary", () => {
  it("counts zero for every reaction of the catalog", () => {
    expect(createEmptyTribeEventReactionSummary()).toEqual({
      counts: { fire: 0, neutral: 0, thumbs_up: 0 },
      viewerReaction: null,
    });
  });
});
