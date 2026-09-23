"use client";

import { CalendarPlusIcon, ExternalLinkIcon } from "lucide-react";
import { Badge } from "beez-ui";

import {
  TRIBE_EVENT_ATTENDANCE_SUMMARY_VARIANT,
  TribeEventAttendanceSummary,
} from "@/components/events/tribe-event-attendance-summary";
import { formatBuenosAiresTimeRange } from "@/lib/date-time/buenos-aires-format";
import { formatViewerLocalTimeLabel } from "@/lib/date-time/viewer-local-time-format";
import { buildTribeEventGoogleCalendarUrl } from "@/lib/events/tribe-event-calendar-links";
import {
  TRIBE_EVENT_OCCURRENCE_PHASE,
  getOccurrencePhase,
} from "@/lib/events/tribe-event-occurrence-timing";
import type { TribeEventOccurrenceResult } from "@/src/modules/events/application/results/tribe-event-result";
import { TRIBE_EVENT_RECURRENCE_LABEL } from "@/src/modules/events/constants/tribe-event-copy";
import {
  TRIBE_EVENT_ATTENDANCE_STATUS,
  TRIBE_EVENT_RECURRENCE_FREQUENCY,
} from "@/src/modules/events/constants/tribe-events";
import styles from "./styles.module.scss";

type TribeEventAgendaItemProps = {
  /** Current time (epoch ms) or null before hydration. */
  nowTime: number | null;
  occurrence: TribeEventOccurrenceResult;
  onSelect: (occurrence: TribeEventOccurrenceResult) => void;
  /** Browser time zone, null before hydration. */
  viewerTimeZone: string | null;
};

const BADGE_VARIANT = {
  default: "default",
  outline: "outline",
  secondary: "secondary",
} as const;
const BUTTON_TYPE = "button";
const LINK_ATTRIBUTE = {
  noreferrer: "noreferrer",
  targetBlank: "_blank",
} as const;
const COPY = {
  googleCalendar: "Agregar a Google Calendar",
  linkOpen: "Abrir link",
  liveBadge: "En vivo",
  pastBadge: "Finalizado",
} as const;
/**
 * Badge of the viewer's own answer on each agenda row.
 */
const VIEWER_ANSWER_BADGE = {
  [TRIBE_EVENT_ATTENDANCE_STATUS.going]: { label: "Vas", variant: BADGE_VARIANT.default },
  [TRIBE_EVENT_ATTENDANCE_STATUS.maybe]: { label: "Tal vez", variant: BADGE_VARIANT.outline },
  [TRIBE_EVENT_ATTENDANCE_STATUS.notGoing]: { label: "No vas", variant: BADGE_VARIANT.outline },
  [TRIBE_EVENT_ATTENDANCE_STATUS.waitlisted]: {
    label: "En espera",
    variant: BADGE_VARIANT.secondary,
  },
} as const;

function AttendanceBadge({ occurrence }: { occurrence: TribeEventOccurrenceResult }) {
  const viewerStatus = occurrence.attendance.viewerStatus;

  if (!viewerStatus) {
    return null;
  }

  const badge = VIEWER_ANSWER_BADGE[viewerStatus];

  return <Badge variant={badge.variant}>{badge.label}</Badge>;
}

/**
 * One agenda row: schedule, title (opens the detail), viewer answer or
 * finished badge, recurrence, a compact attendance summary (avatars,
 * counts, free seats), and the meeting link.
 */
export function TribeEventAgendaItem({
  nowTime,
  occurrence,
  onSelect,
  viewerTimeZone,
}: TribeEventAgendaItemProps) {
  const localTimeLabel = formatViewerLocalTimeLabel(
    occurrence.startsAt,
    occurrence.endsAt,
    viewerTimeZone
  );
  const phase = nowTime === null ? null : getOccurrencePhase(occurrence, nowTime);
  const isPast = phase === TRIBE_EVENT_OCCURRENCE_PHASE.past;
  const isLive = phase === TRIBE_EVENT_OCCURRENCE_PHASE.live;

  return (
    <li
      className={
        isPast ? styles["TribeEventAgendaItem--past"] : styles.TribeEventAgendaItem
      }
    >
      <span className={styles.TribeEventAgendaItem__time}>
        {formatBuenosAiresTimeRange(occurrence.startsAt, occurrence.endsAt)}
        {localTimeLabel ? (
          <span className={styles.TribeEventAgendaItem__localTime}>{localTimeLabel}</span>
        ) : null}
      </span>
      <div className={styles.TribeEventAgendaItem__main}>
        <button
          className={styles.TribeEventAgendaItem__titleButton}
          type={BUTTON_TYPE}
          onClick={() => onSelect(occurrence)}
        >
          {occurrence.title}
        </button>
        <div className={styles.TribeEventAgendaItem__meta}>
          {isLive ? (
            <Badge className={styles.TribeEventAgendaItem__liveBadge} variant={BADGE_VARIANT.outline}>
              <span aria-hidden className={styles.TribeEventAgendaItem__liveDot} />
              {COPY.liveBadge}
            </Badge>
          ) : null}
          {isPast ? (
            <Badge variant={BADGE_VARIANT.secondary}>{COPY.pastBadge}</Badge>
          ) : (
            <AttendanceBadge occurrence={occurrence} />
          )}
          {occurrence.recurrenceFrequency !== TRIBE_EVENT_RECURRENCE_FREQUENCY.none ? (
            <span className={styles.TribeEventAgendaItem__metaText}>
              {TRIBE_EVENT_RECURRENCE_LABEL[occurrence.recurrenceFrequency]}
            </span>
          ) : null}
        </div>
        <TribeEventAttendanceSummary
          isPast={isPast}
          occurrence={occurrence}
          variant={TRIBE_EVENT_ATTENDANCE_SUMMARY_VARIANT.compact}
        />
      </div>
      <div className={styles.TribeEventAgendaItem__actions}>
        {isPast ? null : (
          <a
            aria-label={COPY.googleCalendar}
            className={styles.TribeEventAgendaItem__iconLink}
            href={buildTribeEventGoogleCalendarUrl(occurrence)}
            rel={LINK_ATTRIBUTE.noreferrer}
            target={LINK_ATTRIBUTE.targetBlank}
            title={COPY.googleCalendar}
          >
            <CalendarPlusIcon aria-hidden />
          </a>
        )}
        {occurrence.meetingUrl ? (
          <a
            aria-label={COPY.linkOpen}
            className={styles.TribeEventAgendaItem__iconLink}
            href={occurrence.meetingUrl}
            rel={LINK_ATTRIBUTE.noreferrer}
            target={LINK_ATTRIBUTE.targetBlank}
            title={COPY.linkOpen}
          >
            <ExternalLinkIcon aria-hidden />
          </a>
        ) : null}
      </div>
    </li>
  );
}
