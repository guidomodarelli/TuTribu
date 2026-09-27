"use client";

import { type FormEvent, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import { Button, Checkbox, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Input, Textarea, AnimatedCollapse, MOTION_TIMING, MOTION_EASE } from "beez-ui";

import {
  addDaysToBuenosAiresDateKey,
  buildBuenosAiresInstant,
  formatBuenosAiresTime,
  formatBuenosAiresWeekdayDay,
  getBuenosAiresDateKey,
} from "@/lib/date-time/buenos-aires-format";
import type { TribeEventOccurrenceExceptionSubmission } from "@/lib/events/tribe-event-form-submissions";
import type { TribeEventOccurrenceResult } from "@/src/modules/events/application/results/tribe-event-result";
import {
  TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND,
  TRIBE_EVENT_OCCURRENCE_EXCEPTION_REASON_MAX_LENGTH,
} from "@/src/modules/events/constants/tribe-events";
import styles from "./styles.module.scss";

export type TribeEventOccurrenceExceptionMode =
  (typeof TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND)[keyof typeof TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND];

type TribeEventOccurrenceExceptionDialogProps = {
  isSaving: boolean;
  /** `cancelled` asks for an optional reason; `moved` for the new schedule. */
  mode: TribeEventOccurrenceExceptionMode;
  /** Date being changed; null closes the dialog. */
  occurrence: TribeEventOccurrenceResult | null;
  onClose: () => void;
  onSubmit: (submission: TribeEventOccurrenceExceptionSubmission) => void;
};

type ExceptionFormValues = {
  date: string;
  /** Buenos Aires end date; empty while the moved date ends the same day. */
  endsDate: string;
  endsTime: string;
  reason: string;
  startsTime: string;
};

const EMPTY_VALUE = "";
const NEXT_DAY_OFFSET = 1;
const FIELD_ID = {
  date: "tribe-event-exception-date",
  endsDate: "tribe-event-exception-ends-date",
  endsOnAnotherDay: "tribe-event-exception-ends-on-another-day",
  endsTime: "tribe-event-exception-ends-time",
  reason: "tribe-event-exception-reason",
  startsTime: "tribe-event-exception-starts-time",
  validationError: "tribe-event-exception-validation-error",
} as const;

/** Id of a form control that a validation message can point at. */
type ExceptionFormFieldId = (typeof FIELD_ID)[keyof typeof FIELD_ID];

/**
 * Validation failure of the move form: the Spanish message and the control
 * it belongs to, which is marked invalid and focused.
 */
type ExceptionFormValidationIssue = {
  fieldId: ExceptionFormFieldId;
  message: string;
};

/** Opacity-only fade for the end date that appears with «Termina otro día». */
const CONDITIONAL_FIELD_MOTION = {
  animate: { opacity: 1 },
  exit: { opacity: 0, transition: { duration: MOTION_TIMING.exit, ease: MOTION_EASE } },
  initial: { opacity: 0 },
  transition: { duration: MOTION_TIMING.enter, ease: MOTION_EASE },
} as const;
const INPUT_TYPE = {
  date: "date",
  time: "time",
} as const;
const BUTTON_ATTRIBUTE = {
  typeButton: "button",
  typeSubmit: "submit",
  variantDestructive: "destructive",
  variantGhost: "ghost",
} as const;
const COPY = {
  backButton: "Volver",
  cancelDescription: (dateLabel: string) =>
    `Solo se cancela la fecha del ${dateLabel}. El resto de la serie sigue igual.`,
  cancelSubmit: "Cancelar esta fecha",
  cancelTitle: "Cancelar esta fecha",
  dateLabel: "Nueva fecha",
  endsDateLabel: "Fecha de fin",
  endsOnAnotherDayLabel: "Termina otro día",
  endsTimeLabel: "Hora de fin (opcional)",
  invalidEnd: "La hora de fin debe ser posterior al inicio.",
  missingEndDate: "Elegí la fecha de fin o destildá «Termina otro día».",
  missingEndTime: "Indicá la hora de fin o dejá vacía la fecha de fin.",
  missingSchedule: "Elegí la nueva fecha y la hora de inicio.",
  moveDescription: (dateLabel: string) =>
    `Solo se mueve la fecha del ${dateLabel}. Las respuestas de asistencia se conservan.`,
  moveSubmit: "Mover esta fecha",
  moveTitle: "Mover esta fecha",
  reasonLabel: "Motivo (opcional)",
  reasonPlaceholder: "Se muestra junto a la fecha.",
  saving: "Guardando…",
  startsTimeLabel: "Hora de inicio",
} as const;

function createInitialValues(occurrence: TribeEventOccurrenceResult | null): ExceptionFormValues {
  if (!occurrence) {
    return {
      date: EMPTY_VALUE,
      endsDate: EMPTY_VALUE,
      endsTime: EMPTY_VALUE,
      reason: EMPTY_VALUE,
      startsTime: EMPTY_VALUE,
    };
  }

  const startDateKey = getBuenosAiresDateKey(occurrence.startsAt);
  const endDateKey = occurrence.endsAt ? getBuenosAiresDateKey(occurrence.endsAt) : EMPTY_VALUE;

  return {
    date: startDateKey,
    endsDate: endDateKey === startDateKey ? EMPTY_VALUE : endDateKey,
    endsTime: occurrence.endsAt ? formatBuenosAiresTime(occurrence.endsAt) : EMPTY_VALUE,
    reason: occurrence.exception?.reason ?? EMPTY_VALUE,
    startsTime: formatBuenosAiresTime(occurrence.startsAt),
  };
}

/**
 * Length of the occurrence being moved, or null when it has no explicit end.
 */
function getOccurrenceDurationMilliseconds(
  occurrence: TribeEventOccurrenceResult | null
): number | null {
  if (!occurrence?.endsAt) {
    return null;
  }

  return Date.parse(occurrence.endsAt) - Date.parse(occurrence.startsAt);
}

/**
 * Suggests the end for a new start so the moved date keeps its original
 * length, including the next-day end date of an overnight occurrence.
 * Returns null while the start is incomplete.
 */
function suggestEnd(
  values: ExceptionFormValues,
  durationMilliseconds: number
): Pick<ExceptionFormValues, "endsDate" | "endsTime"> | null {
  const startsAt = buildBuenosAiresInstant(values.date, values.startsTime);

  if (!startsAt) {
    return null;
  }

  const endsAt = new Date(Date.parse(startsAt) + durationMilliseconds);
  const endDateKey = getBuenosAiresDateKey(endsAt);

  return {
    endsDate: endDateKey === values.date ? EMPTY_VALUE : endDateKey,
    endsTime: formatBuenosAiresTime(endsAt),
  };
}

/**
 * Validates the move form and builds the submission, or returns the Spanish
 * error to show next to the form with the control it belongs to.
 */
function buildMovePayload(
  values: ExceptionFormValues,
  endsOnAnotherDay: boolean
): { issue: ExceptionFormValidationIssue } | { submission: TribeEventOccurrenceExceptionSubmission } {
  const newStartsAt = buildBuenosAiresInstant(values.date, values.startsTime);

  if (!newStartsAt) {
    return {
      issue: {
        fieldId: values.date ? FIELD_ID.startsTime : FIELD_ID.date,
        message: COPY.missingSchedule,
      },
    };
  }

  // A checked «Termina otro día» with no date would silently save a same-day
  // end, so the chosen next-day end must be explicit.
  if (endsOnAnotherDay && !values.endsDate) {
    return { issue: { fieldId: FIELD_ID.endsDate, message: COPY.missingEndDate } };
  }

  if (values.endsDate && !values.endsTime) {
    return { issue: { fieldId: FIELD_ID.endsTime, message: COPY.missingEndTime } };
  }

  const newEndsAt = values.endsTime
    ? buildBuenosAiresInstant(values.endsDate || values.date, values.endsTime)
    : null;

  if (newEndsAt && Date.parse(newEndsAt) <= Date.parse(newStartsAt)) {
    return { issue: { fieldId: FIELD_ID.endsTime, message: COPY.invalidEnd } };
  }

  return {
    submission: {
      kind: TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND.moved,
      newEndsAt,
      newStartsAt,
      reason: values.reason,
    },
  };
}

/**
 * Moves focus to the control a validation message points at.
 */
function focusFormControl(form: HTMLFormElement, fieldId: ExceptionFormFieldId): void {
  const control = form.elements.namedItem(fieldId);

  if (control instanceof HTMLElement) {
    control.focus();
  }
}

/**
 * Form to cancel or move a single date of a series. It only changes that
 * date, and the copy says so explicitly so it is never confused with
 * editing the whole series.
 */
export function TribeEventOccurrenceExceptionDialog({
  isSaving,
  mode,
  occurrence,
  onClose,
  onSubmit,
}: TribeEventOccurrenceExceptionDialogProps) {
  const [values, setValues] = useState<ExceptionFormValues>(() =>
    createInitialValues(occurrence)
  );
  const [validationIssue, setValidationIssue] = useState<ExceptionFormValidationIssue | null>(
    null
  );
  // Last message shown, kept while the error region collapses.
  const [shownValidationMessage, setShownValidationMessage] = useState<string | null>(null);

  if (validationIssue && validationIssue.message !== shownValidationMessage) {
    setShownValidationMessage(validationIssue.message);
  }
  const [endsOnAnotherDay, setEndsOnAnotherDay] = useState(values.endsDate !== EMPTY_VALUE);
  const [durationMilliseconds] = useState(() => getOccurrenceDurationMilliseconds(occurrence));
  // While the end still holds the occurrence's own end (or a suggestion built
  // from it), every start change moves it one original duration later. The
  // first explicit edit of an end field hands the end over to the manager.
  const [isEndSuggested, setIsEndSuggested] = useState(durationMilliseconds !== null);
  const isMove = mode === TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND.moved;
  const dateLabel = occurrence ? formatBuenosAiresWeekdayDay(occurrence.originalStartsAt, true) : EMPTY_VALUE;

  /** ARIA wiring that ties a control to the current validation message. */
  const getValidationProps = (fieldId: ExceptionFormFieldId) =>
    validationIssue?.fieldId === fieldId
      ? { "aria-describedby": FIELD_ID.validationError, "aria-invalid": true }
      : {};

  const updateField = (field: keyof ExceptionFormValues, value: string) => {
    setValidationIssue(null);
    setValues((currentValues) => ({ ...currentValues, [field]: value }));
  };

  const updateStartField = (field: "date" | "startsTime", value: string) => {
    setValidationIssue(null);

    const nextValues = { ...values, [field]: value };
    const suggestedEnd =
      isEndSuggested && durationMilliseconds !== null
        ? suggestEnd(nextValues, durationMilliseconds)
        : null;

    if (!suggestedEnd) {
      setValues(nextValues);
      return;
    }

    setEndsOnAnotherDay(suggestedEnd.endsDate !== EMPTY_VALUE);
    setValues({ ...nextValues, ...suggestedEnd });
  };

  // An explicit end choice stops the end from following the start.
  const updateEndField = (field: "endsDate" | "endsTime", value: string) => {
    setIsEndSuggested(false);
    updateField(field, value);
  };

  const toggleEndsOnAnotherDay = (isChecked: boolean) => {
    setIsEndSuggested(false);
    setEndsOnAnotherDay(isChecked);

    setValidationIssue(null);
    // Checking it starts from the day after the new date; the manager can
    // still pick another day. Unchecking withdraws the end date.
    setValues((currentValues) => ({
      ...currentValues,
      endsDate: isChecked
        ? currentValues.endsDate || addDaysToBuenosAiresDateKey(currentValues.date, NEXT_DAY_OFFSET)
        : EMPTY_VALUE,
    }));
  };

  const handleSubmit = (submitEvent: FormEvent<HTMLFormElement>) => {
    submitEvent.preventDefault();

    if (isSaving) {
      return;
    }

    if (!isMove) {
      onSubmit({ kind: TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND.cancelled, reason: values.reason });
      return;
    }

    const result = buildMovePayload(values, endsOnAnotherDay);

    if ("issue" in result) {
      setValidationIssue(result.issue);
      focusFormControl(submitEvent.currentTarget, result.issue.fieldId);
      return;
    }

    onSubmit(result.submission);
  };

  return (
    <Dialog
      open={occurrence !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent className={styles.TribeEventOccurrenceExceptionDialog}>
        <DialogHeader>
          <DialogTitle>{isMove ? COPY.moveTitle : COPY.cancelTitle}</DialogTitle>
          <DialogDescription>
            {isMove ? COPY.moveDescription(dateLabel) : COPY.cancelDescription(dateLabel)}
          </DialogDescription>
        </DialogHeader>
        {/* Native validation is off so an empty date or time reaches the
            Spanish inline message instead of a browser-language bubble. */}
        <form
          className={styles.TribeEventOccurrenceExceptionDialog__form}
          noValidate
          onSubmit={handleSubmit}
        >
          {isMove ? (
            <>
              <div className={styles.TribeEventOccurrenceExceptionDialog__field}>
                <label htmlFor={FIELD_ID.date}>{COPY.dateLabel}</label>
                <Input
                  {...getValidationProps(FIELD_ID.date)}
                  id={FIELD_ID.date}
                  required
                  type={INPUT_TYPE.date}
                  value={values.date}
                  onChange={(event) => updateStartField("date", event.currentTarget.value)}
                />
              </div>
              <div className={styles.TribeEventOccurrenceExceptionDialog__row}>
                <div className={styles.TribeEventOccurrenceExceptionDialog__field}>
                  <label htmlFor={FIELD_ID.startsTime}>{COPY.startsTimeLabel}</label>
                  <Input
                    {...getValidationProps(FIELD_ID.startsTime)}
                    id={FIELD_ID.startsTime}
                    required
                    type={INPUT_TYPE.time}
                    value={values.startsTime}
                    onChange={(event) => updateStartField("startsTime", event.currentTarget.value)}
                  />
                </div>
                <div className={styles.TribeEventOccurrenceExceptionDialog__field}>
                  <label htmlFor={FIELD_ID.endsTime}>{COPY.endsTimeLabel}</label>
                  <Input
                    {...getValidationProps(FIELD_ID.endsTime)}
                    id={FIELD_ID.endsTime}
                    type={INPUT_TYPE.time}
                    value={values.endsTime}
                    onChange={(event) => updateEndField("endsTime", event.currentTarget.value)}
                  />
                </div>
              </div>
              <AnimatePresence initial={false}>
                {endsOnAnotherDay ? (
                  <motion.div
                    className={styles.TribeEventOccurrenceExceptionDialog__field}
                    key={FIELD_ID.endsDate}
                    {...CONDITIONAL_FIELD_MOTION}
                  >
                    <label htmlFor={FIELD_ID.endsDate}>{COPY.endsDateLabel}</label>
                    {/* No native `min`: an earlier end must reach the Spanish
                        inline error instead of a browser-language bubble. */}
                    <Input
                      {...getValidationProps(FIELD_ID.endsDate)}
                      id={FIELD_ID.endsDate}
                      type={INPUT_TYPE.date}
                      value={values.endsDate}
                      onChange={(event) => updateEndField("endsDate", event.currentTarget.value)}
                    />
                  </motion.div>
                ) : null}
              </AnimatePresence>
              <div className={styles.TribeEventOccurrenceExceptionDialog__toggle}>
                <Checkbox
                  checked={endsOnAnotherDay}
                  id={FIELD_ID.endsOnAnotherDay}
                  onCheckedChange={(checked) => toggleEndsOnAnotherDay(checked === true)}
                />
                <label htmlFor={FIELD_ID.endsOnAnotherDay}>{COPY.endsOnAnotherDayLabel}</label>
              </div>
            </>
          ) : null}
          <div className={styles.TribeEventOccurrenceExceptionDialog__field}>
            <label htmlFor={FIELD_ID.reason}>{COPY.reasonLabel}</label>
            <Textarea
              className={styles.TribeEventOccurrenceExceptionDialog__textarea}
              id={FIELD_ID.reason}
              maxLength={TRIBE_EVENT_OCCURRENCE_EXCEPTION_REASON_MAX_LENGTH}
              placeholder={COPY.reasonPlaceholder}
              value={values.reason}
              onChange={(event) => updateField("reason", event.currentTarget.value)}
            />
          </div>
          <AnimatedCollapse isOpen={validationIssue !== null}>
            <p
              className={styles.TribeEventOccurrenceExceptionDialog__error}
              id={FIELD_ID.validationError}
              role="alert"
            >
              {validationIssue?.message ?? shownValidationMessage}
            </p>
          </AnimatedCollapse>
          <div className={styles.TribeEventOccurrenceExceptionDialog__actions}>
            <Button
              type={BUTTON_ATTRIBUTE.typeButton}
              variant={BUTTON_ATTRIBUTE.variantGhost}
              onClick={onClose}
            >
              {COPY.backButton}
            </Button>
            <Button
              disabled={isSaving}
              type={BUTTON_ATTRIBUTE.typeSubmit}
              variant={isMove ? undefined : BUTTON_ATTRIBUTE.variantDestructive}
            >
              {isSaving ? COPY.saving : isMove ? COPY.moveSubmit : COPY.cancelSubmit}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
