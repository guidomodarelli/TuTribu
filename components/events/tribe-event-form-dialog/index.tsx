"use client";

import { type FormEvent, useState } from "react";

import { Button, Checkbox, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from "beez-ui";





import {
  buildBuenosAiresInstant,
  formatBuenosAiresTime,
  getBuenosAiresDateKey,
} from "@/lib/date-time/buenos-aires-format";
import type { CreateTribeEventCommand } from "@/src/modules/events/application/commands/tribe-event-command";
import type { TribeEventOccurrenceResult } from "@/src/modules/events/application/results/tribe-event-result";
import { TRIBE_EVENT_RECURRENCE_LABEL } from "@/src/modules/events/constants/tribe-event-copy";
import {
  TRIBE_EVENT_DEFAULT_DURATION_MINUTES,
  TRIBE_EVENT_FIELD_LIMIT,
  TRIBE_EVENT_RECURRENCE_FREQUENCY,
} from "@/src/modules/events/constants/tribe-events";
import styles from "./styles.module.scss";

/**
 * Body sent to the create/update event endpoints. Optional fields travel as
 * empty strings so the application layer normalizes them in one place.
 */
export type TribeEventFormPayload = Omit<CreateTribeEventCommand, "tribeSlug" | "visibleMonth">;

type TribeEventFormDialogProps = {
  editingOccurrence: TribeEventOccurrenceResult | null;
  isOpen: boolean;
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (payload: TribeEventFormPayload) => void;
};

type EventFormValues = {
  date: string;
  description: string;
  endsDate: string;
  endsTime: string;
  meetingUrl: string;
  recurrenceFrequency: string;
  recurrenceUntil: string;
  startsTime: string;
  title: string;
};

const EMPTY_VALUE = "";
const FORM_DEFAULTS: EventFormValues = {
  date: EMPTY_VALUE,
  description: EMPTY_VALUE,
  endsDate: EMPTY_VALUE,
  endsTime: EMPTY_VALUE,
  meetingUrl: EMPTY_VALUE,
  recurrenceFrequency: TRIBE_EVENT_RECURRENCE_FREQUENCY.none,
  recurrenceUntil: EMPTY_VALUE,
  startsTime: EMPTY_VALUE,
  title: EMPTY_VALUE,
};
/**
 * A series that repeats "until" a date includes that whole Buenos Aires day.
 */
const RECURRENCE_UNTIL_END_OF_DAY_TIME = "23:59";
const FIELD_ID = {
  date: "tribe-event-date",
  description: "tribe-event-description",
  endsDate: "tribe-event-ends-date",
  endsOnAnotherDay: "tribe-event-ends-on-another-day",
  endsTime: "tribe-event-ends-time",
  meetingUrl: "tribe-event-meeting-url",
  recurrenceFrequency: "tribe-event-recurrence-frequency",
  recurrenceUntil: "tribe-event-recurrence-until",
  startsTime: "tribe-event-starts-time",
  title: "tribe-event-title",
} as const;
const INPUT_TYPE = {
  date: "date",
  time: "time",
  url: "url",
} as const;
const INPUT_MODE_URL = "url";
const BUTTON_ATTRIBUTE = {
  typeButton: "button",
  typeSubmit: "submit",
  variantGhost: "ghost",
} as const;
const RECURRENCE_OPTIONS = [
  TRIBE_EVENT_RECURRENCE_FREQUENCY.none,
  TRIBE_EVENT_RECURRENCE_FREQUENCY.weekly,
  TRIBE_EVENT_RECURRENCE_FREQUENCY.biweekly,
  TRIBE_EVENT_RECURRENCE_FREQUENCY.monthly,
] as const;
const COPY = {
  cancelButton: "Cancelar",
  createDescription: "Completá los datos principales del encuentro digital.",
  createTitle: "Nuevo evento",
  dateLabel: "Fecha",
  descriptionLabel: "Descripción",
  editDescription: "Los cambios se aplican a todas las repeticiones del evento.",
  editTitle: "Editar evento",
  endsDateLabel: "Fecha de fin",
  endsOnAnotherDayLabel: "Termina otro día",
  endsTimeLabel: "Hora de fin",
  invalidEndDate: "La fecha de fin debe ser posterior al inicio.",
  invalidRecurrenceUntil: "La repetición debe terminar después de la fecha de inicio.",
  meetingUrlLabel: "Link de reunión",
  meetingUrlPlaceholder: "https://meet.google.com/…",
  missingEndTime: "Indicá la hora de fin o dejá vacía la fecha de fin.",
  recurrenceFrequencyLabel: "Repetición",
  recurrenceUntilLabel: "Repetir hasta (opcional)",
  saveButton: "Guardar evento",
  savingButton: "Guardando…",
  startsTimeLabel: "Hora de inicio",
  titleLabel: "Título",
} as const;

const TIME_FORMAT = {
  minutesPerHour: 60,
  hoursPerDay: 24,
  padLength: 2,
  padCharacter: "0",
  separator: ":",
} as const;

/**
 * Adds minutes to a wall-clock «HH:mm» value. Returns null when the result
 * would fall on the next day, so the caller leaves the end time to the user
 * instead of suggesting a time that needs an end date to be valid.
 */
function addMinutesToTime(time: string, minutesToAdd: number): string | null {
  const [hoursPart, minutesPart] = time.split(TIME_FORMAT.separator);
  const hours = Number(hoursPart);
  const minutes = Number(minutesPart);

  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return null;
  }

  const totalMinutes = hours * TIME_FORMAT.minutesPerHour + minutes + minutesToAdd;

  if (totalMinutes >= TIME_FORMAT.hoursPerDay * TIME_FORMAT.minutesPerHour) {
    return null;
  }

  const resultHours = Math.floor(totalMinutes / TIME_FORMAT.minutesPerHour);
  const resultMinutes = totalMinutes % TIME_FORMAT.minutesPerHour;

  return (
    String(resultHours).padStart(TIME_FORMAT.padLength, TIME_FORMAT.padCharacter) +
    TIME_FORMAT.separator +
    String(resultMinutes).padStart(TIME_FORMAT.padLength, TIME_FORMAT.padCharacter)
  );
}

