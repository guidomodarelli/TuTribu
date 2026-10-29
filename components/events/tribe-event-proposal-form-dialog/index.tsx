"use client";

import { type SubmitEvent, useState } from "react";

import { Button, Dialog, DialogContent, Input, Select, type SelectOption, Textarea, cn } from "@golfo/ui";

import { TribeEventStartsTimeInput } from "@/components/events/tribe-event-starts-time-input";
import { buildBuenosAiresInstant } from "@/lib/date-time/buenos-aires-format";
import type { TribeEventProposalSubmission } from "@/lib/events/tribe-event-form-submissions";
import type { TribeEventType } from "@/src/modules/events/application/results/tribe-event-result";
import { TRIBE_EVENT_TYPE_LABEL } from "@/src/modules/events/constants/tribe-event-copy";
import {
  TRIBE_EVENT_DEFAULT_TYPE,
  TRIBE_EVENT_FIELD_LIMIT,
  TRIBE_EVENT_PROPOSAL_DURATION,
  TRIBE_EVENT_TYPES,
} from "@/src/modules/events/constants/tribe-events";
import styles from "./styles.module.scss";

type TribeEventProposalFormDialogProps = {
  isOpen: boolean;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (submission: TribeEventProposalSubmission) => void;
};

type ProposalFormValues = {
  date: string;
  description: string;
  durationMinutes: string;
  eventType: TribeEventType;
  startsTime: string;
  title: string;
};

const EMPTY_VALUE = "";
const FORM_DEFAULTS: ProposalFormValues = {
  date: EMPTY_VALUE,
  description: EMPTY_VALUE,
  durationMinutes: String(TRIBE_EVENT_PROPOSAL_DURATION.defaultMinutes),
  eventType: TRIBE_EVENT_DEFAULT_TYPE,
  startsTime: EMPTY_VALUE,
  title: EMPTY_VALUE,
};
const FIELD_ID = {
  date: "tribe-event-proposal-date",
  description: "tribe-event-proposal-description",
  durationMinutes: "tribe-event-proposal-duration",
  eventType: "tribe-event-proposal-type",
  startsTime: "tribe-event-proposal-starts-time",
  title: "tribe-event-proposal-title",
} as const;

/** Required controls that a validation message can point at. */
type ProposalRequiredFieldId =
  | typeof FIELD_ID.date
  | typeof FIELD_ID.startsTime
  | typeof FIELD_ID.title;
const INPUT_TYPE = {
  date: "date",
} as const;
const BUTTON_ATTRIBUTE = {
  typeButton: "button",
  typeSubmit: "submit",
  variantGhost: "ghost",
} as const;
const COPY = {
  cancelButton: "Cancelar",
  dateLabel: "Fecha",
  description:
    "Quienes gestionan los eventos de la tribu revisan la propuesta antes de publicarla.",
  descriptionLabel: "Descripción (opcional)",
  durationLabel: "Duración",
  durationOption: (minutes: number) => `${minutes} min`,
  eventTypeLabel: "Tipo",
  missingFields: "Completá el título, la fecha y la hora de inicio.",
  submitButton: "Enviar propuesta",
  submittingButton: "Enviando…",
  title: "Proponer un encuentro",
  titleLabel: "Título",
} as const;

/**
 * First required control still missing, in reading order, or null when the
 * title, date and start time are all present.
 */
function findFirstMissingField(values: ProposalFormValues): ProposalRequiredFieldId | null {
  if (!values.title.trim()) {
    return FIELD_ID.title;
  }

  if (!values.date) {
    return FIELD_ID.date;
  }

  return values.startsTime ? null : FIELD_ID.startsTime;
}

const DURATION_OPTIONS: SelectOption[] = TRIBE_EVENT_PROPOSAL_DURATION.options.map((minutes) => ({
  label: COPY.durationOption(minutes),
  value: String(minutes),
}));
const EVENT_TYPE_OPTIONS: SelectOption[] = TRIBE_EVENT_TYPES.map((eventType) => ({
  label: TRIBE_EVENT_TYPE_LABEL[eventType],
  value: eventType,
}));

function isTribeEventType(value: string): value is TribeEventType {
  return TRIBE_EVENT_TYPES.some((eventType) => eventType === value);
}

type UpdateProposalField = <TField extends keyof ProposalFormValues>(
  field: TField,
  value: ProposalFormValues[TField]
) => void;

type ProposalFormFieldsProps = {
  /** Missing-fields message of a required control, if it is the one to fix. */
  getFieldError: (fieldId: ProposalRequiredFieldId) => string | undefined;
  updateField: UpdateProposalField;
  values: ProposalFormValues;
};

