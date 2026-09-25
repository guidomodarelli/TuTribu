"use client";

import { Button } from "beez-ui";

import { TribeEventAttendanceOptions } from "@/components/events/tribe-event-attendance-options";
import { TribeEventAttendanceSummary } from "@/components/events/tribe-event-attendance-summary";
import { TribeEventTypeBadge } from "@/components/events/tribe-event-type-badge";
import { formatMovedFromLabel } from "@/lib/events/tribe-event-occurrence-exception-copy";
import {
  formatBuenosAiresLongDate,
  formatBuenosAiresTimeRange,
} from "@/lib/date-time/buenos-aires-format";
import { formatViewerLocalTimeLabel } from "@/lib/date-time/viewer-local-time-format";
import { formatAttendanceStreak } from "@/lib/events/tribe-event-attendance-copy";
import {
  formatOccurrenceCountdown,
  isOccurrenceJoinable,
  isOccurrenceLive,
} from "@/lib/events/tribe-event-occurrence-timing";
import type {
  TribeEventAttendanceOption,
  TribeEventAttendanceStreakResult,
  TribeEventOccurrenceResult,
} from "@/src/modules/events/application/results/tribe-event-result";
import styles from "./styles.module.scss";

type TribeNextEventProps = {
  /** Viewer-only streak over the last finished occurrences, when earned. */
  attendanceStreak?: TribeEventAttendanceStreakResult | null;
  isSavingAttendance: boolean;
  /** Current time (epoch ms); the block only renders after hydration. */
  nowTime: number;
  occurrence: TribeEventOccurrenceResult;
  onSeeDetail: (occurrence: TribeEventOccurrenceResult) => void;
  onSetAttendance: (
    occurrence: TribeEventOccurrenceResult,
    status: TribeEventAttendanceOption | null
  ) => void;
  /** Browser time zone, null before hydration. */
  viewerTimeZone: string | null;
};

const BUTTON_ATTRIBUTE = {
  sizeSmall: "sm",
  typeButton: "button",
  variantGhost: "ghost",
} as const;
const LINK_ATTRIBUTE = {
  noreferrer: "noreferrer",
  targetBlank: "_blank",
} as const;
const COPY = {
  attendanceLegend: "¿Vas a participar?",
  join: "Unirme",
  liveNow: "En vivo ahora",
  nextEventLabel: "Próximo evento",
  scheduleSeparator: " · ",
  seeDetail: "Ver detalle",
} as const;

/**
 * Highlight of the closest occurrence that has not finished yet (never a
 * cancelled date; a moved date shows where it came from): its type, who is
 * going, free seats, quick "Voy / Tal vez / No voy" buttons, the viewer's
 * own streak (never shown to anyone else), and a shortcut to the detail.
 */
export function TribeNextEvent({
  attendanceStreak = null,
  isSavingAttendance,
  nowTime,
  occurrence,
  onSeeDetail,
  onSetAttendance,
  viewerTimeZone,
}: TribeNextEventProps) {
  const localTimeLabel = formatViewerLocalTimeLabel(
    occurrence.startsAt,
    occurrence.endsAt,
    viewerTimeZone
  );
  const isLive = isOccurrenceLive(occurrence, nowTime);
  const movedFromLabel = formatMovedFromLabel(occurrence);
  const joinUrl =
    occurrence.meetingUrl && isOccurrenceJoinable(occurrence, nowTime)
      ? occurrence.meetingUrl
      : null;

  return (
    <section aria-label={COPY.nextEventLabel} className={styles.TribeNextEvent}>
      <div className={styles.TribeNextEvent__body}>
        <div className={styles.TribeNextEvent__heading}>
          <p className={styles.TribeNextEvent__label}>{COPY.nextEventLabel}</p>
          {isLive ? (
            <p className={styles.TribeNextEvent__live}>
              <span aria-hidden className={styles.TribeNextEvent__liveDot} />
              {COPY.liveNow}
            </p>
          ) : (
            <p className={styles.TribeNextEvent__countdown}>
              {formatOccurrenceCountdown(occurrence.startsAt, nowTime)}
            </p>
          )}
        </div>
        <p className={styles.TribeNextEvent__title}>{occurrence.title}</p>
        <TribeEventTypeBadge eventType={occurrence.eventType} />
        <p className={styles.TribeNextEvent__schedule}>
          {formatBuenosAiresLongDate(occurrence.startsAt)}
          {COPY.scheduleSeparator}
          {formatBuenosAiresTimeRange(occurrence.startsAt, occurrence.endsAt)}
          {localTimeLabel ? (
            <span className={styles.TribeNextEvent__localTime}>
              {COPY.scheduleSeparator}
              {localTimeLabel}
            </span>
          ) : null}
        </p>
        {movedFromLabel ? <p className={styles.TribeNextEvent__note}>{movedFromLabel}</p> : null}
        <TribeEventAttendanceSummary isPast={false} occurrence={occurrence} />
        {attendanceStreak ? (
          <p className={styles.TribeNextEvent__streak}>{formatAttendanceStreak(attendanceStreak)}</p>
        ) : null}
      </div>
      <div className={styles.TribeNextEvent__actions}>
        {joinUrl ? (
          <Button asChild size={BUTTON_ATTRIBUTE.sizeSmall}>
            <a href={joinUrl} rel={LINK_ATTRIBUTE.noreferrer} target={LINK_ATTRIBUTE.targetBlank}>
              {COPY.join}
            </a>
          </Button>
        ) : null}
        <TribeEventAttendanceOptions
          isSaving={isSavingAttendance}
          legend={COPY.attendanceLegend}
          viewerStatus={occurrence.attendance.viewerStatus}
          onSelect={(status) => onSetAttendance(occurrence, status)}
        />
        <Button
          size={BUTTON_ATTRIBUTE.sizeSmall}
          type={BUTTON_ATTRIBUTE.typeButton}
          variant={BUTTON_ATTRIBUTE.variantGhost}
          onClick={() => onSeeDetail(occurrence)}
        >
          {COPY.seeDetail}
        </Button>
      </div>
    </section>
  );
}
