import ICAL from "ical.js";
import { describe, expect, it } from "vitest";

import type { TribeEventCalendarFeedSeriesResult } from "@/src/modules/events/application/results/tribe-event-result";
import { buildTribeEventIcsFile } from "@/src/modules/events/infrastructure/calendar/ics-calendar-file";
import {
  escapeIcsText,
  foldIcsLine,
  formatIcsUri,
} from "@/src/modules/events/infrastructure/calendar/ics-content-lines";
import { buildTribeCalendarFeedIcsFile } from "@/src/modules/events/infrastructure/calendar/tribe-calendar-feed-ics-file";

const EVENT_ID = "6f3c7a1e-2b4d-4c8e-9f10-1a2b3c4d5e6f";
const SOCIAL_ID = "7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d";
const ICS_LINE_OCTET_LIMIT = 75;
const LAST_MODIFIED_AT = "2026-05-01T10:00:30.000Z";
const CALENDAR_SEQUENCE = 3;

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
  calendarSequence: CALENDAR_SEQUENCE,
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
  calendarSequence: 0,
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

describe("escapeIcsText", () => {
  it("escapes CRLF, bare LF, and bare CR as the literal \\n sequence", () => {
    expect(escapeIcsText("uno\r\ndos\ntres\rcuatro")).toBe("uno\\ndos\\ntres\\ncuatro");
  });

  it("drops control characters RFC 5545 does not allow in TEXT but keeps tabs", () => {
    expect(escapeIcsText("a\u0000b\u0007c\u001Bd\u007Fe\tf")).toBe("abcde\tf");
  });

  it("never leaves a raw carriage return or line feed in the escaped value", () => {
    expect(escapeIcsText("Tribu\rSUMMARY:inyectado\r\n\n\r")).not.toMatch(/[\r\n]/);
  });
});

