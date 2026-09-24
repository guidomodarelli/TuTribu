"use client";

import { Button } from "beez-ui";

import type {
  TribeEventAttendanceOption,
  TribeEventAttendanceStatus,
} from "@/src/modules/events/application/results/tribe-event-result";
import { TRIBE_EVENT_ATTENDANCE_LABEL } from "@/src/modules/events/constants/tribe-event-copy";
import {
  TRIBE_EVENT_ATTENDANCE_OPTIONS,
  TRIBE_EVENT_ATTENDANCE_STATUS,
} from "@/src/modules/events/constants/tribe-events";
import styles from "./styles.module.scss";

type TribeEventAttendanceOptionsProps = {
  isSaving: boolean;
  /** Accessible name of the button group. */
  legend: string;
  /** Called with the picked answer, or null to remove the current one. */
  onSelect: (status: TribeEventAttendanceOption | null) => void;
  viewerStatus: TribeEventAttendanceStatus | null;
};

const BUTTON_ATTRIBUTE = {
  sizeSmall: "sm",
  typeButton: "button",
  variantOutline: "outline",
  variantSecondary: "secondary",
} as const;
const GROUP_ROLE = "group";

/**
 * Whether an answer button reads as selected. Being on the waitlist is a
 * "Voy" that is waiting for a seat, so "Voy" stays pressed and tapping it
 * again leaves the waitlist.
 */
function isOptionSelected(
  option: TribeEventAttendanceOption,
  viewerStatus: TribeEventAttendanceStatus | null
): boolean {
  return (
    option === viewerStatus ||
    (option === TRIBE_EVENT_ATTENDANCE_STATUS.going &&
      viewerStatus === TRIBE_EVENT_ATTENDANCE_STATUS.waitlisted)
  );
}

/**
 * "Voy / Tal vez / No voy" toggle buttons shared by the next event card and
 * the detail dialog. Tapping the selected answer clears it.
 */
export function TribeEventAttendanceOptions({
  isSaving,
  legend,
  onSelect,
  viewerStatus,
}: TribeEventAttendanceOptionsProps) {
  return (
    <div aria-label={legend} className={styles.TribeEventAttendanceOptions} role={GROUP_ROLE}>
      {TRIBE_EVENT_ATTENDANCE_OPTIONS.map((option) => {
        const isSelected = isOptionSelected(option, viewerStatus);

        return (
          <Button
            aria-pressed={isSelected}
            disabled={isSaving}
            key={option}
            size={BUTTON_ATTRIBUTE.sizeSmall}
            type={BUTTON_ATTRIBUTE.typeButton}
            variant={isSelected ? BUTTON_ATTRIBUTE.variantSecondary : BUTTON_ATTRIBUTE.variantOutline}
            onClick={() => onSelect(isSelected ? null : option)}
          >
            {TRIBE_EVENT_ATTENDANCE_LABEL[option]}
          </Button>
        );
      })}
    </div>
  );
}
