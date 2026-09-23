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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "beez-ui";

import {
  buildBuenosAiresInstant,
  formatBuenosAiresTime,
  getBuenosAiresDateKey,
} from "@/lib/date-time/buenos-aires-format";
import type { TribeEventOccurrenceResult } from "@/src/modules/events/application/results/tribe-event-result";
import type { TribeEventRecurrenceFrequency } from "@/src/modules/events/domain/entities/tribe-event";
import { TRIBE_EVENT_RECURRENCE_LABEL } from "@/src/modules/events/constants/tribe-event-copy";
import {
  TRIBE_EVENT_CAPACITY_LIMIT,
  TRIBE_EVENT_DEFAULT_DURATION_MINUTES,
  TRIBE_EVENT_FIELD_LIMIT,
  TRIBE_EVENT_RECURRENCE_FREQUENCY,
} from "@/src/modules/events/constants/tribe-events";
import styles from "./styles.module.scss";

/**
 * Form values sent to the create/update event endpoints, as typed text.
 * Optional fields travel as empty strings; the route input schema validates
 * and normalizes them once, at the server boundary.
 */
export type TribeEventFormPayload = {
  capacity: string;
  description: string;
  endsAt: string;
  meetingUrl: string;
  recurrenceFrequency: string;
  recurrenceUntil: string;
  startsAt: string;
  title: string;
};

/**
 * Values that prefill the create form (for example from a template). Ignored
 * in edit mode, where the occurrence being edited is the source of truth.
 */
export type TribeEventFormInitialValues = {
  /** Duration used to suggest the end time once a start is picked. */
  durationMinutes?: number;
  recurrenceFrequency?: TribeEventRecurrenceFrequency;
  title?: string;
};

type TribeEventFormDialogProps = {
  editingOccurrence: TribeEventOccurrenceResult | null;
  initialValues?: TribeEventFormInitialValues;
  isOpen: boolean;
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (payload: TribeEventFormPayload) => void;
};

type EventFormValues = {
  capacity: string;
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
  capacity: EMPTY_VALUE,
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
  capacity: "tribe-event-capacity",
  capacityHint: "tribe-event-capacity-hint",
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
const INPUT_MODE = {
  numeric: "numeric",
  url: "url",
} as const;
/**
 * Whole positive number as typed in "Cupo máximo"; the server validates it
 * again with the same limits.
 */
const CAPACITY_PATTERN = /^\d+$/;
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
  capacityEditHint: "Bajar el cupo no quita a nadie que ya confirmó.",
  capacityHint: "Si se completa, las nuevas respuestas quedan en lista de espera.",
  capacityLabel: "Cupo máximo (opcional)",
  capacityPlaceholder: "Sin límite",
  createDescription: "Completá los datos principales del encuentro digital.",
  createTitle: "Nuevo evento",
  dateLabel: "Fecha",
  descriptionLabel: "Descripción",
  editDescription: "Los cambios se aplican a todas las repeticiones del evento.",
  editTitle: "Editar evento",
  endsDateLabel: "Fecha de fin",
  endsOnAnotherDayLabel: "Termina otro día",
  endsTimeLabel: "Hora de fin",
  invalidCapacity: "Ingresá un cupo entre 1 y 10000, o dejalo vacío para no limitarlo.",
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
  occurrence: TribeEventOccurrenceResult | null,
  initialValues: TribeEventFormInitialValues | undefined
): EventFormValues {
  if (!occurrence) {
    return {
      ...FORM_DEFAULTS,
      recurrenceFrequency:
        initialValues?.recurrenceFrequency ?? FORM_DEFAULTS.recurrenceFrequency,
      title: initialValues?.title ?? FORM_DEFAULTS.title,
    };
  }

  const startDateKey = getBuenosAiresDateKey(occurrence.seriesStartsAt);
  const endDateKey = occurrence.seriesEndsAt
    ? getBuenosAiresDateKey(occurrence.seriesEndsAt)
    : EMPTY_VALUE;

  return {
    capacity: occurrence.capacity === null ? EMPTY_VALUE : String(occurrence.capacity),
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
function isValidCapacity(capacity: string): boolean {
  const capacityValue = capacity.trim();

  if (capacityValue === EMPTY_VALUE) {
    return true;
  }

  const capacityNumber = Number(capacityValue);

  return (
    CAPACITY_PATTERN.test(capacityValue) &&
    capacityNumber >= TRIBE_EVENT_CAPACITY_LIMIT.min &&
    capacityNumber <= TRIBE_EVENT_CAPACITY_LIMIT.max
  );
}

function buildPayload(
  values: EventFormValues
): { error: string } | { payload: TribeEventFormPayload } {
  if (!isValidCapacity(values.capacity)) {
    return { error: COPY.invalidCapacity };
  }

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
      capacity: values.capacity.trim(),
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
  initialValues,
  isOpen,
  isSaving,
  onClose,
  onSubmit,
}: TribeEventFormDialogProps) {
  const [values, setValues] = useState<EventFormValues>(() =>
    createInitialValues(editingOccurrence, initialValues)
  );
  const [validationError, setValidationError] = useState<string | null>(null);
  const [endsOnAnotherDay, setEndsOnAnotherDay] = useState(
    () => createInitialValues(editingOccurrence, initialValues).endsDate !== EMPTY_VALUE
  );
  const isEditing = editingOccurrence !== null;
  const suggestedDurationMinutes =
    (isEditing ? undefined : initialValues?.durationMinutes) ??
    TRIBE_EVENT_DEFAULT_DURATION_MINUTES;
  const isRecurring =
    values.recurrenceFrequency !== TRIBE_EVENT_RECURRENCE_FREQUENCY.none;

  const updateField = (field: keyof EventFormValues, value: string) => {
    setValidationError(null);
    setValues((currentValues) => ({ ...currentValues, [field]: value }));
  };

  // Picking a start suggests an end one duration later (the template's or the
  // default), but only
  // while the end is still empty so an explicit choice is never overwritten.
  const updateStartsTime = (startsTime: string) => {
    setValidationError(null);
    setValues((currentValues) => {
      const suggestedEndsTime =
        currentValues.endsTime === EMPTY_VALUE && startsTime
          ? addMinutesToTime(startsTime, suggestedDurationMinutes)
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
            <label htmlFor={FIELD_ID.capacity}>{COPY.capacityLabel}</label>
            <Input
              aria-describedby={FIELD_ID.capacityHint}
              className={styles.TribeEventFormDialog__capacity}
              id={FIELD_ID.capacity}
              // Plain text with a numeric keyboard: native number validation
              // would block the submit with a browser-language bubble instead
              // of the Spanish inline message.
              inputMode={INPUT_MODE.numeric}
              placeholder={COPY.capacityPlaceholder}
              value={values.capacity}
              onChange={(event) => updateField("capacity", event.currentTarget.value)}
            />
            <p className={styles.TribeEventFormDialog__hint} id={FIELD_ID.capacityHint}>
              {isEditing ? COPY.capacityHint + " " + COPY.capacityEditHint : COPY.capacityHint}
            </p>
          </div>
          <div className={styles.TribeEventFormDialog__field}>
            <label htmlFor={FIELD_ID.meetingUrl}>{COPY.meetingUrlLabel}</label>
            <Input
              id={FIELD_ID.meetingUrl}
              inputMode={INPUT_MODE.url}
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