function createInitialValues(
  occurrence: TribeEventOccurrenceResult | null
): EventFormValues {
  if (!occurrence) {
    return FORM_DEFAULTS;
  }

  const startDateKey = getBuenosAiresDateKey(occurrence.seriesStartsAt);
  const endDateKey = occurrence.seriesEndsAt
    ? getBuenosAiresDateKey(occurrence.seriesEndsAt)
    : EMPTY_VALUE;

  return {
    date: startDateKey,
    description: occurrence.description ?? EMPTY_VALUE,
    endsDate: endDateKey === startDateKey ? EMPTY_VALUE : endDateKey,
    endsTime: occurrence.seriesEndsAt
      ? formatBuenosAiresTime(occurrence.seriesEndsAt)
      : EMPTY_VALUE,
    meetingUrl: occurrence.meetingUrl ?? EMPTY_VALUE,
    recurrenceFrequency: occurrence.recurrenceFrequency,
    recurrenceUntil: occurrence.recurrenceUntil
      ? getBuenosAiresDateKey(occurrence.recurrenceUntil)
      : EMPTY_VALUE,
    startsTime: formatBuenosAiresTime(occurrence.seriesStartsAt),
    title: occurrence.title,
  };
}

/**
 * Validates the wall-clock inputs and turns them into the endpoint payload.
 * Returns an error message (in Spanish) instead of a payload when the values
 * cannot form a valid schedule.
 */
