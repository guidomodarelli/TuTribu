import type { TribeEventResult } from "@/src/modules/events/application/results/tribe-event-result";
import { TRIBE_EVENT_DEFAULT_DURATION_MINUTES } from "@/src/modules/events/constants/tribe-events";
import { formatCalendarUtcDateTime } from "@/src/modules/events/domain/services/tribe-event-recurrence";
import { slugifyDownloadFileName } from "@/src/modules/events/infrastructure/export/download-file-name";

const ICS = {
  calendarScale: "GREGORIAN",
  contentType: "text/calendar; charset=utf-8",
  fileExtension: ".ics",
  fileNamePrefix: "evento-",
  lineBreak: "\r\n",
  method: "PUBLISH",
  productId: "-//TuTribu//Eventos//ES",
  uidDomain: "@tutribu",
  version: "2.0",
} as const;
const MILLISECONDS_PER_MINUTE = 60_000;
const ICS_ESCAPE_PATTERN = /[\\;,]/g;
const ICS_NEWLINE_PATTERN = /\r?\n/g;
const ICS_ESCAPED_NEWLINE = "\\n";
const ICS_ESCAPE_PREFIX = "\\";
/**
 * RFC 5545 folds content lines longer than 75 octets; a conservative character
 * limit keeps multi-byte Spanish text within the octet budget.
 */
const ICS_LINE_FOLD_LENGTH = 70;
const ICS_LINE_FOLD_CONTINUATION = "\r\n ";

export type TribeEventIcsFile = {
  content: string;
  contentType: string;
  fileName: string;
};

function escapeIcsText(value: string): string {
  return value
    .replace(ICS_ESCAPE_PATTERN, (character) => ICS_ESCAPE_PREFIX + character)
    .replace(ICS_NEWLINE_PATTERN, ICS_ESCAPED_NEWLINE);
}

function foldIcsLine(line: string): string {
  const segments: string[] = [];

  for (let index = 0; index < line.length; index += ICS_LINE_FOLD_LENGTH) {
    segments.push(line.slice(index, index + ICS_LINE_FOLD_LENGTH));
  }

  return segments.join(ICS_LINE_FOLD_CONTINUATION);
}

function resolveEndsAt(event: TribeEventResult): string {
  if (event.endsAt) {
    return event.endsAt;
  }

  return new Date(
    Date.parse(event.startsAt) +
      TRIBE_EVENT_DEFAULT_DURATION_MINUTES * MILLISECONDS_PER_MINUTE
  ).toISOString();
}

function buildFileName(event: TribeEventResult): string {
  return ICS.fileNamePrefix + (slugifyDownloadFileName(event.title) || event.id) + ICS.fileExtension;
}

/**
 * Builds an iCalendar file for an event series. The recurrence rule (when any)
 * lets calendar apps materialize every occurrence from a single import.
 *
 * @param event - Event to export, with its precomputed recurrence rule.
 * @param now - Generation instant used for DTSTAMP (injectable for tests).
 */
export function buildTribeEventIcsFile(
  event: TribeEventResult,
  now: Date = new Date()
): TribeEventIcsFile {
  const lines = [
    "BEGIN:VCALENDAR",
    `VERSION:${ICS.version}`,
    `PRODID:${ICS.productId}`,
    `CALSCALE:${ICS.calendarScale}`,
    `METHOD:${ICS.method}`,
    "BEGIN:VEVENT",
    `UID:${event.id}${ICS.uidDomain}`,
    `DTSTAMP:${formatCalendarUtcDateTime(now.toISOString())}`,
    `DTSTART:${formatCalendarUtcDateTime(event.startsAt)}`,
    `DTEND:${formatCalendarUtcDateTime(resolveEndsAt(event))}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
  ];

  if (event.recurrenceRule) {
    lines.push(`RRULE:${event.recurrenceRule}`);
  }

  if (event.description) {
    lines.push(`DESCRIPTION:${escapeIcsText(event.description)}`);
  }

  if (event.meetingUrl) {
    lines.push(`URL:${escapeIcsText(event.meetingUrl)}`);
    lines.push(`LOCATION:${escapeIcsText(event.meetingUrl)}`);
  }

  lines.push("END:VEVENT", "END:VCALENDAR");

  return {
    content: lines.map(foldIcsLine).join(ICS.lineBreak) + ICS.lineBreak,
    contentType: ICS.contentType,
    fileName: buildFileName(event),
  };
}
