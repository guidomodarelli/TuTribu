import { describe, expect, it } from "vitest";
import { buildTribeEventGoogleCalendarUrl } from "@/lib/events/tribe-event-calendar-links";
import type { TribeEventOccurrenceResult } from "@/src/modules/events/application/results/tribe-event-result";

const EVENT_ID = "6f3c7a1e-2b4d-4c8e-9f10-1a2b3c4d5e6f";
const SERIES_STARTS_AT = "2026-05-06T18:00:00.000Z";
const SERIES_ENDS_AT = "2026-05-06T19:00:00.000Z";
const LATER_SLOT_STARTS_AT = "2026-05-20T18:00:00.000Z";
const LATER_SLOT_ENDS_AT = "2026-05-20T19:00:00.000Z";

function createOccurrence(
  overrides: Partial<TribeEventOccurrenceResult> = {}
): TribeEventOccurrenceResult {
  const startsAt = overrides.startsAt ?? SERIES_STARTS_AT;

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
    description: "Repaso mensual",
    endsAt: SERIES_ENDS_AT,
    eventId: EVENT_ID,
    meetingUrl: "https://meet.google.com/abc-defg-hij",
    occurrenceKey: `${EVENT_ID}@${startsAt}`,
    recurrenceFrequency: "none",
    recurrenceRule: null,
    recurrenceUntil: null,
    seriesEndsAt: SERIES_ENDS_AT,
    seriesStartsAt: SERIES_STARTS_AT,
    eventType: "live",
    exception: null,
    originalStartsAt: startsAt,
    startsAt,
    title: "Clase abierta",
    ...overrides,
  };
}

describe("buildTribeEventGoogleCalendarUrl", () => {
  it("anchors a recurring export at the series start even from a later occurrence", () => {
    const url = new URL(
      buildTribeEventGoogleCalendarUrl(
        createOccurrence({
          endsAt: LATER_SLOT_ENDS_AT,
          recurrenceFrequency: "weekly",
          recurrenceRule: "FREQ=WEEKLY",
          startsAt: LATER_SLOT_STARTS_AT,
        })
      )
    );

    expect(url.searchParams.get("dates")).toBe("20260506T180000Z/20260506T190000Z");
    expect(url.searchParams.get("recur")).toBe("RRULE:FREQ=WEEKLY");
  });

  it("applies the default duration from the series start when the series has no end", () => {
    const url = new URL(
      buildTribeEventGoogleCalendarUrl(
        createOccurrence({
          endsAt: null,
          recurrenceFrequency: "weekly",
          recurrenceRule: "FREQ=WEEKLY",
          seriesEndsAt: null,
          startsAt: LATER_SLOT_STARTS_AT,
        })
      )
    );

    expect(url.searchParams.get("dates")).toBe("20260506T180000Z/20260506T190000Z");
  });

  it("keeps the occurrence times for a single event", () => {
    const url = new URL(
      buildTribeEventGoogleCalendarUrl(
        createOccurrence({
          endsAt: LATER_SLOT_ENDS_AT,
          seriesEndsAt: LATER_SLOT_ENDS_AT,
          seriesStartsAt: LATER_SLOT_STARTS_AT,
          startsAt: LATER_SLOT_STARTS_AT,
        })
      )
    );

    expect(url.searchParams.get("dates")).toBe("20260520T180000Z/20260520T190000Z");
    expect(url.searchParams.has("recur")).toBe(false);
  });
});
