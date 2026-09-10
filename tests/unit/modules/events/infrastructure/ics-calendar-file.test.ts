import { describe, it, expect } from "vitest";
import { buildTribeEventIcsFile } from "@/src/modules/events/infrastructure/calendar/ics-calendar-file";

const NOW = new Date("2026-05-01T12:00:00.000Z");

describe("buildTribeEventIcsFile", () => {
  it("serializes a recurring event with escaped text, link, and CRLF line endings", () => {
    const icsFile = buildTribeEventIcsFile(
      {
        description: "Repaso mensual, con notas\nSegunda línea; fin",
        endsAt: "2026-05-06T19:00:00.000Z",
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
        description: null,
        endsAt: null,
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
        description: "x".repeat(200),
        endsAt: null,
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
});
