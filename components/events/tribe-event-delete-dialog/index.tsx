"use client";

import { useState } from "react";
import { Button, Dialog, DialogClose, DialogContent } from "beez-ui";

import type { TribeEventOccurrenceResult } from "@/src/modules/events/application/results/tribe-event-result";
import { TRIBE_EVENT_RECURRENCE_FREQUENCY } from "@/src/modules/events/constants/tribe-events";
import styles from "./styles.module.scss";

type TribeEventDeleteDialogProps = {
  isDeleting: boolean;
  occurrence: TribeEventOccurrenceResult | null;
  onCancel: () => void;
  onConfirm: () => void;
};

const BUTTON_ATTRIBUTE = {
  typeButton: "button",
  variantDanger: "danger",
  variantSecondary: "secondary",
} as const;
const COPY = {
  cancelButton: "Cancelar",
  confirmButton: "Eliminar",
  deletingButton: "Eliminando…",
  seriesDescriptionPrefix: "Se van a eliminar todas las repeticiones de «",
  seriesDescriptionSuffix: "» y las respuestas de asistencia.",
  singleDescriptionPrefix: "Se va a eliminar «",
  singleDescriptionSuffix: "» y las respuestas de asistencia. Esta acción no se puede deshacer.",
  title: "¿Eliminar este evento?",
} as const;

function formatDescription(occurrence: TribeEventOccurrenceResult): string {
  const isSeries =
    occurrence.recurrenceFrequency !== TRIBE_EVENT_RECURRENCE_FREQUENCY.none;

  return isSeries
    ? COPY.seriesDescriptionPrefix + occurrence.title + COPY.seriesDescriptionSuffix
    : COPY.singleDescriptionPrefix + occurrence.title + COPY.singleDescriptionSuffix;
}

/**
 * Confirmation step before an irreversible event deletion, in the `alert`
 * mode of `Dialog`. The confirm button is a plain button (not a
 * `DialogClose`) so the dialog stays open and disabled while the request is
 * in flight instead of closing optimistically.
 * The last occurrence is retained while the dialog animates out, so the
 * description does not go blank on its way out.
 */
export function TribeEventDeleteDialog({
  isDeleting,
  occurrence,
  onCancel,
  onConfirm,
}: TribeEventDeleteDialogProps) {
  const [retainedOccurrence, setRetainedOccurrence] = useState(occurrence);

  if (occurrence !== null && occurrence !== retainedOccurrence) {
    setRetainedOccurrence(occurrence);
  }

  const visibleOccurrence = occurrence ?? retainedOccurrence;

  return (
    <Dialog
      alert
      open={occurrence !== null}
      onOpenChange={(open) => {
        if (!open && !isDeleting) {
          onCancel();
        }
      }}
    >
      <DialogContent
        className={styles.TribeEventDeleteDialog}
        title={COPY.title}
        description={visibleOccurrence ? formatDescription(visibleOccurrence) : null}
        footer={
          <>
            <DialogClose asChild>
              <Button
                disabled={isDeleting}
                type={BUTTON_ATTRIBUTE.typeButton}
                variant={BUTTON_ATTRIBUTE.variantSecondary}
              >
                {COPY.cancelButton}
              </Button>
            </DialogClose>
            <Button
              disabled={isDeleting}
              type={BUTTON_ATTRIBUTE.typeButton}
              variant={BUTTON_ATTRIBUTE.variantDanger}
              onClick={onConfirm}
            >
              {isDeleting ? COPY.deletingButton : COPY.confirmButton}
            </Button>
          </>
        }
      />
    </Dialog>
  );
}
