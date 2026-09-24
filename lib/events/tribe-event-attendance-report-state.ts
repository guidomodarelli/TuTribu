import type { TribeEventAttendanceReportResult } from "@/src/modules/events/application/results/tribe-event-result";

/**
 * Load state of the manager attendance report, shared by the hook that
 * fetches it and the panel that renders it.
 */
export const TRIBE_EVENT_ATTENDANCE_REPORT_STATUS = {
  error: "error",
  idle: "idle",
  loaded: "loaded",
  loading: "loading",
} as const;

export type TribeEventAttendanceReportState =
  | {
      status:
        | typeof TRIBE_EVENT_ATTENDANCE_REPORT_STATUS.idle
        | typeof TRIBE_EVENT_ATTENDANCE_REPORT_STATUS.loading;
    }
  | {
      message: string;
      status: typeof TRIBE_EVENT_ATTENDANCE_REPORT_STATUS.error;
    }
  | {
      report: TribeEventAttendanceReportResult;
      status: typeof TRIBE_EVENT_ATTENDANCE_REPORT_STATUS.loaded;
    };
