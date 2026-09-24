import { BUENOS_AIRES_TIME_ZONE } from "@/src/constants/date-time";
import type {
  TribeEventAttendanceReportResult,
  TribeEventAttendeeResult,
} from "@/src/modules/events/application/results/tribe-event-result";
import { TRIBE_EVENT_ATTENDEE_STATUS_LABEL } from "@/src/modules/events/constants/tribe-event-copy";
import { slugifyDownloadFileName } from "@/src/modules/events/infrastructure/export/download-file-name";

/**
 * CSV export of the attendance of one occurrence for managers: name, status
 * and response time (Buenos Aires). No emails or internal ids ever leave.
 */

export type TribeEventAttendanceCsvFile = {
  content: string;
  contentType: string;
  fileName: string;
};

const CSV = {
  // Excel only detects UTF-8 (accents, ñ) when the file starts with a BOM.
  byteOrderMark: "﻿",
  contentType: "text/csv; charset=utf-8",
  fileExtension: ".csv",
  fileNameFallback: "evento",
  fileNamePrefix: "asistencia-",
  fileNameSeparator: "-",
  headers: ["Nombre", "Estado", "Respondido el"],
  lineBreak: "\r\n",
  quote: '"',
  separator: ",",
} as const;
/**
 * Cells a spreadsheet would evaluate as a formula (CSV/formula injection).
 * They are neutralized with a leading apostrophe.
 */
const FORMULA_TRIGGER_PATTERN = /^[=+\-@\t\r]/;
const FORMULA_NEUTRALIZER = "'";
const QUOTE_REQUIRED_PATTERN = /[",\r\n]/;
const QUOTE_PATTERN = /"/g;
const ESCAPED_QUOTE = '""';
const DATE_TIME_PART = {
  day: "day",
  hour: "hour",
  minute: "minute",
  month: "month",
  year: "year",
} as const;
const TWO_DIGIT = "2-digit";
const RESPONDED_AT_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  day: TWO_DIGIT,
  hour: TWO_DIGIT,
  hourCycle: "h23",
  minute: TWO_DIGIT,
  month: TWO_DIGIT,
  timeZone: BUENOS_AIRES_TIME_ZONE,
  year: "numeric",
});

/**
 * Escapes one CSV cell (RFC 4180) after neutralizing formula triggers.
 */
function escapeCsvCell(value: string): string {
  const safeValue = FORMULA_TRIGGER_PATTERN.test(value) ? FORMULA_NEUTRALIZER + value : value;

  return QUOTE_REQUIRED_PATTERN.test(safeValue)
    ? CSV.quote + safeValue.replace(QUOTE_PATTERN, ESCAPED_QUOTE) + CSV.quote
    : safeValue;
}

/**
 * `YYYY-MM-DD HH:mm` in Buenos Aires, built from `formatToParts` so the
 * output does not depend on the ICU locale data of the runtime.
 */
function formatBuenosAiresDateTime(value: string): string {
  const parts = Object.fromEntries(
    RESPONDED_AT_FORMATTER.formatToParts(new Date(value)).map((part) => [part.type, part.value])
  );

  return (
    parts[DATE_TIME_PART.year] +
    CSV.fileNameSeparator +
    parts[DATE_TIME_PART.month] +
    CSV.fileNameSeparator +
    parts[DATE_TIME_PART.day] +
    " " +
    parts[DATE_TIME_PART.hour] +
    ":" +
    parts[DATE_TIME_PART.minute]
  );
}

function formatBuenosAiresDate(value: string): string {
  return formatBuenosAiresDateTime(value).split(" ")[0] ?? "";
}

function buildRow(attendee: TribeEventAttendeeResult): string {
  return [
    attendee.name,
    TRIBE_EVENT_ATTENDEE_STATUS_LABEL[attendee.status],
    formatBuenosAiresDateTime(attendee.respondedAt),
  ]
    .map(escapeCsvCell)
    .join(CSV.separator);
}

/**
 * Builds the attendance CSV in the same order managers see on screen: going,
 * waitlisted (FIFO), maybe, not going.
 *
 * @param report - Manager attendance report of one occurrence.
 * @returns File content (UTF-8 with BOM, CRLF lines), media type and name.
 */
export function buildTribeEventAttendanceCsvFile(
  report: TribeEventAttendanceReportResult
): TribeEventAttendanceCsvFile {
  const { going, maybe, notGoing, waitlisted } = report.attendeeGroups;
  const rows = [...going, ...waitlisted, ...maybe, ...notGoing].map(buildRow);
  const fileSlug = slugifyDownloadFileName(report.eventTitle) || CSV.fileNameFallback;

  return {
    content:
      CSV.byteOrderMark +
      [CSV.headers.join(CSV.separator), ...rows].join(CSV.lineBreak) +
      CSV.lineBreak,
    contentType: CSV.contentType,
    fileName:
      CSV.fileNamePrefix +
      fileSlug +
      CSV.fileNameSeparator +
      formatBuenosAiresDate(report.occurrenceStartsAt) +
      CSV.fileExtension,
  };
}
