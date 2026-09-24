"use client";

import { type FormEvent, useState } from "react";

import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Textarea,
} from "beez-ui";

import {
  buildBuenosAiresInstant,
  formatBuenosAiresTime,
  formatBuenosAiresWeekdayDay,
  getBuenosAiresDateKey,
} from "@/lib/date-time/buenos-aires-format";
import type { TribeEventOccurrenceResult } from "@/src/modules/events/application/results/tribe-event-result";
import {
  TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND,
  TRIBE_EVENT_OCCURRENCE_EXCEPTION_REASON_MAX_LENGTH,
} from "@/src/modules/events/constants/tribe-events";
import type { TribeEventOccurrenceExceptionRequestBody } from "@/src/modules/events/infrastructure/api/schemas/tribe-event-exception-request-schemas";
import styles from "./styles.module.scss";

/**
 * Change requested for one date (the container adds the original start).
 */
export type TribeEventOccurrenceExceptionPayload = Omit<
  TribeEventOccurrenceExceptionRequestBody,
  "originalStartsAt"
>;

export type TribeEventOccurrenceExceptionMode =
  (typeof TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND)[keyof typeof TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND];

type TribeEventOccurrenceExceptionDialogProps = {
  isSaving: boolean;
  /** `cancelled` asks for an optional reason; `moved` for the new schedule. */
  mode: TribeEventOccurrenceExceptionMode;
  /** Date being changed; null closes the dialog. */
  occurrence: TribeEventOccurrenceResult | null;
  onClose: () => void;
  onSubmit: (payload: TribeEventOccurrenceExceptionPayload) => void;
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
const FIELD_ID = {
  date: "tribe-event-exception-date",
  endsDate: "tribe-event-exception-ends-date",
  endsOnAnotherDay: "tribe-event-exception-ends-on-another-day",
  endsTime: "tribe-event-exception-ends-time",
  reason: "tribe-event-exception-reason",
  startsTime: "tribe-event-exception-starts-time",
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
 * Validates the move form and builds the payload, or returns the Spanish
 * error to show next to the form.
 */
function buildMovePayload(
  values: ExceptionFormValues
): { error: string } | { payload: TribeEventOccurrenceExceptionPayload } {
  const newStartsAt = buildBuenosAiresInstant(values.date, values.startsTime);

  if (!newStartsAt) {
    return { error: COPY.missingSchedule };
  }

  if (values.endsDate && !values.endsTime) {
    return { error: COPY.missingEndTime };
  }

  const newEndsAt = values.endsTime
    ? buildBuenosAiresInstant(values.endsDate || values.date, values.endsTime)
    : null;

  if (newEndsAt && Date.parse(newEndsAt) <= Date.parse(newStartsAt)) {
    return { error: COPY.invalidEnd };
  }

  return {
    payload: {
      kind: TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND.moved,
      newEndsAt,
      newStartsAt,
      reason: values.reason,
    },
  };
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
  const [validationError, setValidationError] = useState<string | null>(null);
  const [endsOnAnotherDay, setEndsOnAnotherDay] = useState(values.endsDate !== EMPTY_VALUE);
  const [durationMilliseconds] = useState(() => getOccurrenceDurationMilliseconds(occurrence));
  // While the end still holds the occurrence's own end (or a suggestion built
  // from it), every start change moves it one original duration later. The
  // first explicit edit of an end field hands the end over to the manager.
  const [isEndSuggested, setIsEndSuggested] = useState(durationMilliseconds !== null);
  const isMove = mode === TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND.moved;
  const dateLabel = occurrence ? formatBuenosAiresWeekdayDay(occurrence.originalStartsAt, true) : EMPTY_VALUE;

  const updateField = (field: keyof ExceptionFormValues, value: string) => {
    setValidationError(null);
    setValues((currentValues) => ({ ...currentValues, [field]: value }));
  };

  const updateStartField = (field: "date" | "startsTime", value: string) => {
    setValidationError(null);

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

    if (!isChecked) {
      updateField("endsDate", EMPTY_VALUE);
    }
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

    const result = buildMovePayload(values);

    if ("error" in result) {
      setValidationError(result.error);
      return;
    }

    onSubmit(result.payload);
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
        <form
          className={styles.TribeEventOccurrenceExceptionDialog__form}
          onSubmit={handleSubmit}
        >
          {isMove ? (
            <>
              <div className={styles.TribeEventOccurrenceExceptionDialog__field}>
                <label htmlFor={FIELD_ID.date}>{COPY.dateLabel}</label>
                <Input
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
                    id={FIELD_ID.endsTime}
                    type={INPUT_TYPE.time}
                    value={values.endsTime}
                    onChange={(event) => updateEndField("endsTime", event.currentTarget.value)}
                  />
                </div>
              </div>
              {endsOnAnotherDay ? (
                <div className={styles.TribeEventOccurrenceExceptionDialog__field}>
                  <label htmlFor={FIELD_ID.endsDate}>{COPY.endsDateLabel}</label>
                  {/* No native `min`: an earlier end must reach the Spanish
                      inline error instead of a browser-language bubble. */}
                  <Input
                    id={FIELD_ID.endsDate}
                    type={INPUT_TYPE.date}
                    value={values.endsDate}
                    onChange={(event) => updateEndField("endsDate", event.currentTarget.value)}
                  />
                </div>
              ) : null}
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
          {validationError ? (
            <p className={styles.TribeEventOccurrenceExceptionDialog__error} role="alert">
              {validationError}
            </p>
          ) : null}
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
