import { MOTION_EASE, MOTION_TIMING } from "@golfo/ui";

const TRIBE_EVENT_END_FIELDS_COPY = {
  missingEndDate: "Elegí la fecha de fin o destildá «Termina otro día».",
  missingEndTime: "Indicá la hora de fin o dejá vacía la fecha de fin.",
} as const;

/**
 * Validation failure shown under the control it belongs to: the Spanish
 * message and that control, which is marked invalid, described by the message
 * and focused so the person lands on what to fix.
 */
export type TribeEventFormValidationIssue<TFieldId extends string> = {
  fieldId: TFieldId;
  message: string;
};

/**
 * Fade for fields that appear with a choice («Termina otro día», a
 * repetition): opacity only, so the two-column row does not shift sideways.
 */
export const TRIBE_EVENT_CONDITIONAL_FIELD_MOTION = {
  animate: { opacity: 1 },
  exit: { opacity: 0, transition: { duration: MOTION_TIMING.exit, ease: MOTION_EASE } },
  initial: { opacity: 0 },
  transition: { duration: MOTION_TIMING.enter, ease: MOTION_EASE },
} as const;

/**
 * Checks the optional end of an event form. A checked «Termina otro día» with
 * no date would silently save a same-day end, so the chosen next-day end must
 * be explicit; an end date needs its end time.
 *
 * @param values - End date and time typed in the form.
 * @param endsOnAnotherDay - Whether «Termina otro día» is checked.
 * @param fieldIds - Ids of the end date and end time controls.
 * @returns The issue to show, or `null` when the end fields are consistent.
 */
export function findTribeEventEndFieldsIssue<TFieldId extends string>(
  values: { endsDate: string; endsTime: string },
  endsOnAnotherDay: boolean,
  fieldIds: { endsDate: TFieldId; endsTime: TFieldId }
): TribeEventFormValidationIssue<TFieldId> | null {
  if (endsOnAnotherDay && !values.endsDate) {
    return { fieldId: fieldIds.endsDate, message: TRIBE_EVENT_END_FIELDS_COPY.missingEndDate };
  }

  if (values.endsDate && !values.endsTime) {
    return { fieldId: fieldIds.endsTime, message: TRIBE_EVENT_END_FIELDS_COPY.missingEndTime };
  }

  return null;
}
