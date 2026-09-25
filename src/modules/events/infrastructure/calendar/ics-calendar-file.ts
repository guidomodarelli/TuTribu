import type {
  TribeEventCalendarExceptionResult,
  TribeEventResult,
} from "@/src/modules/events/application/results/tribe-event-result";
import {
  TRIBE_EVENT_DEFAULT_DURATION_MINUTES,
  TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND,
} from "@/src/modules/events/constants/tribe-events";
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

function resolveEndsAt(occurrence: { endsAt: string | null; startsAt: string }): string {
  if (occurrence.endsAt) {
    return occurrence.endsAt;
  }

  return new Date(
    Date.parse(occurrence.startsAt) +
      TRIBE_EVENT_DEFAULT_DURATION_MINUTES * MILLISECONDS_PER_MINUTE
  ).toISOString();
}

function buildOptionalLines(event: TribeEventResult): string[] {
  const lines: string[] = [];

  if (event.description) {
    lines.push(`DESCRIPTION:${escapeIcsText(event.description)}`);
  }

  if (event.meetingUrl) {
    lines.push(`URL:${escapeIcsText(event.meetingUrl)}`);
    lines.push(`LOCATION:${escapeIcsText(event.meetingUrl)}`);
  }

  return lines;
}

/**
 * Override of one moved date: same UID as the series and a RECURRENCE-ID
 * with the original slot, so calendar apps replace that instance.
 */
function buildMovedOccurrenceLines(
  event: TribeEventResult,
  movedOccurrence: TribeEventCalendarExceptionResult,
  dateStamp: string
): string[] {
  return [
    "BEGIN:VEVENT",
    `UID:${event.id}${ICS.uidDomain}`,
    `DTSTAMP:${dateStamp}`,
    `RECURRENCE-ID:${formatCalendarUtcDateTime(movedOccurrence.originalStartsAt)}`,
    `DTSTART:${formatCalendarUtcDateTime(movedOccurrence.startsAt)}`,
    `DTEND:${formatCalendarUtcDateTime(resolveEndsAt(movedOccurrence))}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
    ...buildOptionalLines(event),
    "END:VEVENT",
  ];
}

function buildFileName(event: TribeEventResult): string {
  return ICS.fileNamePrefix + (slugifyDownloadFileName(event.title) || event.id) + ICS.fileExtension;
}

/**
 * Builds an iCalendar file for an event series. The recurrence rule (when any)
 * lets calendar apps materialize every occurrence from a single import.
 * Cancelled dates become `EXDATE` lines of the series and moved dates become
 * override events with `RECURRENCE-ID` (RFC 5545), keyed by the original slot.
 *
 * @param event - Event to export, with its precomputed recurrence rule.
 * @param now - Generation instant used for DTSTAMP (injectable for tests).
 * @param occurrenceExceptions - Still-valid cancelled and moved dates.
 */
export function buildTribeEventIcsFile(
  event: TribeEventResult,
  now: Date = new Date(),
  occurrenceExceptions: readonly TribeEventCalendarExceptionResult[] = []
): TribeEventIcsFile {
  const dateStamp = formatCalendarUtcDateTime(now.toISOString());
  const hasRecurrence = Boolean(event.recurrenceRule);
  const cancelledStarts = hasRecurrence
    ? occurrenceExceptions.filter(
        (occurrence) =>
          occurrence.exception.kind === TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND.cancelled
      )
    : [];
  const movedOccurrences = hasRecurrence
    ? occurrenceExceptions.filter(
        (occurrence) => occurrence.exception.kind === TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND.moved
      )
    : [];
  const lines = [
    "BEGIN:VCALENDAR",
    `VERSION:${ICS.version}`,
    `PRODID:${ICS.productId}`,
    `CALSCALE:${ICS.calendarScale}`,
    `METHOD:${ICS.method}`,
    "BEGIN:VEVENT",
    `UID:${event.id}${ICS.uidDomain}`,
    `DTSTAMP:${dateStamp}`,
    `DTSTART:${formatCalendarUtcDateTime(event.startsAt)}`,
    `DTEND:${formatCalendarUtcDateTime(resolveEndsAt(event))}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
  ];

  if (event.recurrenceRule) {
    lines.push(`RRULE:${event.recurrenceRule}`);
  }

  for (const cancelledOccurrence of cancelledStarts) {
    lines.push(`EXDATE:${formatCalendarUtcDateTime(cancelledOccurrence.originalStartsAt)}`);
  }

  lines.push(...buildOptionalLines(event), "END:VEVENT");

  for (const movedOccurrence of movedOccurrences) {
    lines.push(...buildMovedOccurrenceLines(event, movedOccurrence, dateStamp));
  }

  lines.push("END:VCALENDAR");

  return {
    content: lines.map(foldIcsLine).join(ICS.lineBreak) + ICS.lineBreak,
    contentType: ICS.contentType,
    fileName: buildFileName(event),
  };
}
