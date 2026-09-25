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
 * and the tribe calendar feed: TEXT escaping, URI serialization, octet-aware
 * line folding, and
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
/** CRLF, bare LF, and bare CR: parsers may treat any of them as a line boundary. */
const ICS_NEWLINE_PATTERN = /\r\n|\r|\n/g;
/**
 * RFC 5545 §3.3.11 excludes CONTROL characters from TEXT except HTAB; line
 * breaks are escaped before this runs, so the remaining C0 controls and DEL
 * have no valid representation and are dropped.
 */
const ICS_FORBIDDEN_CONTROL_PATTERN = /[\u0000-\u0008\u000A-\u001F\u007F]/g;
/**
 * Matches either a valid percent-encoded triplet (`%` plus two hexadecimal
 * digits, kept as is) or one character RFC 3986 does not allow literally:
 * anything outside the unreserved, gen-delims, and sub-delims alphabet, and
 * a stray `%` that does not start a triplet (for example `?q=100%` or `%zz`).
 * The WHATWG serialization still leaves some of them literal (`\`, `^`, `|`,
 * `{`, `}` in a query, and stray `%`) and keeps any C0 control or DEL it did
 * not strip, so they are percent-encoded.
 */
const ICS_URI_TRIPLET_OR_DISALLOWED_CHARACTER_PATTERN =
  /%[0-9A-Fa-f]{2}|[^A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=]/gu;
const HEXADECIMAL_RADIX = 16;
const PERCENT_ENCODED_OCTET_DIGITS = 2;
const PERCENT_ENCODING_PREFIX = "%";
const ICS_ESCAPED_NEWLINE = "\\n";
const ICS_ESCAPE_PREFIX = "\\";
const MILLISECONDS_PER_MINUTE = 60_000;
const textEncoder = new TextEncoder();

/**
 * Change metadata of a series in a feed: LAST-MODIFIED (also the stable
 * DTSTAMP, so identical data yields identical bytes) and the SEQUENCE, a
 * persisted counter that grows by one on every saved change of the series.
 */
export type IcsSeriesRevision = {
  lastModifiedAt: string;
  sequence: number;
};

/**
 * Escapes a TEXT value (RFC 5545 §3.3.11): backslash, semicolon, comma, and
 * line breaks (CRLF, bare LF, and bare CR become `\n`), and drops the other
 * control characters TEXT does not allow, so user text can never open a new
 * content line or make strict parsers reject the document.
 */
export function escapeIcsText(value: string): string {
  return value
    .replace(ICS_ESCAPE_PATTERN, (character) => ICS_ESCAPE_PREFIX + character)
    .replace(ICS_NEWLINE_PATTERN, ICS_ESCAPED_NEWLINE)
    .replace(ICS_FORBIDDEN_CONTROL_PATTERN, "");
}

/**
 * Percent-encodes one character as its UTF-8 octets (`\` -> `%5C`, a stray
 * `%` -> `%25`) and leaves an already valid percent-encoded triplet intact.
 */
function percentEncodeUriMatch(matchedText: string): string {
  if (matchedText.length > 1 && matchedText.startsWith(PERCENT_ENCODING_PREFIX)) {
    return matchedText;
  }

  return Array.from(
    textEncoder.encode(matchedText),
    (octet) =>
      PERCENT_ENCODING_PREFIX +
      octet
        .toString(HEXADECIMAL_RADIX)
        .toUpperCase()
        .padStart(PERCENT_ENCODED_OCTET_DIGITS, "0")
  ).join("");
}

/**
 * Serializes a URI value (RFC 5545 §3.3.13, e.g. the `URL` property) from its
 * canonical WHATWG form (`new URL(value).href`), the same address a browser
 * opens: spaces and non-ASCII characters are percent-encoded, a backslash in
 * the path of an http(s) URL becomes `/`, and tabs and line breaks are
 * dropped. TEXT escaping does not apply to URIs: a backslash before `,` or `;`
 * would change the address, so every valid URI character (including `,` and
 * `;`) and every valid percent-encoded triplet are kept as is, a stray `%`
 * becomes `%25`, and any character still outside the RFC 3986 alphabet is
 * percent-encoded as UTF-8 octets, so the value can never open a new content
 * line; folding still applies.
 *
 * @param value - Stored URI, validated as http(s) when it was saved.
 * @returns The serialized URI, or `null` when the value cannot be parsed as a
 * URL (the caller then omits the property).
 */
export function formatIcsUri(value: string): string | null {
  if (!URL.canParse(value)) {
    return null;
  }

  return new URL(value).href.replace(
    ICS_URI_TRIPLET_OR_DISALLOWED_CHARACTER_PATTERN,
    percentEncodeUriMatch
  );
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
    const meetingUri = formatIcsUri(event.meetingUrl);

    if (meetingUri) {
      lines.push(`URL:${meetingUri}`);
    }

    lines.push(`LOCATION:${escapeIcsText(event.meetingUrl)}`);
  }

  return lines;
}

/**
 * SEQUENCE must strictly grow on every change of a component (RFC 5545
 * §3.8.7.4). A value derived from the change instant (minutes or seconds
 * since the epoch) repeats for two edits within the same bucket, and
 * milliseconds overflow the 32-bit INTEGER, so it comes from the persisted
 * `events.calendar_sequence` counter the database raises on every update.
 */
function buildRevisionLines(revision: IcsSeriesRevision | null): string[] {
  if (!revision) {
    return [];
  }

  return [
    `LAST-MODIFIED:${formatCalendarUtcDateTime(revision.lastModifiedAt)}`,
    `SEQUENCE:${revision.sequence}`,
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
