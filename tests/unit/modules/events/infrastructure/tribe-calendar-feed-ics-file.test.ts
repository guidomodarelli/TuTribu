import ICAL from "ical.js";
import { describe, expect, it } from "vitest";

import type { TribeEventCalendarFeedSeriesResult } from "@/src/modules/events/application/results/tribe-event-result";
import { buildTribeEventIcsFile } from "@/src/modules/events/infrastructure/calendar/ics-calendar-file";
import { foldIcsLine } from "@/src/modules/events/infrastructure/calendar/ics-content-lines";
import { buildTribeCalendarFeedIcsFile } from "@/src/modules/events/infrastructure/calendar/tribe-calendar-feed-ics-file";

const EVENT_ID = "6f3c7a1e-2b4d-4c8e-9f10-1a2b3c4d5e6f";
const SOCIAL_ID = "7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d";
const ICS_LINE_OCTET_LIMIT = 75;
const LAST_MODIFIED_AT = "2026-05-01T10:00:30.000Z";

const weeklySeries: TribeEventCalendarFeedSeriesResult = {
  event: {
    capacity: null,
    description: "Traé preguntas; repasamos álgebra, funciones\ny límites 📐",
    endsAt: "2026-05-07T22:00:00.000Z",
    eventType: "workshop",
    id: EVENT_ID,
    meetingUrl: "https://meet.example.com/taller",
    recurrenceFrequency: "weekly",
    recurrenceRule: "FREQ=WEEKLY",
    recurrenceUntil: null,
    startsAt: "2026-05-07T21:00:00.000Z",
    title: "Taller semanal, álgebra; nivel 1",
  },
  lastModifiedAt: LAST_MODIFIED_AT,
  occurrenceExceptions: [
    {
      endsAt: "2026-05-14T22:00:00.000Z",
      exception: { kind: "cancelled", reason: "Feriado" },
      originalStartsAt: "2026-05-14T21:00:00.000Z",
      startsAt: "2026-05-14T21:00:00.000Z",
    },
    {
      endsAt: "2026-05-22T22:00:00.000Z",
      exception: { kind: "moved", reason: null },
      originalStartsAt: "2026-05-21T21:00:00.000Z",
      startsAt: "2026-05-22T21:00:00.000Z",
    },
  ],
};

const singleEvent: TribeEventCalendarFeedSeriesResult = {
  event: {
    capacity: 20,
    description: null,
    endsAt: null,
    eventType: "social",
    id: SOCIAL_ID,
    meetingUrl: null,
    recurrenceFrequency: "none",
    recurrenceRule: null,
    recurrenceUntil: null,
    startsAt: "2026-06-01T23:00:00.000Z",
    title: "Asado",
  },
  lastModifiedAt: "2026-05-02T10:00:00.000Z",
  occurrenceExceptions: [],
};

function octetLength(line: string): number {
  return new TextEncoder().encode(line).length;
}

function buildFeed() {
  return buildTribeCalendarFeedIcsFile({
    calendarName: "Matemática Pro, tribu; oficial",
    series: [weeklySeries, singleEvent],
  });
}

describe("foldIcsLine", () => {
  it("folds at 75 octets without splitting multi-byte characters", () => {
    const line = "DESCRIPTION:" + "ñ".repeat(60) + "📐".repeat(30);
    const folded = foldIcsLine(line).split("\r\n");

    expect(folded.length).toBeGreaterThan(1);
    expect(folded.every((segment) => octetLength(segment) <= ICS_LINE_OCTET_LIMIT)).toBe(true);
    // Unfolding (drop CRLF + one space) restores the original line exactly.
    expect(folded.map((segment, index) => (index === 0 ? segment : segment.slice(1))).join("")).toBe(
      line
    );
  });

  it("keeps short lines untouched", () => {
    expect(foldIcsLine("SUMMARY:Asado")).toBe("SUMMARY:Asado");
  });
});

