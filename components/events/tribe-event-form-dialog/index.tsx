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
import { MILLISECONDS_PER_SECOND, SECONDS_PER_MINUTE } from "@/src/constants/time";
import type { CreateTribeEventCommand } from "@/src/modules/events/application/commands/tribe-event-command";
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
 * Body sent to the create/update event endpoints. Optional fields travel as
 * empty strings so the application layer normalizes them in one place.
 */
export type TribeEventFormPayload = Omit<CreateTribeEventCommand, "tribeSlug" | "visibleMonth">;

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

const MILLISECONDS_PER_DAY =
  TIME_FORMAT.hoursPerDay *
  TIME_FORMAT.minutesPerHour *
  SECONDS_PER_MINUTE *
  MILLISECONDS_PER_SECOND;
const START_OF_DAY_TIME = "00:00";
const SAME_DAY_OFFSET = 0;

/**
 * Wall-clock end suggested for a start: the «HH:mm» time and how many days
 * after the start date it falls on (0 when it ends the same day).
 */
type SuggestedEndSchedule = {
  dayOffset: number;
  endsTime: string;
};

/**
 * Adds minutes to a wall-clock «HH:mm» value and reports the day rollover, so
 * a duration that crosses midnight keeps its length through the end date.
 * Returns null when the start is not a valid time.
 */
function suggestEndSchedule(
  time: string,
  minutesToAdd: number
): SuggestedEndSchedule | null {
  const [hoursPart, minutesPart] = time.split(TIME_FORMAT.separator);
  const hours = Number(hoursPart);
  const minutes = Number(minutesPart);

  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return null;
  }

  const minutesPerDay = TIME_FORMAT.hoursPerDay * TIME_FORMAT.minutesPerHour;
  const totalMinutes = hours * TIME_FORMAT.minutesPerHour + minutes + minutesToAdd;
  const minutesIntoEndDay = totalMinutes % minutesPerDay;
  const resultHours = Math.floor(minutesIntoEndDay / TIME_FORMAT.minutesPerHour);
  const resultMinutes = minutesIntoEndDay % TIME_FORMAT.minutesPerHour;

  return {
    dayOffset: Math.floor(totalMinutes / minutesPerDay),
    endsTime:
      String(resultHours).padStart(TIME_FORMAT.padLength, TIME_FORMAT.padCharacter) +
      TIME_FORMAT.separator +
      String(resultMinutes).padStart(TIME_FORMAT.padLength, TIME_FORMAT.padCharacter),
  };
}

/**
 * Moves a Buenos Aires `YYYY-MM-DD` date key a number of days forward. Returns
 * an empty value while the start date is still unknown.
 */
