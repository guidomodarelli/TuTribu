import type {
  TribeEventCalendarExceptionResult,
  TribeEventResult,
} from "@/src/modules/events/application/results/tribe-event-result";
import {
  TRIBE_EVENT_DEFAULT_DURATION_MINUTES,
  TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND,
} from "@/src/modules/events/constants/tribe-events";
import { formatCalendarUtcDateTime } from "@/src/modules/events/domain/services/tribe-event-recurrence";

/**
 * RFC 5545 content-line primitives shared by the single-event `.ics` download
 * and the tribe calendar feed: text escaping, octet-aware line folding, and
 * the VEVENT lines of one series (master plus moved-date overrides).
 */

export const ICS_DOCUMENT = {
  calendarScale: "GREGORIAN",
  contentType: "text/calendar; charset=utf-8",
  lineBreak: "\r\n",
  method: "PUBLISH",
  productId: "-//TuTribu//Eventos//ES",
  uidDomain: "@tutribu",
  version: "2.0",
} as const;

/** RFC 5545 §3.1: content lines SHOULD NOT exceed 75 octets (excluding CRLF). */
const ICS_LINE_OCTET_LIMIT = 75;
/** A continuation line starts with one space, which counts toward its limit. */
const ICS_LINE_FOLD_CONTINUATION = "\r\n ";
const ICS_CONTINUATION_PREFIX_OCTETS = 1;
const ICS_ESCAPE_PATTERN = /[\\;,]/g;
const ICS_NEWLINE_PATTERN = /\r?\n/g;
const ICS_ESCAPED_NEWLINE = "\\n";
const ICS_ESCAPE_PREFIX = "\\";
const MILLISECONDS_PER_MINUTE = 60_000;
const textEncoder = new TextEncoder();

/**
 * Change metadata of a series in a feed: LAST-MODIFIED, a SEQUENCE derived
 * from it, and a stable DTSTAMP so identical data yields identical bytes.
 */
export type IcsSeriesRevision = {
  lastModifiedAt: string;
};

/**
 * Escapes a TEXT value (RFC 5545 §3.3.11): backslash, semicolon, comma, and
 * line breaks.
 */
export function escapeIcsText(value: string): string {
  return value
    .replace(ICS_ESCAPE_PATTERN, (character) => ICS_ESCAPE_PREFIX + character)
    .replace(ICS_NEWLINE_PATTERN, ICS_ESCAPED_NEWLINE);
}

/**
 * Folds a content line so no physical line exceeds 75 octets of UTF-8,
 * splitting only between code points so a multi-byte character (accents,
 * emoji) is never cut in half.
 *
 * @param line - Unfolded content line without CRLF.
 * @returns The line with `CRLF + space` inserted where needed.
 */
export function foldIcsLine(line: string): string {
  const segments: string[] = [];
  let currentSegment = "";
  let currentOctets = 0;
  let octetLimit = ICS_LINE_OCTET_LIMIT;

  for (const character of line) {
    const characterOctets = textEncoder.encode(character).length;

    if (currentOctets + characterOctets > octetLimit) {
      segments.push(currentSegment);
      currentSegment = "";
      currentOctets = 0;
      octetLimit = ICS_LINE_OCTET_LIMIT - ICS_CONTINUATION_PREFIX_OCTETS;
    }

    currentSegment += character;
    currentOctets += characterOctets;
  }

  segments.push(currentSegment);

  return segments.join(ICS_LINE_FOLD_CONTINUATION);
}

/**
 * Serializes unfolded content lines as an iCalendar body (folded, CRLF).
 */
export function serializeIcsLines(lines: readonly string[]): string {
  return lines.map(foldIcsLine).join(ICS_DOCUMENT.lineBreak) + ICS_DOCUMENT.lineBreak;
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
 * SEQUENCE must grow when a component changes. Minutes since the epoch of the
 * last change grow monotonically and fit a 32-bit integer for millennia.
 */
function buildRevisionLines(revision: IcsSeriesRevision | null): string[] {
  if (!revision) {
    return [];
  }

  return [
    `LAST-MODIFIED:${formatCalendarUtcDateTime(revision.lastModifiedAt)}`,
    `SEQUENCE:${Math.floor(Date.parse(revision.lastModifiedAt) / MILLISECONDS_PER_MINUTE)}`,
  ];
}

/**
 * VEVENT lines of one series: the master (DTSTART, RRULE, EXDATE per
 * cancelled date) and one override per moved date, with the same UID and a
 * RECURRENCE-ID holding the original slot, so calendar apps replace that
 * instance (RFC 5545). UIDs are stable (`<eventId>@tutribu`).
 *
 * @param input - Series, its still-valid exceptions, the DTSTAMP, and the
 * optional change metadata (feeds only).
 * @returns Unfolded content lines.
 */
export function buildTribeEventSeriesIcsLines(input: {
  dateStamp: string;
  event: TribeEventResult;
  occurrenceExceptions: readonly TribeEventCalendarExceptionResult[];
  revision: IcsSeriesRevision | null;
}): string[] {
  const { dateStamp, event, occurrenceExceptions, revision } = input;
  const uid = `UID:${event.id}${ICS_DOCUMENT.uidDomain}`;
  const stamp = `DTSTAMP:${formatCalendarUtcDateTime(dateStamp)}`;
  const hasRecurrence = Boolean(event.recurrenceRule);
  const lines = [
    "BEGIN:VEVENT",
    uid,
    stamp,
    ...buildRevisionLines(revision),
    `DTSTART:${formatCalendarUtcDateTime(event.startsAt)}`,
    `DTEND:${formatCalendarUtcDateTime(resolveEndsAt(event))}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
  ];

  if (event.recurrenceRule) {
    lines.push(`RRULE:${event.recurrenceRule}`);
  }

  const cancelledOccurrences = hasRecurrence
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

  for (const cancelledOccurrence of cancelledOccurrences) {
    lines.push(`EXDATE:${formatCalendarUtcDateTime(cancelledOccurrence.originalStartsAt)}`);
  }

  lines.push(...buildOptionalLines(event), "END:VEVENT");

  for (const movedOccurrence of movedOccurrences) {
    lines.push(
      "BEGIN:VEVENT",
      uid,
      stamp,
      ...buildRevisionLines(revision),
      `RECURRENCE-ID:${formatCalendarUtcDateTime(movedOccurrence.originalStartsAt)}`,
      `DTSTART:${formatCalendarUtcDateTime(movedOccurrence.startsAt)}`,
      `DTEND:${formatCalendarUtcDateTime(resolveEndsAt(movedOccurrence))}`,
      `SUMMARY:${escapeIcsText(event.title)}`,
      ...buildOptionalLines(event),
      "END:VEVENT"
    );
  }

  return lines;
}

/**
 * Opening lines shared by every calendar document of the product.
 */
export function buildIcsCalendarHeaderLines(): string[] {
  return [
    "BEGIN:VCALENDAR",
    `VERSION:${ICS_DOCUMENT.version}`,
    `PRODID:${ICS_DOCUMENT.productId}`,
    `CALSCALE:${ICS_DOCUMENT.calendarScale}`,
    `METHOD:${ICS_DOCUMENT.method}`,
  ];
}
