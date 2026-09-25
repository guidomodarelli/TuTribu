import type {
  TribeEventCalendarExceptionResult,
  TribeEventResult,
} from "@/src/modules/events/application/results/tribe-event-result";
import {
  ICS_DOCUMENT,
  buildIcsCalendarHeaderLines,
  buildTribeEventSeriesIcsLines,
  serializeIcsLines,
} from "@/src/modules/events/infrastructure/calendar/ics-content-lines";
import { slugifyDownloadFileName } from "@/src/modules/events/infrastructure/export/download-file-name";

const ICS_FILE_NAME = {
  extension: ".ics",
  prefix: "evento-",
} as const;

export type TribeEventIcsFile = {
  content: string;
  contentType: string;
  fileName: string;
};

function buildFileName(event: TribeEventResult): string {
  return ICS_FILE_NAME.prefix + (slugifyDownloadFileName(event.title) || event.id) + ICS_FILE_NAME.extension;
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
  const lines = [
    ...buildIcsCalendarHeaderLines(),
    ...buildTribeEventSeriesIcsLines({
      dateStamp: now.toISOString(),
      event,
      occurrenceExceptions,
      revision: null,
    }),
    "END:VCALENDAR",
  ];

  return {
    content: serializeIcsLines(lines),
    contentType: ICS_DOCUMENT.contentType,
    fileName: buildFileName(event),
  };
}