function addDaysToBuenosAiresDateKey(dateKey: string, days: number): string {
  const startOfDay = buildBuenosAiresInstant(dateKey, START_OF_DAY_TIME);

  if (!startOfDay) {
    return EMPTY_VALUE;
  }

  return getBuenosAiresDateKey(
    new Date(Date.parse(startOfDay) + days * MILLISECONDS_PER_DAY)
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
  const [initialFormValues] = useState<EventFormValues>(() =>
    createInitialValues(editingOccurrence, initialValues)
  );
  const [values, setValues] = useState<EventFormValues>(initialFormValues);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [endsOnAnotherDay, setEndsOnAnotherDay] = useState(
    initialFormValues.endsDate !== EMPTY_VALUE
  );
  // Whether the end still holds a generated suggestion (or nothing). While it
  // does, every start change recomputes it; the first explicit edit of an end
  // field hands the end over to the manager. A saved end (edit mode) is never
  // a suggestion, so it is never overwritten.
  const [isEndSuggested, setIsEndSuggested] = useState(
    initialFormValues.endsTime === EMPTY_VALUE
  );
  // Days between the start date and a suggested end that crossed midnight.
  // It keeps the end date in sync while the date changes, until the manager
  // edits the end explicitly.
  const [suggestedEndDayOffset, setSuggestedEndDayOffset] = useState(SAME_DAY_OFFSET);
  const isEditing = editingOccurrence !== null;
  const templateDurationMinutes = isEditing ? undefined : initialValues?.durationMinutes;
  const suggestedDurationMinutes =
    templateDurationMinutes ?? TRIBE_EVENT_DEFAULT_DURATION_MINUTES;
  const isRecurring =
    values.recurrenceFrequency !== TRIBE_EVENT_RECURRENCE_FREQUENCY.none;

  const updateField = (field: keyof EventFormValues, value: string) => {
    setValidationError(null);
    setValues((currentValues) => ({ ...currentValues, [field]: value }));
  };

  // An explicit end choice stops the end from following the start and date.
  const updateEndField = (field: "endsDate" | "endsTime", value: string) => {
    setIsEndSuggested(false);
    setSuggestedEndDayOffset(SAME_DAY_OFFSET);
    updateField(field, value);
  };

  const updateDate = (date: string) => {
    setValidationError(null);
    setValues((currentValues) => ({
      ...currentValues,
      date,
      endsDate:
        suggestedEndDayOffset === SAME_DAY_OFFSET
          ? currentValues.endsDate
          : addDaysToBuenosAiresDateKey(date, suggestedEndDayOffset),
    }));
  };

  // While the end is still a suggestion, every start change recomputes it one
  // duration later (the template's or the default). A template duration that
  // crosses midnight also fills the next-day end date so the saved event keeps
  // the advertised length; the default duration is left empty in that case
  // because an empty end already means a default-length occurrence. A
  // previously suggested next-day end date is withdrawn when the new
  // suggestion no longer crosses midnight.
  const updateStartsTime = (startsTime: string) => {
    setValidationError(null);

    if (!isEndSuggested) {
      setValues((currentValues) => ({ ...currentValues, startsTime }));
      return;
    }

    const suggestedEnd = startsTime
      ? suggestEndSchedule(startsTime, suggestedDurationMinutes)
      : null;
    const endsOnLaterDay =
      suggestedEnd !== null && suggestedEnd.dayOffset > SAME_DAY_OFFSET;
    const leavesEndEmpty =
      suggestedEnd === null || (endsOnLaterDay && templateDurationMinutes === undefined);
    const nextEnd =
      leavesEndEmpty || suggestedEnd === null
        ? { dayOffset: SAME_DAY_OFFSET, endsTime: EMPTY_VALUE }
        : suggestedEnd;
    const nextDayOffset = nextEnd.dayOffset;
    const hadSuggestedEndDate = suggestedEndDayOffset > SAME_DAY_OFFSET;

    setSuggestedEndDayOffset(nextDayOffset);

    if (nextDayOffset > SAME_DAY_OFFSET) {
      setEndsOnAnotherDay(true);
    } else if (hadSuggestedEndDate) {
      setEndsOnAnotherDay(false);
    }

    setValues((currentValues) => ({
      ...currentValues,
      endsDate:
        nextDayOffset > SAME_DAY_OFFSET
          ? addDaysToBuenosAiresDateKey(currentValues.date, nextDayOffset)
          : hadSuggestedEndDate
            ? EMPTY_VALUE
            : currentValues.endsDate,
      endsTime: nextEnd.endsTime,
      startsTime,
    }));
  };

  const toggleEndsOnAnotherDay = (isChecked: boolean) => {
    setIsEndSuggested(false);
    setEndsOnAnotherDay(isChecked);
    setSuggestedEndDayOffset(SAME_DAY_OFFSET);

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
                onChange={(event) => updateDate(event.currentTarget.value)}
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
                onChange={(event) => updateEndField("endsTime", event.currentTarget.value)}
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
                  onChange={(event) => updateEndField("endsDate", event.currentTarget.value)}
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
