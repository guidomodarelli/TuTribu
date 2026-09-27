"use client";

import { Avatar, AvatarFallback, AvatarGroup, AvatarGroupCount, AvatarImage, cn, PresenceSwap } from "beez-ui";

import {
  formatAttendanceCounts,
  formatCapacityStatus,
  formatGoingNames,
  formatWaitlistPosition,
} from "@/lib/events/tribe-event-attendance-copy";
import { getMemberAvatarInitials } from "@/lib/members/member-avatar-initials";
import type { TribeEventOccurrenceResult } from "@/src/modules/events/application/results/tribe-event-result";
import styles from "./styles.module.scss";

export const TRIBE_EVENT_ATTENDANCE_SUMMARY_VARIANT = {
  compact: "compact",
  full: "full",
} as const;

type TribeEventAttendanceSummaryVariant =
  (typeof TRIBE_EVENT_ATTENDANCE_SUMMARY_VARIANT)[keyof typeof TRIBE_EVENT_ATTENDANCE_SUMMARY_VARIANT];

type TribeEventAttendanceSummaryProps = {
  isPast: boolean;
  occurrence: Pick<TribeEventOccurrenceResult, "attendance" | "capacity">;
  /** `compact` fits an agenda row: small avatars and a single line. */
  variant?: TribeEventAttendanceSummaryVariant;
};

const AVATAR_SIZE_SMALL = "sm";
const COMPACT_AVATAR_LIMIT = 3;
// Stacked avatars overlap, so only the first initial stays readable.
const STACKED_AVATAR_INITIALS = 1;
const MORE_PREFIX = "+";
const DETAILS_SEPARATOR = " · ";
/** Inline wrapper so each line keeps its paragraph box while its text swaps. */
const PRESENCE_ELEMENT = "span";
const COPY = {
  nobodyYet: "Todavía nadie confirmó asistencia.",
  nobodyPast: "Nadie confirmó asistencia.",
} as const;

/**
 * Attendance of one occurrence: stacked avatars of people going with
 * "Ana, Juan y 10 más van", the going/maybe counts, free seats or waitlist,
 * and the viewer's waitlist position. Avatars are decorative; the sentence
 * carries the same information for assistive technology. When an answer
 * changes the counts, the lines cross-fade to the new text instead of
 * jumping; the first render is static so server output stays visible.
 */
export function TribeEventAttendanceSummary({
  isPast,
  occurrence,
  variant = TRIBE_EVENT_ATTENDANCE_SUMMARY_VARIANT.full,
}: TribeEventAttendanceSummaryProps) {
  const { attendance, capacity } = occurrence;
  const isCompact = variant === TRIBE_EVENT_ATTENDANCE_SUMMARY_VARIANT.compact;
  const visiblePreview = isCompact
    ? attendance.goingPreview.slice(0, COMPACT_AVATAR_LIMIT)
    : attendance.goingPreview;
  const hiddenGoingCount = attendance.goingCount - visiblePreview.length;
  // Without preview profiles the counts line already says "N van".
  const namesText =
    attendance.goingPreview.length > 0
      ? formatGoingNames(attendance.goingPreview, attendance.goingCount, isPast)
      : null;
  const countsText = formatAttendanceCounts(attendance.goingCount, attendance.maybeCount, isPast);
  const capacityText = isPast
    ? null
    : formatCapacityStatus(capacity, attendance.goingCount, attendance.waitlistedCount);
  const waitlistText = isPast
    ? null
    : formatWaitlistPosition(attendance.viewerStatus, attendance.viewerWaitlistPosition);
  const emptyText = isPast ? COPY.nobodyPast : COPY.nobodyYet;
  const detailsText = [countsText, capacityText].filter(Boolean).join(DETAILS_SEPARATOR);

  // Agenda rows stay quiet when nobody answered and the event has no limit.
  if (isCompact && visiblePreview.length === 0 && !detailsText && !waitlistText) {
    return null;
  }

  return (
    <div
      className={cn(
        styles.TribeEventAttendanceSummary,
        isCompact && styles["TribeEventAttendanceSummary--compact"]
      )}
    >
      {visiblePreview.length > 0 ? (
        <AvatarGroup aria-hidden className={styles.TribeEventAttendanceSummary__avatars}>
          {visiblePreview.map((attendee) => (
            <Avatar key={attendee.id} size={AVATAR_SIZE_SMALL}>
              {attendee.image ? <AvatarImage alt="" src={attendee.image} /> : null}
              <AvatarFallback className={styles.TribeEventAttendanceSummary__initials}>
                {getMemberAvatarInitials(attendee.name, {
                  maxInitials: STACKED_AVATAR_INITIALS,
                })}
              </AvatarFallback>
            </Avatar>
          ))}
          {hiddenGoingCount > 0 ? (
            <AvatarGroupCount className={styles.TribeEventAttendanceSummary__more}>
              {MORE_PREFIX + String(hiddenGoingCount)}
            </AvatarGroupCount>
          ) : null}
        </AvatarGroup>
      ) : null}
      <div className={styles.TribeEventAttendanceSummary__text}>
        {!isCompact && (namesText || !countsText) ? (
          <p className={styles.TribeEventAttendanceSummary__names}>{namesText ?? emptyText}</p>
        ) : null}
        {detailsText ? (
          <p className={styles.TribeEventAttendanceSummary__counts}>
            <PresenceSwap as={PRESENCE_ELEMENT} presenceKey={detailsText}>
              {detailsText}
            </PresenceSwap>
          </p>
        ) : null}
        {waitlistText ? (
          <p className={styles.TribeEventAttendanceSummary__waitlist}>
            <PresenceSwap as={PRESENCE_ELEMENT} presenceKey={waitlistText}>
              {waitlistText}
            </PresenceSwap>
          </p>
        ) : null}
      </div>
    </div>
  );
}