function buildPayload(
  values: EventFormValues
): { error: string } | { payload: TribeEventFormPayload } {
  const startsAt = buildBuenosAiresInstant(values.date, values.startsTime);

  if (values.endsDate && !values.endsTime) {
    return { error: COPY.missingEndTime };
  }

  const endsAt = values.endsTime
    ? buildBuenosAiresInstant(values.endsDate || values.date, values.endsTime)
    : EMPTY_VALUE;

  if (endsAt && startsAt && Date.parse(endsAt) <= Date.parse(startsAt)) {
    return { error: COPY.invalidEndDate };
  }

  const isRecurring =
    values.recurrenceFrequency !== TRIBE_EVENT_RECURRENCE_FREQUENCY.none;
  const recurrenceUntil =
    isRecurring && values.recurrenceUntil
      ? buildBuenosAiresInstant(
          values.recurrenceUntil,
          RECURRENCE_UNTIL_END_OF_DAY_TIME
        )
      : EMPTY_VALUE;

  if (
    recurrenceUntil &&
    startsAt &&
    Date.parse(recurrenceUntil) < Date.parse(startsAt)
  ) {
    return { error: COPY.invalidRecurrenceUntil };
  }

  return {
    payload: {
      description: values.description,
      endsAt,
      meetingUrl: values.meetingUrl,
      recurrenceFrequency: values.recurrenceFrequency,
      recurrenceUntil,
      startsAt,
      title: values.title,
    },
  };
}

