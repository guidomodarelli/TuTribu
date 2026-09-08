"use client";

import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, Button } from "beez-ui";

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
  variantDestructive: "destructive",
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
 * Confirmation step before an irreversible event deletion. The confirm button
 * is a plain button (not `AlertDialogAction`) so the dialog stays open and
 * disabled while the request is in flight instead of closing optimistically.
 */
export function TribeEventDeleteDialog({
  isDeleting,
  occurrence,
  onCancel,
  onConfirm,
}: TribeEventDeleteDialogProps) {
  return (
    <AlertDialog
      open={occurrence !== null}
      onOpenChange={(open) => {
        if (!open && !isDeleting) {
          onCancel();
        }
      }}
    >
      <AlertDialogContent className={styles.TribeEventDeleteDialog}>
        <AlertDialogHeader>
          <AlertDialogTitle>{COPY.title}</AlertDialogTitle>
          <AlertDialogDescription>
            {occurrence ? formatDescription(occurrence) : null}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>{COPY.cancelButton}</AlertDialogCancel>
          <Button
            disabled={isDeleting}
            type={BUTTON_ATTRIBUTE.typeButton}
            variant={BUTTON_ATTRIBUTE.variantDestructive}
            onClick={onConfirm}
          >
            {isDeleting ? COPY.deletingButton : COPY.confirmButton}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
