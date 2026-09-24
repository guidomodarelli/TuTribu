"use client";

import { type FormEvent, useState } from "react";

import {
  Button,
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
  cn,
} from "beez-ui";

import { buildBuenosAiresInstant } from "@/lib/date-time/buenos-aires-format";
import type { TribeEventProposalPayload } from "@/lib/events/tribe-event-proposals-api-client";
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
  onSubmit: (payload: TribeEventProposalPayload) => void;
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
const INPUT_TYPE = {
  date: "date",
  time: "time",
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
  startsTimeLabel: "Hora de inicio",
  submitButton: "Enviar propuesta",
  submittingButton: "Enviando…",
  title: "Proponer un encuentro",
  titleLabel: "Título",
} as const;

function isTribeEventType(value: string): value is TribeEventType {
  return TRIBE_EVENT_TYPES.some((eventType) => eventType === value);
}

/**
 * Reduced form a member uses to propose a meeting: title, date and time,
 * duration, type, and description. Managers complete the rest (link,
 * repetition, capacity) when they approve it.
 */
export function TribeEventProposalFormDialog({
  isOpen,
  isSubmitting,
  onClose,
  onSubmit,
}: TribeEventProposalFormDialogProps) {
  const [values, setValues] = useState<ProposalFormValues>(FORM_DEFAULTS);
  const [validationError, setValidationError] = useState<string | null>(null);

  const updateField = <TField extends keyof ProposalFormValues>(
    field: TField,
    value: ProposalFormValues[TField]
  ) => {
    setValidationError(null);
    setValues((currentValues) => ({ ...currentValues, [field]: value }));
  };

  const handleSubmit = (submitEvent: FormEvent<HTMLFormElement>) => {
    submitEvent.preventDefault();

    if (isSubmitting) {
      return;
    }

    const startsAt = buildBuenosAiresInstant(values.date, values.startsTime);

    if (!values.title.trim() || !startsAt) {
      setValidationError(COPY.missingFields);
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
      <DialogContent className={styles.TribeEventProposalFormDialog}>
        <DialogHeader>
          <DialogTitle>{COPY.title}</DialogTitle>
          <DialogDescription>{COPY.description}</DialogDescription>
        </DialogHeader>
        <form className={styles.TribeEventProposalFormDialog__form} onSubmit={handleSubmit}>
          <div className={styles.TribeEventProposalFormDialog__field}>
            <label htmlFor={FIELD_ID.title}>{COPY.titleLabel}</label>
            <Input
              id={FIELD_ID.title}
              maxLength={TRIBE_EVENT_FIELD_LIMIT.titleMaxLength}
              required
              value={values.title}
              onChange={(event) => updateField("title", event.currentTarget.value)}
            />
          </div>
          <div className={styles.TribeEventProposalFormDialog__row}>
            <div className={styles.TribeEventProposalFormDialog__field}>
              <label htmlFor={FIELD_ID.date}>{COPY.dateLabel}</label>
              <Input
                id={FIELD_ID.date}
                required
                type={INPUT_TYPE.date}
                value={values.date}
                onChange={(event) => updateField("date", event.currentTarget.value)}
              />
            </div>
            <div className={styles.TribeEventProposalFormDialog__field}>
              <label htmlFor={FIELD_ID.startsTime}>{COPY.startsTimeLabel}</label>
              <Input
                id={FIELD_ID.startsTime}
                required
                type={INPUT_TYPE.time}
                value={values.startsTime}
                onChange={(event) => updateField("startsTime", event.currentTarget.value)}
              />
            </div>
          </div>
          <div
            className={cn(
              styles.TribeEventProposalFormDialog__row,
              styles["TribeEventProposalFormDialog__row--selects"]
            )}
          >
            <div className={styles.TribeEventProposalFormDialog__field}>
              <label htmlFor={FIELD_ID.durationMinutes}>{COPY.durationLabel}</label>
              <Select
                value={values.durationMinutes}
                onValueChange={(value) => updateField("durationMinutes", value)}
              >
                <SelectTrigger
                  className={styles.TribeEventProposalFormDialog__select}
                  id={FIELD_ID.durationMinutes}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRIBE_EVENT_PROPOSAL_DURATION.options.map((minutes) => (
                    <SelectItem key={minutes} value={String(minutes)}>
                      {COPY.durationOption(minutes)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className={styles.TribeEventProposalFormDialog__field}>
              <label htmlFor={FIELD_ID.eventType}>{COPY.eventTypeLabel}</label>
              <Select
                value={values.eventType}
                onValueChange={(value) => {
                  if (isTribeEventType(value)) {
                    updateField("eventType", value);
                  }
                }}
              >
                <SelectTrigger
                  className={styles.TribeEventProposalFormDialog__select}
                  id={FIELD_ID.eventType}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRIBE_EVENT_TYPES.map((eventType) => (
                    <SelectItem key={eventType} value={eventType}>
                      {TRIBE_EVENT_TYPE_LABEL[eventType]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className={styles.TribeEventProposalFormDialog__field}>
            <label htmlFor={FIELD_ID.description}>{COPY.descriptionLabel}</label>
            <Textarea
              className={styles.TribeEventProposalFormDialog__textarea}
              id={FIELD_ID.description}
              maxLength={TRIBE_EVENT_FIELD_LIMIT.descriptionMaxLength}
              value={values.description}
              onChange={(event) => updateField("description", event.currentTarget.value)}
            />
          </div>
          {validationError ? (
            <p className={styles.TribeEventProposalFormDialog__error} role="alert">
              {validationError}
            </p>
          ) : null}
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
        </form>
      </DialogContent>
    </Dialog>
  );
}
