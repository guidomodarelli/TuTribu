import { describe, expect, it } from "vitest";

import { buildTribeEventAttendanceCsvFile } from "@/src/modules/events/infrastructure/export/tribe-event-attendance-csv-file";

const REPORT = {
  attendeeGroups: {
    going: [{ name: "Ana Pérez", respondedAt: "2026-05-10T15:05:00.000Z", status: "going" as const }],
    maybe: [
      { name: 'Beto "El Profe", Jr.', respondedAt: "2026-05-11T02:30:00.000Z", status: "maybe" as const },
    ],
    notGoing: [{ name: "=HYPERLINK(\"x\")", respondedAt: "2026-05-11T12:00:00.000Z", status: "not_going" as const }],
    waitlisted: [
      { name: "+54 Caro", respondedAt: "2026-05-11T13:00:00.000Z", status: "waitlisted" as const },
      { name: "-Dani\nnueva línea", respondedAt: "2026-05-11T14:00:00.000Z", status: "waitlisted" as const },
      { name: "@Eli", respondedAt: "2026-05-11T15:00:00.000Z", status: "waitlisted" as const },
    ],
  },
  eventTitle: "Clase abierta / Repaso",
  occurrenceStartsAt: "2026-05-13T21:00:00.000Z",
  trend: [],
};

function parseLines(content: string): string[] {
  return content.replace(/^﻿/, "").split("\r\n");
}

describe("buildTribeEventAttendanceCsvFile", () => {
  it("writes a UTF-8 CSV with Spanish headers, statuses and Buenos Aires times", () => {
    const file = buildTribeEventAttendanceCsvFile(REPORT);

    expect(file.contentType).toBe("text/csv; charset=utf-8");
    expect(file.fileName).toBe("asistencia-clase-abierta-repaso-2026-05-13.csv");
    expect(file.content.startsWith("﻿")).toBe(true);

    const lines = parseLines(file.content);

    expect(lines[0]).toBe("Nombre,Estado,Respondido el");
    expect(lines[1]).toBe("Ana Pérez,Va,2026-05-10 12:05");
    // Grouped in the manager order: going, waitlisted (FIFO), maybe, not going.
    expect(lines[2]).toBe("'+54 Caro,En lista de espera,2026-05-11 10:00");
  });

  it("quotes separators, quotes and line breaks", () => {
    const lines = parseLines(buildTribeEventAttendanceCsvFile(REPORT).content);

    expect(lines).toContain("\"'-Dani\nnueva línea\",En lista de espera,2026-05-11 11:00");
    expect(lines).toContain('"Beto ""El Profe"", Jr.",Tal vez,2026-05-10 23:30');
  });

  it("neutralizes spreadsheet formulas by prefixing an apostrophe", () => {
    const content = buildTribeEventAttendanceCsvFile(REPORT).content;

    expect(content).toContain("\"'=HYPERLINK(\"\"x\"\")\",No va,2026-05-11 09:00");
    expect(content).toContain("'@Eli,En lista de espera,2026-05-11 12:00");
    expect(content).not.toMatch(/(^|\r\n)[=+\-@]/);
  });

  it("never includes emails or internal identifiers", () => {
    const content = buildTribeEventAttendanceCsvFile(REPORT).content;

    expect(content).not.toMatch(/@example|[0-9a-f]{8}-[0-9a-f]{4}-/);
  });
});
