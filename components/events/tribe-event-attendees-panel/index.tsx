"use client";

import { DownloadIcon } from "lucide-react";
import { Button } from "beez-ui";

import { TribeEventAttendanceTrend } from "@/components/events/tribe-event-attendance-trend";
import { formatBuenosAiresDateTimeRange } from "@/lib/date-time/buenos-aires-format";
import {
  TRIBE_EVENT_ATTENDANCE_REPORT_STATUS,
  type TribeEventAttendanceReportState,
} from "@/lib/events/tribe-event-attendance-report-state";
import type {
  TribeEventAttendanceReportResult,
  TribeEventAttendeeResult,
} from "@/src/modules/events/application/results/tribe-event-result";
import styles from "./styles.module.scss";

type TribeEventAttendeesPanelProps = {
  /** Same-origin CSV download URL, authorized again on the server. */
  exportUrl: string;
  onRetry: () => void;
  reportState: TribeEventAttendanceReportState;
};

type AttendeeGroupKey = keyof TribeEventAttendanceReportResult["attendeeGroups"];

const ATTENDEE_GROUPS: { heading: string; key: AttendeeGroupKey }[] = [
  { heading: "Van", key: "going" },
  { heading: "Tal vez", key: "maybe" },
  { heading: "En espera", key: "waitlisted" },
  { heading: "No van", key: "notGoing" },
];
const BUTTON_ATTRIBUTE = {
  sizeSmall: "sm",
  typeButton: "button",
  variantOutline: "outline",
} as const;
const ALERT_ROLE = "alert";
const STATUS_ROLE = "status";
const COPY = {
  empty: "Nadie",
  exportCsv: "Exportar CSV",
  loading: "Cargando asistentes…",
  noAnswers: "Todavía nadie respondió a esta fecha.",
  respondedPrefix: "Respondió el ",
  retry: "Reintentar",
} as const;

function AttendeeList({ attendees }: { attendees: TribeEventAttendeeResult[] }) {
  if (attendees.length === 0) {
    return <p className={styles.TribeEventAttendeesPanel__empty}>{COPY.empty}</p>;
  }

  return (
    <ol className={styles.TribeEventAttendeesPanel__list}>
      {attendees.map((attendee, index) => (
        <li
          className={styles.TribeEventAttendeesPanel__attendee}
          key={attendee.name + attendee.respondedAt + String(index)}
        >
          <span className={styles.TribeEventAttendeesPanel__name}>{attendee.name}</span>
          <time
            className={styles.TribeEventAttendeesPanel__respondedAt}
            dateTime={attendee.respondedAt}
            title={COPY.respondedPrefix + formatBuenosAiresDateTimeRange(attendee.respondedAt, null)}
          >
            {formatBuenosAiresDateTimeRange(attendee.respondedAt, null)}
          </time>
        </li>
      ))}
    </ol>
  );
}

/**
 * Manager-only "Asistentes" section of the detail dialog: answers grouped by
 * status (waitlist in FIFO order), CSV export, and the going trend of the
 * series. Presentational: the container fetches and passes `reportState`.
 */
export function TribeEventAttendeesPanel({
  exportUrl,
  onRetry,
  reportState,
}: TribeEventAttendeesPanelProps) {
  if (reportState.status === TRIBE_EVENT_ATTENDANCE_REPORT_STATUS.error) {
    return (
      <div className={styles.TribeEventAttendeesPanel}>
        <p className={styles.TribeEventAttendeesPanel__error} role={ALERT_ROLE}>
          {reportState.message}
        </p>
        <Button
          size={BUTTON_ATTRIBUTE.sizeSmall}
          type={BUTTON_ATTRIBUTE.typeButton}
          variant={BUTTON_ATTRIBUTE.variantOutline}
          onClick={onRetry}
        >
          {COPY.retry}
        </Button>
      </div>
    );
  }

  if (reportState.status !== TRIBE_EVENT_ATTENDANCE_REPORT_STATUS.loaded) {
    return (
      <p className={styles.TribeEventAttendeesPanel__loading} role={STATUS_ROLE}>
        {COPY.loading}
      </p>
    );
  }

  const { attendeeGroups, trend } = reportState.report;
  const hasAnswers = ATTENDEE_GROUPS.some((group) => attendeeGroups[group.key].length > 0);

  return (
    <div className={styles.TribeEventAttendeesPanel}>
      {hasAnswers ? (
        <div className={styles.TribeEventAttendeesPanel__toolbar}>
          <Button
            asChild
            size={BUTTON_ATTRIBUTE.sizeSmall}
            variant={BUTTON_ATTRIBUTE.variantOutline}
          >
            <a download href={exportUrl}>
              <DownloadIcon aria-hidden />
              {COPY.exportCsv}
            </a>
          </Button>
        </div>
      ) : null}
      {hasAnswers ? (
        <div className={styles.TribeEventAttendeesPanel__groups}>
          {ATTENDEE_GROUPS.map((group) => (
            <section
              aria-label={group.heading}
              className={styles.TribeEventAttendeesPanel__group}
              key={group.key}
            >
              <h3 className={styles.TribeEventAttendeesPanel__heading}>
                {group.heading}
                <span className={styles.TribeEventAttendeesPanel__count}>
                  {attendeeGroups[group.key].length}
                </span>
              </h3>
              <AttendeeList attendees={attendeeGroups[group.key]} />
            </section>
          ))}
        </div>
      ) : (
        <p className={styles.TribeEventAttendeesPanel__empty}>{COPY.noAnswers}</p>
      )}
      <TribeEventAttendanceTrend trend={trend} />
    </div>
  );
}
