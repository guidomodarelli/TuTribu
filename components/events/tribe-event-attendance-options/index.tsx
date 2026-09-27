"use client";

import { useId } from "react";
import { LayoutGroup, motion } from "motion/react";
import { Button, SPRING_LAYOUT } from "beez-ui";

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
} as const;
const GROUP_ROLE = "group";
/** Shared-layout id of the highlight that glides to the picked answer. */
const SELECTION_INDICATOR_LAYOUT_ID = "tribe-event-attendance-selection";

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
 * the detail dialog. Tapping the selected answer clears it. The selected
 * answer carries a highlight that glides between buttons when the answer
 * changes; each group scopes its own highlight so two groups on screen never
 * animate into each other.
 */
export function TribeEventAttendanceOptions({
  isSaving,
  legend,
  onSelect,
  viewerStatus,
}: TribeEventAttendanceOptionsProps) {
  const layoutGroupId = useId();

  return (
    <LayoutGroup id={layoutGroupId}>
      <div
        aria-busy={isSaving}
        aria-label={legend}
        className={styles.TribeEventAttendanceOptions}
        role={GROUP_ROLE}
      >
        {TRIBE_EVENT_ATTENDANCE_OPTIONS.map((option) => {
          const isSelected = isOptionSelected(option, viewerStatus);

          // The highlight is the button's sibling, not its child: the press
          // transform would otherwise lift it above the neighbor buttons.
          return (
            <span className={styles.TribeEventAttendanceOptions__slot} key={option}>
              {isSelected ? (
                <motion.span
                  aria-hidden
                  className={styles.TribeEventAttendanceOptions__indicator}
                  layoutId={SELECTION_INDICATOR_LAYOUT_ID}
                  transition={SPRING_LAYOUT}
                />
              ) : null}
              <Button
                aria-pressed={isSelected}
                className={
                  isSelected
                    ? `${styles.TribeEventAttendanceOptions__option} ${styles["TribeEventAttendanceOptions__option--selected"]}`
                    : styles.TribeEventAttendanceOptions__option
                }
                disabled={isSaving}
                size={BUTTON_ATTRIBUTE.sizeSmall}
                type={BUTTON_ATTRIBUTE.typeButton}
                variant={BUTTON_ATTRIBUTE.variantOutline}
                onClick={() => onSelect(isSelected ? null : option)}
              >
                {TRIBE_EVENT_ATTENDANCE_LABEL[option]}
              </Button>
            </span>
          );
        })}
      </div>
    </LayoutGroup>
  );
}
