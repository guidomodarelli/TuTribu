"use client";

import { Button } from "beez-ui";

import {
  formatBuenosAiresLongDate,
  formatBuenosAiresTimeRange,
} from "@/lib/date-time/buenos-aires-format";
import {
  formatOccurrenceCountdown,
  isOccurrenceJoinable,
  isOccurrenceLive,
} from "@/lib/events/tribe-event-occurrence-timing";
import type {
  TribeEventAttendanceStatus,
  TribeEventOccurrenceResult,
} from "@/src/modules/events/application/results/tribe-event-result";
import { TRIBE_EVENT_ATTENDANCE_LABEL } from "@/src/modules/events/constants/tribe-event-copy";
import { TRIBE_EVENT_ATTENDANCE_STATUS } from "@/src/modules/events/constants/tribe-events";
import styles from "./styles.module.scss";

type TribeNextEventProps = {
  isSavingAttendance: boolean;
  /** Current time (epoch ms); the block only renders after hydration. */
  nowTime: number;
  occurrence: TribeEventOccurrenceResult;
  onSeeDetail: (occurrence: TribeEventOccurrenceResult) => void;
  onSetAttendance: (
    occurrence: TribeEventOccurrenceResult,
    status: TribeEventAttendanceStatus | null
  ) => void;
};

const ATTENDANCE_OPTIONS = [
  TRIBE_EVENT_ATTENDANCE_STATUS.going,
  TRIBE_EVENT_ATTENDANCE_STATUS.notGoing,
] as const;
const BUTTON_ATTRIBUTE = {
  sizeSmall: "sm",
  typeButton: "button",
  variantGhost: "ghost",
  variantOutline: "outline",
  variantSecondary: "secondary",
} as const;
const GROUP_ROLE = "group";
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
 * Highlight of the closest occurrence that has not finished yet, with quick
 * attendance buttons and a shortcut to the detail.
 */
export function TribeNextEvent({
  isSavingAttendance,
  nowTime,
  occurrence,
  onSeeDetail,
  onSetAttendance,
}: TribeNextEventProps) {
  const isLive = isOccurrenceLive(occurrence, nowTime);
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
        <p className={styles.TribeNextEvent__schedule}>
          {formatBuenosAiresLongDate(occurrence.startsAt)}
          {COPY.scheduleSeparator}
          {formatBuenosAiresTimeRange(occurrence.startsAt, occurrence.endsAt)}
        </p>
      </div>
      <div className={styles.TribeNextEvent__actions}>
        {joinUrl ? (
          <Button asChild size={BUTTON_ATTRIBUTE.sizeSmall}>
            <a href={joinUrl} rel={LINK_ATTRIBUTE.noreferrer} target={LINK_ATTRIBUTE.targetBlank}>
              {COPY.join}
            </a>
          </Button>
        ) : null}
        <div
          aria-label={COPY.attendanceLegend}
          className={styles.TribeNextEvent__attendanceButtons}
          role={GROUP_ROLE}
        >
          {ATTENDANCE_OPTIONS.map((status) => {
            const isSelected = occurrence.attendance.viewerStatus === status;

            return (
              <Button
                aria-pressed={isSelected}
                disabled={isSavingAttendance}
                key={status}
                size={BUTTON_ATTRIBUTE.sizeSmall}
                type={BUTTON_ATTRIBUTE.typeButton}
                variant={
                  isSelected
                    ? BUTTON_ATTRIBUTE.variantSecondary
                    : BUTTON_ATTRIBUTE.variantOutline
                }
                onClick={() => onSetAttendance(occurrence, isSelected ? null : status)}
              >
                {TRIBE_EVENT_ATTENDANCE_LABEL[status]}
              </Button>
            );
          })}
        </div>
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
