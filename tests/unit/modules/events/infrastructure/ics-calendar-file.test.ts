import { describe, it, expect } from "vitest";
import { buildTribeEventIcsFile } from "@/src/modules/events/infrastructure/calendar/ics-calendar-file";

const NOW = new Date("2026-05-01T12:00:00.000Z");

describe("buildTribeEventIcsFile", () => {
  it("serializes a recurring event with escaped text, link, and CRLF line endings", () => {
    const icsFile = buildTribeEventIcsFile(
      {
        capacity: null,
        description: "Repaso mensual, con notas\nSegunda línea; fin",
        endsAt: "2026-05-06T19:00:00.000Z",
        eventType: "live",
        id: "6f3c7a1e-2b4d-4c8e-9f10-1a2b3c4d5e6f",
        meetingUrl: "https://meet.google.com/abc-defg-hij",
        recurrenceFrequency: "weekly",
        recurrenceRule: "FREQ=WEEKLY;UNTIL=20260630T025959Z",
        recurrenceUntil: "2026-06-30T02:59:59.000Z",
        startsAt: "2026-05-06T18:00:00.000Z",
        title: "Clase de Álgebra",
      },
      NOW
    );
    const lines = icsFile.content.split("\r\n");

    expect(icsFile.contentType).toBe("text/calendar; charset=utf-8");
    expect(icsFile.fileName).toBe("evento-clase-de-algebra.ics");
    expect(lines).toEqual(
      expect.arrayContaining([
        "BEGIN:VCALENDAR",
        "UID:6f3c7a1e-2b4d-4c8e-9f10-1a2b3c4d5e6f@tutribu",
        "DTSTAMP:20260501T120000Z",
        "DTSTART:20260506T180000Z",
        "DTEND:20260506T190000Z",
        "SUMMARY:Clase de Álgebra",
        "RRULE:FREQ=WEEKLY;UNTIL=20260630T025959Z",
        "DESCRIPTION:Repaso mensual\\, con notas\\nSegunda línea\\; fin",
        "URL:https://meet.google.com/abc-defg-hij",
        "END:VEVENT",
        "END:VCALENDAR",
      ])
    );
    expect(icsFile.content.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("assumes a default duration for events without an end time", () => {
    const icsFile = buildTribeEventIcsFile(
      {
        capacity: null,
        description: null,
        endsAt: null,
        eventType: "live",
        id: "6f3c7a1e-2b4d-4c8e-9f10-1a2b3c4d5e6f",
        meetingUrl: null,
        recurrenceFrequency: "none",
        recurrenceRule: null,
        recurrenceUntil: null,
        startsAt: "2026-05-06T18:00:00.000Z",
        title: "Clase abierta",
      },
      NOW
    );

    expect(icsFile.content).toContain("DTEND:20260506T190000Z");
    expect(icsFile.content).not.toContain("RRULE");
    expect(icsFile.content).not.toContain("DESCRIPTION");
  });

  it("folds long content lines so no line exceeds the RFC limit", () => {
    const icsFile = buildTribeEventIcsFile(
      {
        capacity: null,
        description: "x".repeat(200),
        endsAt: null,
        eventType: "live",
        id: "6f3c7a1e-2b4d-4c8e-9f10-1a2b3c4d5e6f",
        meetingUrl: null,
        recurrenceFrequency: "none",
        recurrenceRule: null,
        recurrenceUntil: null,
        startsAt: "2026-05-06T18:00:00.000Z",
        title: "Clase abierta",
      },
      NOW
    );
    const lines = icsFile.content.split("\r\n");

    expect(lines.every((line) => line.length <= 75)).toBe(true);
    expect(lines.some((line) => line.startsWith(" "))).toBe(true);
  });

  it("excludes cancelled dates with EXDATE and overrides moved dates with RECURRENCE-ID", () => {
    const icsFile = buildTribeEventIcsFile(
      {
        capacity: null,
        description: null,
        endsAt: "2026-05-07T22:00:00.000Z",
        eventType: "workshop",
        id: "6f3c7a1e-2b4d-4c8e-9f10-1a2b3c4d5e6f",
        meetingUrl: null,
        recurrenceFrequency: "weekly",
        recurrenceRule: "FREQ=WEEKLY",
        recurrenceUntil: null,
        startsAt: "2026-05-07T21:00:00.000Z",
        title: "Taller semanal",
      },
      NOW,
      [
        {
          endsAt: "2026-05-14T22:00:00.000Z",
          exception: { kind: "cancelled", reason: null },
          originalStartsAt: "2026-05-14T21:00:00.000Z",
          startsAt: "2026-05-14T21:00:00.000Z",
        },
        {
          endsAt: null,
          exception: { kind: "moved", reason: "Cambio de sala" },
          originalStartsAt: "2026-05-21T21:00:00.000Z",
          startsAt: "2026-05-22T21:30:00.000Z",
        },
      ]
    );
    const lines = icsFile.content.split("\r\n");
    const eventStarts = lines.filter((line) => line === "BEGIN:VEVENT");
    const overrideStart = lines.lastIndexOf("BEGIN:VEVENT");

    expect(eventStarts).toHaveLength(2);
    expect(lines).toContain("EXDATE:20260514T210000Z");
    expect(lines.slice(overrideStart)).toEqual(
      expect.arrayContaining([
        "UID:6f3c7a1e-2b4d-4c8e-9f10-1a2b3c4d5e6f@tutribu",
        "RECURRENCE-ID:20260521T210000Z",
        "DTSTART:20260522T213000Z",
        "DTEND:20260522T223000Z",
        "SUMMARY:Taller semanal",
      ])
    );
    expect(lines.indexOf("EXDATE:20260514T210000Z")).toBeLessThan(overrideStart);
  });
});