/** Title, date and time, duration, type and description controls of the proposal. */
function ProposalFormFields({ getFieldError, updateField, values }: ProposalFormFieldsProps) {
  return (
    <>
      <Input
        error={getFieldError(FIELD_ID.title)}
        id={FIELD_ID.title}
        label={COPY.titleLabel}
        maxLength={TRIBE_EVENT_FIELD_LIMIT.titleMaxLength}
        required
        value={values.title}
        onChange={(event) => updateField("title", event.currentTarget.value)}
      />
      <div className={styles.TribeEventProposalFormDialog__row}>
        <Input
          error={getFieldError(FIELD_ID.date)}
          id={FIELD_ID.date}
          label={COPY.dateLabel}
          required
          type={INPUT_TYPE.date}
          value={values.date}
          onChange={(event) => updateField("date", event.currentTarget.value)}
        />
        <TribeEventStartsTimeInput
          error={getFieldError(FIELD_ID.startsTime)}
          id={FIELD_ID.startsTime}
          value={values.startsTime}
          onValueChange={(value) => updateField("startsTime", value)}
        />
      </div>
      <div
        className={cn(
          styles.TribeEventProposalFormDialog__row,
          styles["TribeEventProposalFormDialog__row--selects"]
        )}
      >
        <Select
          className={styles.TribeEventProposalFormDialog__field}
          id={FIELD_ID.durationMinutes}
          label={COPY.durationLabel}
          options={DURATION_OPTIONS}
          value={values.durationMinutes}
          onValueChange={(value) => updateField("durationMinutes", value)}
        />
        <Select
          className={styles.TribeEventProposalFormDialog__field}
          id={FIELD_ID.eventType}
          label={COPY.eventTypeLabel}
          options={EVENT_TYPE_OPTIONS}
          value={values.eventType}
          onValueChange={(value) => {
            if (isTribeEventType(value)) {
              updateField("eventType", value);
            }
          }}
        />
      </div>
      <Textarea
        id={FIELD_ID.description}
        label={COPY.descriptionLabel}
        maxLength={TRIBE_EVENT_FIELD_LIMIT.descriptionMaxLength}
        value={values.description}
        onChange={(event) => updateField("description", event.currentTarget.value)}
      />
    </>
  );
}

/** Cancel and submit buttons of the proposal form. */
function ProposalFormActions({ isSubmitting, onClose }: Pick<TribeEventProposalFormDialogProps, "isSubmitting" | "onClose">) {
  return (
    <div className={styles.TribeEventProposalFormDialog__actions}>
      <Button
        type={BUTTON_ATTRIBUTE.typeButton}
        variant={BUTTON_ATTRIBUTE.variantGhost}
        onClick={onClose}
      >
        {COPY.cancelButton}
      </Button>
      <Button disabled={isSubmitting} type={BUTTON_ATTRIBUTE.typeSubmit}>
        {isSubmitting ? COPY.submittingButton : COPY.submitButton}
      </Button>
    </div>
  );
}

/**
 * Reduced form a member uses to propose a meeting: title, date and time,
 * duration, type, and description. Managers complete the rest (link,
 * repetition, capacity) when they approve it. A missing required field is
 * reported under that field, marked invalid and focused.
 */
export function TribeEventProposalFormDialog({
  isOpen,
  isSubmitting,
  onClose,
  onSubmit,
}: TribeEventProposalFormDialogProps) {
  const [values, setValues] = useState<ProposalFormValues>(FORM_DEFAULTS);
  // Control the "missing fields" message points at; null while valid.
  const [invalidFieldId, setInvalidFieldId] = useState<ProposalRequiredFieldId | null>(null);

  /** Missing-fields message, shown under the required control to fix. */
  const getFieldError = (fieldId: ProposalRequiredFieldId) =>
    invalidFieldId === fieldId ? COPY.missingFields : undefined;

  const updateField = <TField extends keyof ProposalFormValues>(
    field: TField,
    value: ProposalFormValues[TField]
  ) => {
    setInvalidFieldId(null);
    setValues((currentValues) => ({ ...currentValues, [field]: value }));
  };

  const handleSubmit = (submitEvent: SubmitEvent<HTMLFormElement>) => {
    submitEvent.preventDefault();

    if (isSubmitting) {
      return;
    }

    const startsAt = buildBuenosAiresInstant(values.date, values.startsTime);
    const missingFieldId = findFirstMissingField(values);

    if (missingFieldId || !startsAt) {
      const fieldToFix = missingFieldId ?? FIELD_ID.startsTime;
      const control = submitEvent.currentTarget.elements.namedItem(fieldToFix);

      setInvalidFieldId(fieldToFix);

      if (control instanceof HTMLElement) {
        control.focus();
      }

      return;
    }

    onSubmit({
      description: values.description,
      durationMinutes: Number(values.durationMinutes),
      eventType: values.eventType,
      startsAt,
      title: values.title,
    });
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
      <DialogContent
        className={styles.TribeEventProposalFormDialog}
        title={COPY.title}
        description={COPY.description}
      >
        {/* Native validation is off so a missing field reaches the Spanish
            inline message instead of a browser-language bubble; `required`
            still tells assistive technology which fields are mandatory. */}
        <form
          className={styles.TribeEventProposalFormDialog__form}
          noValidate
          onSubmit={handleSubmit}
        >
          <ProposalFormFields
            getFieldError={getFieldError}
            updateField={updateField}
            values={values}
          />
          <ProposalFormActions isSubmitting={isSubmitting} onClose={onClose} />
        </form>
      </DialogContent>
    </Dialog>
  );
}