describe("formatIcsUri", () => {
  it("keeps commas and semicolons of a URI untouched", () => {
    expect(formatIcsUri("https://meet.example.com/sala;tipo=a,b?x=1,2;y=3")).toBe(
      "https://meet.example.com/sala;tipo=a,b?x=1,2;y=3"
    );
  });

  it("serializes the canonical WHATWG form, percent-encoding spaces", () => {
    expect(formatIcsUri("https://example.com/a b")).toBe("https://example.com/a%20b");
  });

  it("percent-encodes a non-ASCII path as UTF-8 octets", () => {
    expect(formatIcsUri("https://example.com/reunión/año")).toBe(
      "https://example.com/reuni%C3%B3n/a%C3%B1o"
    );
  });

  it("turns a path backslash into a slash, as browsers resolve it", () => {
    expect(formatIcsUri("https://example.com/sala\\taller")).toBe(
      "https://example.com/sala/taller"
    );
  });

  it("percent-encodes characters the canonical form still leaves invalid in RFC 3986", () => {
    expect(formatIcsUri("https://example.com/?q=a\\b^c|d{e}`")).toBe(
      "https://example.com/?q=a%5Cb%5Ec%7Cd%7Be%7D%60"
    );
  });

  it("drops line breaks and percent-encodes other control characters", () => {
    expect(formatIcsUri("https://meet.example.com/a\r\nX-INJECTED:1\u0000\t\u007F")).toBe(
      "https://meet.example.com/aX-INJECTED:1%00%7F"
    );
  });

  it("encodes a stray percent sign that does not start a percent-encoded triplet", () => {
    expect(formatIcsUri("https://example.com/?q=100%")).toBe("https://example.com/?q=100%25");
    expect(formatIcsUri("https://example.com/%zz")).toBe("https://example.com/%25zz");
    expect(formatIcsUri("https://example.com/?q=5%2")).toBe("https://example.com/?q=5%252");
  });

  it("preserves valid percent-encoded triplets next to commas and semicolons", () => {
    expect(formatIcsUri("https://example.com/a%2Fb?x=1%20,2;y=%e2%82%ac")).toBe(
      "https://example.com/a%2Fb?x=1%20,2;y=%e2%82%ac"
    );
  });

  it("returns null when the value is not a parseable URL", () => {
    expect(formatIcsUri("not a url")).toBeNull();
  });
});

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
    expect(master.getFirstPropertyValue("sequence")).toBe(CALENDAR_SEQUENCE);
    expect(String(master.getFirstPropertyValue("last-modified"))).toBe("2026-05-01T10:00:30Z");
    expect(String(master.getFirstPropertyValue("dtstamp"))).toBe("2026-05-01T10:00:30Z");

    expect(movedOverride.getFirstPropertyValue("uid")).toBe(`${EVENT_ID}@tutribu`);
    expect(String(movedOverride.getFirstPropertyValue("recurrence-id"))).toBe(
      "2026-05-21T21:00:00Z"
    );
    expect(String(movedOverride.getFirstPropertyValue("dtstart"))).toBe("2026-05-22T21:00:00Z");
    expect(movedOverride.getFirstPropertyValue("sequence")).toBe(CALENDAR_SEQUENCE);

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

  it("raises SEQUENCE for a second revision saved within the same minute", () => {
    const readMasterSequence = (series: TribeEventCalendarFeedSeriesResult) => {
      const calendar = new ICAL.Component(
        ICAL.parse(buildTribeCalendarFeedIcsFile({ calendarName: "Tribu", series: [series] }).content)
      );

      return calendar.getAllSubcomponents("vevent")[0].getFirstPropertyValue("sequence");
    };
    const firstRevision = readMasterSequence(weeklySeries);
    const secondRevision = readMasterSequence({
      ...weeklySeries,
      calendarSequence: CALENDAR_SEQUENCE + 1,
      event: { ...weeklySeries.event, title: "Taller semanal renombrado" },
      lastModifiedAt: "2026-05-01T10:00:45.000Z",
    });

    expect(Number(secondRevision)).toBeGreaterThan(Number(firstRevision));
  });

  it("is deterministic for the same data, so the ETag only changes with the calendar", () => {
    expect(buildFeed().content).toBe(buildFeed().content);
  });

  it("keeps user text with bare carriage returns inside its own content line", () => {
    const content = buildTribeCalendarFeedIcsFile({
      calendarName: "Tribu\rX-INJECTED:1",
      series: [
        {
          ...singleEvent,
          event: {
            ...singleEvent.event,
            description: "Línea\rDTSTART:20300101T000000Z",
            title: "Asado\rUID:otro",
          },
        },
      ],
    }).content;

    expect(content.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
    expect(content.split("\r\n")).toEqual(
      expect.arrayContaining([
        "X-WR-CALNAME:Tribu\\nX-INJECTED:1",
        "SUMMARY:Asado\\nUID:otro",
        "DESCRIPTION:Línea\\nDTSTART:20300101T000000Z",
      ])
    );

    const vevent = new ICAL.Component(ICAL.parse(content)).getFirstSubcomponent("vevent");

    expect(vevent?.getFirstPropertyValue("summary")).toBe("Asado\nUID:otro");
  });

  it("serializes the meeting URL as a URI and keeps LOCATION escaped as TEXT", () => {
    const meetingUrl =
      "https://meet.example.com/sala;tipo=taller,avanzado?participantes=ana,beto;rol=invitado&extra=" +
      "x".repeat(40);
    const content = buildTribeCalendarFeedIcsFile({
      calendarName: "Tribu",
      series: [{ ...singleEvent, event: { ...singleEvent.event, meetingUrl } }],
    }).content;
    const unfoldedLines = content.replace(/\r\n /g, "").split("\r\n");

    expect(unfoldedLines).toEqual(
      expect.arrayContaining([
        `URL:${meetingUrl}`,
        `LOCATION:${meetingUrl.replace(/[;,]/g, (character) => "\\" + character)}`,
      ])
    );
    expect(
      content.split("\r\n").every((line) => octetLength(line) <= ICS_LINE_OCTET_LIMIT)
    ).toBe(true);

    const vevent = new ICAL.Component(ICAL.parse(content)).getFirstSubcomponent("vevent");

    expect(vevent?.getFirstPropertyValue("url")).toBe(meetingUrl);
    expect(vevent?.getFirstPropertyValue("location")).toBe(meetingUrl);
  });

  it("emits the canonical meeting URL that ical.js reads back while LOCATION keeps the stored text", () => {
    const meetingUrl = "https://example.com/sala de reunión\\taller;tipo=a,b";
    const content = buildTribeCalendarFeedIcsFile({
      calendarName: "Tribu",
      series: [{ ...singleEvent, event: { ...singleEvent.event, meetingUrl } }],
    }).content;
    const vevent = new ICAL.Component(ICAL.parse(content)).getFirstSubcomponent("vevent");

    expect(vevent?.getFirstPropertyValue("url")).toBe(
      "https://example.com/sala%20de%20reuni%C3%B3n/taller;tipo=a,b"
    );
    expect(vevent?.getFirstPropertyValue("location")).toBe(meetingUrl);
  });

  it("emits a meeting URL with a stray percent sign that ical.js reads back encoded", () => {
    const meetingUrl = "https://example.com/sala;tipo=a,b?q=100%&r=%2F";
    const content = buildTribeCalendarFeedIcsFile({
      calendarName: "Tribu",
      series: [{ ...singleEvent, event: { ...singleEvent.event, meetingUrl } }],
    }).content;
    const vevent = new ICAL.Component(ICAL.parse(content)).getFirstSubcomponent("vevent");

    expect(vevent?.getFirstPropertyValue("url")).toBe(
      "https://example.com/sala;tipo=a,b?q=100%25&r=%2F"
    );
    expect(vevent?.getFirstPropertyValue("location")).toBe(meetingUrl);
  });

  it("omits URL but keeps LOCATION when the stored meeting URL cannot be parsed", () => {
    const content = buildTribeCalendarFeedIcsFile({
      calendarName: "Tribu",
      series: [
        { ...singleEvent, event: { ...singleEvent.event, meetingUrl: "sala del club" } },
      ],
    }).content;
    const vevent = new ICAL.Component(ICAL.parse(content)).getFirstSubcomponent("vevent");

    expect(vevent?.hasProperty("url")).toBe(false);
    expect(vevent?.getFirstPropertyValue("location")).toBe("sala del club");
  });

  it("never lets line breaks in a stored meeting URL open a new content line", () => {
    const content = buildTribeCalendarFeedIcsFile({
      calendarName: "Tribu",
      series: [
        {
          ...singleEvent,
          event: {
            ...singleEvent.event,
            meetingUrl: "https://meet.example.com/a\r\nX-INJECTED:1\nUID:otro",
          },
        },
      ],
    }).content;

    expect(content.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
    expect(content).toContain("URL:https://meet.example.com/aX-INJECTED:1UID:otro");
    expect(content.split("\r\n").some((line) => line.startsWith("X-INJECTED"))).toBe(false);

    const vevent = new ICAL.Component(ICAL.parse(content)).getFirstSubcomponent("vevent");

    expect(vevent?.getAllProperties("uid")).toHaveLength(1);
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
