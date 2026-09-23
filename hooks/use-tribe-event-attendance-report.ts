"use client";

import { useEffect, useState } from "react";

import {
  TRIBE_EVENT_ATTENDANCE_REPORT_STATUS,
  type TribeEventAttendanceReportState,
} from "@/lib/events/tribe-event-attendance-report-state";
import { fetchTribeEventAttendanceReportRequest } from "@/lib/events/tribe-events-api-client";
import type { TribeEventOccurrenceResult } from "@/src/modules/events/application/results/tribe-event-result";

type UseTribeEventAttendanceReportInput = {
  /** Only managers load the report, and only while the tab is open. */
  isEnabled: boolean;
  occurrence: TribeEventOccurrenceResult | null;
  tribeSlug: string;
};

type SettledReportState = {
  occurrenceKey: string;
  requestKey: string;
  state: Exclude<
    TribeEventAttendanceReportState,
    { status: typeof TRIBE_EVENT_ATTENDANCE_REPORT_STATUS.idle | typeof TRIBE_EVENT_ATTENDANCE_REPORT_STATUS.loading }
  >;
};

export type TribeEventAttendanceReport = {
  reload: () => void;
  reportState: TribeEventAttendanceReportState;
};

const REQUEST_KEY_SEPARATOR = "|";
const COPY = {
  loadFailure: "No pudimos cargar la asistencia.",
} as const;

/**
 * Identity of a report request. It includes the attendance summary so the
 * list reloads after the manager's own answer (or a promotion) changes it.
 */
function buildRequestKey(occurrence: TribeEventOccurrenceResult, reloadCount: number): string {
  const { attendance } = occurrence;

  return [
    occurrence.occurrenceKey,
    attendance.goingCount,
    attendance.maybeCount,
    attendance.waitlistedCount,
    attendance.viewerStatus,
    reloadCount,
  ].join(REQUEST_KEY_SEPARATOR);
}

/**
 * Loads the manager attendance report of the open occurrence on demand.
 * Each request is tied to a key and aborted when the key changes or the
 * component unmounts, so a stale answer never replaces a newer one; the
 * loading state is derived from "no settled result for the current key".
 *
 * @param input - Occurrence, tribe, and whether loading is enabled.
 * @returns The report state and a `reload` callback for retries.
 */
export function useTribeEventAttendanceReport({
  isEnabled,
  occurrence,
  tribeSlug,
}: UseTribeEventAttendanceReportInput): TribeEventAttendanceReport {
  const [reloadCount, setReloadCount] = useState(0);
  const [settledReport, setSettledReport] = useState<SettledReportState | null>(null);
  const requestKey = isEnabled && occurrence ? buildRequestKey(occurrence, reloadCount) : null;
  const eventId = occurrence?.eventId ?? null;
  const occurrenceStartsAt = occurrence?.startsAt ?? null;
  const occurrenceKey = occurrence?.occurrenceKey ?? null;

  useEffect(() => {
    if (
      requestKey === null ||
      eventId === null ||
      occurrenceStartsAt === null ||
      occurrenceKey === null
    ) {
      return;
    }

    const abortController = new AbortController();

    fetchTribeEventAttendanceReportRequest({
      eventId,
      occurrenceStartsAt,
      signal: abortController.signal,
      tribeSlug,
    })
      .then((result) => {
        if (abortController.signal.aborted) {
          return;
        }

        setSettledReport({
          occurrenceKey,
          requestKey,
          state: result.isSuccess
            ? { report: result.report, status: TRIBE_EVENT_ATTENDANCE_REPORT_STATUS.loaded }
            : {
                message: result.message ?? COPY.loadFailure,
                status: TRIBE_EVENT_ATTENDANCE_REPORT_STATUS.error,
              },
        });
      })
      .catch(() => {
        // Aborted requests are expected (closed dialog, newer key); any other
        // failure is a network error shown with the safe fallback copy.
        if (!abortController.signal.aborted) {
          setSettledReport({
            occurrenceKey,
            requestKey,
            state: { message: COPY.loadFailure, status: TRIBE_EVENT_ATTENDANCE_REPORT_STATUS.error },
          });
        }
      });

    return () => {
      abortController.abort();
    };
  }, [eventId, occurrenceKey, occurrenceStartsAt, requestKey, tribeSlug]);

  // While a refresh of the same occurrence is in flight, keep showing the
  // previous list instead of flashing the loading copy.
  const isRefreshingSameOccurrence =
    settledReport?.occurrenceKey === occurrenceKey &&
    settledReport?.state.status === TRIBE_EVENT_ATTENDANCE_REPORT_STATUS.loaded;
  const reportState: TribeEventAttendanceReportState =
    requestKey === null
      ? { status: TRIBE_EVENT_ATTENDANCE_REPORT_STATUS.idle }
      : settledReport?.requestKey === requestKey || (settledReport && isRefreshingSameOccurrence)
        ? settledReport.state
        : { status: TRIBE_EVENT_ATTENDANCE_REPORT_STATUS.loading };

  return {
    reload: () => setReloadCount((currentCount) => currentCount + 1),
    reportState,
  };
}