export function TribeEventFormDialog({
  editingOccurrence,
  isOpen,
  isSaving,
  onClose,
  onSubmit,
}: TribeEventFormDialogProps) {
  const [values, setValues] = useState<EventFormValues>(() =>
    createInitialValues(editingOccurrence)
  );
  const [validationError, setValidationError] = useState<string | null>(null);
  const [endsOnAnotherDay, setEndsOnAnotherDay] = useState(
    () => createInitialValues(editingOccurrence).endsDate !== EMPTY_VALUE
  );
  const isEditing = editingOccurrence !== null;
  const isRecurring =
    values.recurrenceFrequency !== TRIBE_EVENT_RECURRENCE_FREQUENCY.none;

  const updateField = (field: keyof EventFormValues, value: string) => {
    setValidationError(null);
    setValues((currentValues) => ({ ...currentValues, [field]: value }));
  };

  // Picking a start suggests an end one default duration later, but only
  // while the end is still empty so an explicit choice is never overwritten.
  const updateStartsTime = (startsTime: string) => {
    setValidationError(null);
    setValues((currentValues) => {
      const suggestedEndsTime =
        currentValues.endsTime === EMPTY_VALUE && startsTime
          ? addMinutesToTime(startsTime, TRIBE_EVENT_DEFAULT_DURATION_MINUTES)
          : null;

      return {
        ...currentValues,
        endsTime: suggestedEndsTime ?? currentValues.endsTime,
        startsTime,
      };
    });
  };

  const toggleEndsOnAnotherDay = (isChecked: boolean) => {
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

    const result = buildPayload(values);

    if ("error" in result) {
      setValidationError(result.error);
      return;
    }

    onSubmit(result.payload);
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent className={styles.TribeEventFormDialog}>
        <DialogHeader>
          <DialogTitle>{isEditing ? COPY.editTitle : COPY.createTitle}</DialogTitle>
          <DialogDescription>
            {isEditing ? COPY.editDescription : COPY.createDescription}
          </DialogDescription>
        </DialogHeader>
        <form className={styles.TribeEventFormDialog__form} onSubmit={handleSubmit}>
          <div className={styles.TribeEventFormDialog__field}>
            <label htmlFor={FIELD_ID.title}>{COPY.titleLabel}</label>
            <Input
              id={FIELD_ID.title}
              maxLength={TRIBE_EVENT_FIELD_LIMIT.titleMaxLength}
              required
              value={values.title}
              onChange={(event) => updateField("title", event.currentTarget.value)}
            />
          </div>
          <div className={styles.TribeEventFormDialog__row}>
            <div className={styles.TribeEventFormDialog__field}>
              <label htmlFor={FIELD_ID.date}>{COPY.dateLabel}</label>
              <Input
                id={FIELD_ID.date}
                required
                type={INPUT_TYPE.date}
                value={values.date}
                onChange={(event) => updateField("date", event.currentTarget.value)}
              />
            </div>
            <div className={styles.TribeEventFormDialog__field}>
              <label htmlFor={FIELD_ID.startsTime}>{COPY.startsTimeLabel}</label>
              <Input
                id={FIELD_ID.startsTime}
                required
                type={INPUT_TYPE.time}
                value={values.startsTime}
                onChange={(event) => updateStartsTime(event.currentTarget.value)}
              />
            </div>
          </div>
          <div className={styles.TribeEventFormDialog__row}>
            <div className={styles.TribeEventFormDialog__field}>
              <label htmlFor={FIELD_ID.endsTime}>{COPY.endsTimeLabel}</label>
              <Input
                id={FIELD_ID.endsTime}
                type={INPUT_TYPE.time}
                value={values.endsTime}
                onChange={(event) => updateField("endsTime", event.currentTarget.value)}
              />
            </div>
            {endsOnAnotherDay ? (
              <div className={styles.TribeEventFormDialog__field}>
                <label htmlFor={FIELD_ID.endsDate}>{COPY.endsDateLabel}</label>
                <Input
                  id={FIELD_ID.endsDate}
                  min={values.date || undefined}
                  type={INPUT_TYPE.date}
                  value={values.endsDate}
                  onChange={(event) => updateField("endsDate", event.currentTarget.value)}
                />
              </div>
            ) : null}
          </div>
          <div className={styles.TribeEventFormDialog__toggle}>
            <Checkbox
              checked={endsOnAnotherDay}
              id={FIELD_ID.endsOnAnotherDay}
              onCheckedChange={(checked) => toggleEndsOnAnotherDay(checked === true)}
            />
            <label htmlFor={FIELD_ID.endsOnAnotherDay}>{COPY.endsOnAnotherDayLabel}</label>
          </div>
          <div className={styles.TribeEventFormDialog__row}>
            <div className={styles.TribeEventFormDialog__field}>
              <label htmlFor={FIELD_ID.recurrenceFrequency}>
                {COPY.recurrenceFrequencyLabel}
              </label>
              <Select
                value={values.recurrenceFrequency}
                onValueChange={(value) => updateField("recurrenceFrequency", value)}
              >
                <SelectTrigger
                  className={styles.TribeEventFormDialog__select}
                  id={FIELD_ID.recurrenceFrequency}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RECURRENCE_OPTIONS.map((frequency) => (
                    <SelectItem key={frequency} value={frequency}>
                      {TRIBE_EVENT_RECURRENCE_LABEL[frequency]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {isRecurring ? (
              <div className={styles.TribeEventFormDialog__field}>
                <label htmlFor={FIELD_ID.recurrenceUntil}>
                  {COPY.recurrenceUntilLabel}
                </label>
                <Input
                  id={FIELD_ID.recurrenceUntil}
                  min={values.date || undefined}
                  type={INPUT_TYPE.date}
                  value={values.recurrenceUntil}
                  onChange={(event) =>
                    updateField("recurrenceUntil", event.currentTarget.value)
                  }
                />
              </div>
            ) : null}
          </div>
          <div className={styles.TribeEventFormDialog__field}>
            <label htmlFor={FIELD_ID.meetingUrl}>{COPY.meetingUrlLabel}</label>
            <Input
              id={FIELD_ID.meetingUrl}
              inputMode={INPUT_MODE_URL}
              placeholder={COPY.meetingUrlPlaceholder}
              type={INPUT_TYPE.url}
              value={values.meetingUrl}
              onChange={(event) => updateField("meetingUrl", event.currentTarget.value)}
            />
          </div>
          <div className={styles.TribeEventFormDialog__field}>
            <label htmlFor={FIELD_ID.description}>{COPY.descriptionLabel}</label>
            <Textarea
              className={styles.TribeEventFormDialog__textarea}
              id={FIELD_ID.description}
              maxLength={TRIBE_EVENT_FIELD_LIMIT.descriptionMaxLength}
              value={values.description}
              onChange={(event) => updateField("description", event.currentTarget.value)}
            />
          </div>
          {validationError ? (
            <p className={styles.TribeEventFormDialog__error} role="alert">
              {validationError}
            </p>
          ) : null}
          <div className={styles.TribeEventFormDialog__actions}>
            <Button
              type={BUTTON_ATTRIBUTE.typeButton}
              variant={BUTTON_ATTRIBUTE.variantGhost}
              onClick={onClose}
            >
              {COPY.cancelButton}
            </Button>
            <Button disabled={isSaving} type={BUTTON_ATTRIBUTE.typeSubmit}>
              {isSaving ? COPY.savingButton : COPY.saveButton}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
