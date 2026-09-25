import { describe, expect, it } from "vitest";

import { buildTribeEventGoogleCalendarUrl } from "@/lib/events/tribe-event-calendar-links";
import {
  formatMovedFromLabel,
  isOccurrenceCancelled,
} from "@/lib/events/tribe-event-occurrence-exception-copy";
import {
  filterOccurrencesByEventType,
  toggleEventTypeSelection,
} from "@/lib/events/tribe-event-type-filter";
import { buildTribeEventsRoute } from "@/lib/events/tribe-events-routes";
import type { TribeEventOccurrenceResult } from "@/src/modules/events/application/results/tribe-event-result";

const EVENT_ID = "6f3c7a1e-2b4d-4c8e-9f10-1a2b3c4d5e6f";

function createOccurrence(
  overrides: Partial<TribeEventOccurrenceResult> = {}
): TribeEventOccurrenceResult {
  const startsAt = overrides.startsAt ?? "2026-05-14T21:00:00.000Z";

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
    eventId: EVENT_ID,
    eventType: "live",
    exception: null,
    meetingUrl: null,
    occurrenceKey: `${EVENT_ID}@${startsAt}`,
    originalStartsAt: startsAt,
    recurrenceFrequency: "weekly",
    recurrenceRule: "FREQ=WEEKLY",
    recurrenceUntil: null,
    seriesEndsAt: null,
    seriesStartsAt: "2026-05-07T21:00:00.000Z",
    startsAt,
    title: "Taller semanal",
    ...overrides,
  };
}

describe("event type filter helpers", () => {
  it("toggles types keeping the catalog order", () => {
    expect(toggleEventTypeSelection([], "social")).toEqual(["social"]);
    expect(toggleEventTypeSelection(["social"], "live")).toEqual(["live", "social"]);
    expect(toggleEventTypeSelection(["live", "social"], "live")).toEqual(["social"]);
  });

  it("keeps every occurrence when nothing is selected", () => {
    const occurrences = [
      createOccurrence(),
      createOccurrence({ eventType: "social", startsAt: "2026-05-15T21:00:00.000Z" }),
    ];

    expect(filterOccurrencesByEventType(occurrences, [])).toBe(occurrences);
    expect(
      filterOccurrencesByEventType(occurrences, ["social"]).map(
        (occurrence) => occurrence.eventType
      )
    ).toEqual(["social"]);
  });

  it("repeats the type parameter in the events route", () => {
    const url = new URL(
      buildTribeEventsRoute("matematica-pro", { eventTypes: ["live", "qa"], month: "2026-05" }),
      "https://dev-tutribu.app"
    );

    expect(url.searchParams.getAll("type")).toEqual(["live", "qa"]);
    expect(url.searchParams.get("month")).toBe("2026-05");
  });
});

describe("occurrence exception copy", () => {
  it("says where a moved date comes from, adding the month when it changed", () => {
    expect(
      formatMovedFromLabel(
        createOccurrence({
          exception: { kind: "moved", reason: null },
          originalStartsAt: "2026-05-14T21:00:00.000Z",
          startsAt: "2026-05-15T21:00:00.000Z",
        })
      )
    ).toBe("Movido desde el jueves 14");
    expect(
      formatMovedFromLabel(
        createOccurrence({
          exception: { kind: "moved", reason: null },
          originalStartsAt: "2026-05-28T21:00:00.000Z",
          startsAt: "2026-06-02T21:00:00.000Z",
        })
      )
    ).toBe("Movido desde el jueves 28 de mayo");
    expect(formatMovedFromLabel(createOccurrence())).toBeNull();
  });

  it("detects cancelled dates", () => {
    expect(isOccurrenceCancelled(createOccurrence({ exception: { kind: "cancelled", reason: null } }))).toBe(true);
    expect(isOccurrenceCancelled(createOccurrence())).toBe(false);
  });

  it("exports a moved date to Google Calendar as a single event at its new time", () => {
    const seriesUrl = new URL(buildTribeEventGoogleCalendarUrl(createOccurrence()));
    const movedUrl = new URL(
      buildTribeEventGoogleCalendarUrl(
        createOccurrence({
          exception: { kind: "moved", reason: null },
          startsAt: "2026-05-15T21:00:00.000Z",
        })
      )
    );

    expect(seriesUrl.searchParams.get("recur")).toBe("RRULE:FREQ=WEEKLY");
    expect(movedUrl.searchParams.get("recur")).toBeNull();
    expect(movedUrl.searchParams.get("dates")).toBe("20260515T210000Z/20260515T220000Z");
  });
});