describe("buildTribeCalendarFeedIcsFile", () => {
  it("declares the calendar name, time zone, and hourly refresh hints", () => {
    const lines = buildFeed().content.split("\r\n");

    expect(lines).toEqual(
      expect.arrayContaining([
        "BEGIN:VCALENDAR",
        "METHOD:PUBLISH",
        "X-WR-CALNAME:Matemática Pro\\, tribu\\; oficial",
        "X-WR-TIMEZONE:America/Argentina/Buenos_Aires",
        "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
        "X-PUBLISHED-TTL:PT1H",
      ])
    );
  });

  it("keeps every content line within 75 octets and ends lines with CRLF", () => {
    const { content } = buildFeed();

    expect(content.endsWith("\r\n")).toBe(true);
    expect(content.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
    expect(
      content.split("\r\n").every((line) => octetLength(line) <= ICS_LINE_OCTET_LIMIT)
    ).toBe(true);
  });

  it("is a valid iCalendar document that round-trips series, exceptions and text", () => {
    const calendar = new ICAL.Component(ICAL.parse(buildFeed().content));
    const events = calendar.getAllSubcomponents("vevent");

    // X- properties have no declared value type, so the parser keeps the
    // RFC 5545 TEXT escaping that calendar apps undo for X-WR-CALNAME.
    expect(calendar.getFirstPropertyValue("x-wr-calname")).toBe(
      "Matemática Pro\\, tribu\\; oficial"
    );
    expect(events).toHaveLength(3);

    const [master, movedOverride, single] = events;

    expect(master.getFirstPropertyValue("uid")).toBe(`${EVENT_ID}@tutribu`);
    expect(master.getFirstPropertyValue("summary")).toBe("Taller semanal, álgebra; nivel 1");
    expect(master.getFirstPropertyValue("description")).toBe(
      "Traé preguntas; repasamos álgebra, funciones\ny límites 📐"
    );
    expect(String(master.getFirstPropertyValue("rrule"))).toBe("FREQ=WEEKLY");
    expect(String(master.getFirstPropertyValue("exdate"))).toBe("2026-05-14T21:00:00Z");
    expect(master.getFirstPropertyValue("sequence")).toBe(
      Math.floor(Date.parse(LAST_MODIFIED_AT) / 60_000)
    );
    expect(String(master.getFirstPropertyValue("last-modified"))).toBe("2026-05-01T10:00:30Z");
    expect(String(master.getFirstPropertyValue("dtstamp"))).toBe("2026-05-01T10:00:30Z");

    expect(movedOverride.getFirstPropertyValue("uid")).toBe(`${EVENT_ID}@tutribu`);
    expect(String(movedOverride.getFirstPropertyValue("recurrence-id"))).toBe(
      "2026-05-21T21:00:00Z"
    );
    expect(String(movedOverride.getFirstPropertyValue("dtstart"))).toBe("2026-05-22T21:00:00Z");

    expect(single.getFirstPropertyValue("uid")).toBe(`${SOCIAL_ID}@tutribu`);
    expect(String(single.getFirstPropertyValue("dtend"))).toBe("2026-06-02T00:00:00Z");
  });

  it("expands the series in a calendar engine without the cancelled date", () => {
    const calendar = new ICAL.Component(ICAL.parse(buildFeed().content));
    const [master] = calendar.getAllSubcomponents("vevent");
    const iterator = new ICAL.Event(master).iterator();
    const starts = [0, 1, 2, 3].map(() => iterator.next()?.toString());

    expect(starts).toEqual([
      "2026-05-07T21:00:00Z",
      "2026-05-21T21:00:00Z",
      "2026-05-28T21:00:00Z",
      "2026-06-04T21:00:00Z",
    ]);
  });

  it("is deterministic for the same data, so the ETag only changes with the calendar", () => {
    expect(buildFeed().content).toBe(buildFeed().content);
  });

  it("produces an empty but valid calendar when there is nothing to show", () => {
    const calendar = new ICAL.Component(
      ICAL.parse(buildTribeCalendarFeedIcsFile({ calendarName: "Tribu", series: [] }).content)
    );

    expect(calendar.getAllSubcomponents("vevent")).toHaveLength(0);
  });
});

describe("buildTribeEventIcsFile after the shared line builder refactor", () => {
  it("still parses as a single-series download", () => {
    const icsFile = buildTribeEventIcsFile(
      weeklySeries.event,
      new Date("2026-05-01T00:00:00.000Z"),
      weeklySeries.occurrenceExceptions
    );
    const calendar = new ICAL.Component(ICAL.parse(icsFile.content));

    expect(calendar.getAllSubcomponents("vevent")).toHaveLength(2);
    expect(calendar.getFirstPropertyValue("x-wr-calname")).toBeNull();
    expect(
      icsFile.content.split("\r\n").every((line) => octetLength(line) <= ICS_LINE_OCTET_LIMIT)
    ).toBe(true);
  });
});
