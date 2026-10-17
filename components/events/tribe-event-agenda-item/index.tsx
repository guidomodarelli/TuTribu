"use client";

import { CalendarPlusIcon, ExternalLinkIcon, VideoIcon } from "lucide-react";
import { Badge, cn, AnimatedListItem } from "beez-ui";

import {
  TRIBE_EVENT_ATTENDANCE_SUMMARY_VARIANT,
  TribeEventAttendanceSummary,
} from "@/components/events/tribe-event-attendance-summary";
import { TribeEventTypeBadge } from "@/components/events/tribe-event-type-badge";
import { formatBuenosAiresTimeRange } from "@/lib/date-time/buenos-aires-format";
import { formatViewerLocalTimeLabel } from "@/lib/date-time/viewer-local-time-format";
import { buildTribeEventGoogleCalendarUrl } from "@/lib/events/tribe-event-calendar-links";
import {
  TRIBE_EVENT_OCCURRENCE_EXCEPTION_COPY,
  formatMovedFromLabel,
  isOccurrenceCancelled,
} from "@/lib/events/tribe-event-occurrence-exception-copy";
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
  /** The occurrence has a published recording ("Grabación disponible"). */
  hasRecording?: boolean;
  /** Current time (epoch ms) or null before hydration. */
  nowTime: number | null;
  occurrence: TribeEventOccurrenceResult;
  onSelect: (occurrence: TribeEventOccurrenceResult) => void;
  /** Browser time zone, null before hydration. */
  viewerTimeZone: string | null;
};

const BADGE_TONE = {
  danger: "danger",
  info: "info",
  neutral: "neutral",
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
  recordingBadge: "Grabación disponible",
} as const;
/**
 * Badge of the viewer's own answer on each agenda row.
 */
const VIEWER_ANSWER_BADGE = {
  [TRIBE_EVENT_ATTENDANCE_STATUS.going]: { label: "Vas", tone: BADGE_TONE.info },
  [TRIBE_EVENT_ATTENDANCE_STATUS.maybe]: { label: "Tal vez", tone: BADGE_TONE.neutral },
  [TRIBE_EVENT_ATTENDANCE_STATUS.notGoing]: { label: "No vas", tone: BADGE_TONE.neutral },
  [TRIBE_EVENT_ATTENDANCE_STATUS.waitlisted]: {
    label: "En espera",
    tone: BADGE_TONE.neutral,
  },
} as const;

function AttendanceBadge({ occurrence }: { occurrence: TribeEventOccurrenceResult }) {
  const viewerStatus = occurrence.attendance.viewerStatus;

  if (!viewerStatus) {
    return null;
  }

  const badge = VIEWER_ANSWER_BADGE[viewerStatus];

  return <Badge tone={badge.tone}>{badge.label}</Badge>;
}

/**
 * One agenda row: schedule, title (opens the detail), event type, viewer
 * answer or finished badge, recurrence, a compact attendance summary
 * (avatars, counts, free seats), and the meeting link. A cancelled date is
 * struck through with a "Cancelado" badge and no calendar or meeting
 * shortcuts; a moved date says where it was moved from. The row animates
 * in and out when its list wraps it in `AnimatePresence` (agenda days).
 */
export function TribeEventAgendaItem({
  hasRecording = false,
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
  const isCancelled = isOccurrenceCancelled(occurrence);
  const movedFromLabel = formatMovedFromLabel(occurrence);
  // The shortcut is limited to unfinished, not cancelled occurrences, so it
  // waits for the hydrated clock: the server render (phase unknown) must not
  // ship an active link for an occurrence that may already be over.
  const canAddToGoogleCalendar = phase !== null && !isPast && !isCancelled;

  return (
    <AnimatedListItem
      className={cn(
        styles.TribeEventAgendaItem,
        isPast && styles["TribeEventAgendaItem--past"],
        isCancelled && styles["TribeEventAgendaItem--cancelled"]
      )}
      data-event-type={occurrence.eventType}
    >
      <span
        className={cn(
          styles.TribeEventAgendaItem__time,
          isCancelled && styles["TribeEventAgendaItem__time--cancelled"]
        )}
      >
        {formatBuenosAiresTimeRange(occurrence.startsAt, occurrence.endsAt)}
        {localTimeLabel ? (
          <span className={styles.TribeEventAgendaItem__localTime}>{localTimeLabel}</span>
        ) : null}
      </span>
      <div className={styles.TribeEventAgendaItem__main}>
        <button
          className={cn(
            styles.TribeEventAgendaItem__titleButton,
            isCancelled && styles["TribeEventAgendaItem__titleButton--cancelled"]
          )}
          type={BUTTON_TYPE}
          onClick={() => onSelect(occurrence)}
        >
          {occurrence.title}
        </button>
        <div className={styles.TribeEventAgendaItem__meta}>
          <TribeEventTypeBadge eventType={occurrence.eventType} />
          {isCancelled ? (
            <Badge tone={BADGE_TONE.danger}>
              {TRIBE_EVENT_OCCURRENCE_EXCEPTION_COPY.cancelledBadge}
            </Badge>
          ) : null}
          {isLive && !isCancelled ? (
            <Badge tone={BADGE_TONE.danger}>
              <span aria-hidden className={styles.TribeEventAgendaItem__liveDot} />
              {COPY.liveBadge}
            </Badge>
          ) : null}
          {isCancelled ? null : isPast ? (
            <Badge tone={BADGE_TONE.neutral}>{COPY.pastBadge}</Badge>
          ) : (
            <AttendanceBadge occurrence={occurrence} />
          )}
          {hasRecording && !isCancelled ? (
            <Badge icon={<VideoIcon />} tone={BADGE_TONE.neutral}>
              {COPY.recordingBadge}
            </Badge>
          ) : null}
          {occurrence.recurrenceFrequency !== TRIBE_EVENT_RECURRENCE_FREQUENCY.none ? (
            <span className={styles.TribeEventAgendaItem__metaText}>
              {TRIBE_EVENT_RECURRENCE_LABEL[occurrence.recurrenceFrequency]}
            </span>
          ) : null}
        </div>
        {movedFromLabel ? (
          <p className={styles.TribeEventAgendaItem__note}>{movedFromLabel}</p>
        ) : null}
        {isCancelled ? null : (
          <TribeEventAttendanceSummary
            isPast={isPast}
            occurrence={occurrence}
            variant={TRIBE_EVENT_ATTENDANCE_SUMMARY_VARIANT.compact}
          />
        )}
      </div>
      <div className={styles.TribeEventAgendaItem__actions}>
        {canAddToGoogleCalendar ? (
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
        ) : null}
        {occurrence.meetingUrl && !isCancelled ? (
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
    </AnimatedListItem>
  );
}
