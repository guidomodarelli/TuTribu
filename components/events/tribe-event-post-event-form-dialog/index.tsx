"use client";

import { type FormEvent, useState } from "react";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { AnimatePresence } from "motion/react";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
} from "beez-ui";

import { AnimatedCollapse } from "@/components/motion/animated-collapse";
import { AnimatedListItem } from "@/components/motion/animated-list-item";
import type { TribeEventPostEventView } from "@/src/modules/events/application/results/tribe-event-post-event-public-dto-schemas";
import { TRIBE_EVENT_POST_EVENT_LIMIT } from "@/src/modules/events/constants/tribe-event-post-event";
import styles from "./styles.module.scss";

/**
 * Values the dialog submits: the recording link (null removes it) and the
 * full list of materials.
 */
export type TribeEventPostEventFormPayload = {
  materials: { title: string; url: string }[];
  recordingUrl: string | null;
};

type MaterialRow = {
  id: number;
  title: string;
  url: string;
};

type TribeEventPostEventFormDialogProps = {
  /** Current resources, used to prefill the form. */
  initialPostEvent: TribeEventPostEventView | null;
  isOpen: boolean;
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (payload: TribeEventPostEventFormPayload) => void;
};

const EMPTY_VALUE = "";
const WEB_URL_PROTOCOLS: readonly string[] = ["http:", "https:"];
const FIELD_ID = {
  addMaterial: "tribe-event-add-material",
  materialTitle: (rowId: number) => `tribe-event-material-title-${rowId}`,
  materialUrl: (rowId: number) => `tribe-event-material-url-${rowId}`,
  recordingUrl: "tribe-event-recording-url",
  validationError: "tribe-event-post-event-validation-error",
} as const;
const MATERIAL_ROW_ELEMENT = "div";

/**
 * Validation failure of the form: the Spanish message and the id of the
 * control to fix (the recording link or a material field), which is marked
 * invalid and focused.
 */
type PostEventValidationIssue = {
  fieldId: string;
  message: string;
};
const INPUT_TYPE = {
  url: "url",
} as const;
const BUTTON_ATTRIBUTE = {
  sizeSmall: "sm",
  typeButton: "button",
  typeSubmit: "submit",
  variantGhost: "ghost",
  variantOutline: "outline",
} as const;
const COPY = {
  addMaterial: "Agregar material",
  cancelButton: "Cancelar",
  description:
    "Pegá el link de la grabación (YouTube, Vimeo, Wistia o Loom) y los links de slides, documentos o repositorios. Quienes respondieron Voy o Tal vez reciben un aviso cuando publicás la primera grabación.",
  invalidMaterial: "Cada material necesita un nombre y un link que empiece con http o https.",
  invalidRecording: "El link de la grabación tiene que empezar con http o https.",
  materialTitleLabel: (position: number) => `Nombre del material ${position}`,
  materialUrlLabel: (position: number) => `Link del material ${position}`,
  materialsLegend: "Materiales",
  materialTitlePlaceholder: "Slides de la clase",
  maxMaterials: `Podés agregar hasta ${TRIBE_EVENT_POST_EVENT_LIMIT.materialsMax} materiales.`,
  recordingLabel: "Link de la grabación (opcional)",
  recordingPlaceholder: "https://www.youtube.com/watch?v=…",
  removeMaterial: (position: number) => `Quitar material ${position}`,
  submitButton: "Guardar",
  submittingButton: "Guardando…",
  title: "Grabación y materiales",
} as const;

function isWebUrl(value: string): boolean {
  try {
    return WEB_URL_PROTOCOLS.includes(new URL(value).protocol);
  } catch {
    // Unparseable text is not a link; the form shows the inline error.
    return false;
  }
}

/**
 * First control of a half-filled material row that needs fixing: its name
 * when missing, otherwise its link. Fully empty rows are ignored.
 */
function findInvalidMaterialFieldId(rows: MaterialRow[]): string | null {
  for (const row of rows) {
    const title = row.title.trim();
    const url = row.url.trim();

    if (!title && !url) {
      continue;
    }

    if (!title) {
      return FIELD_ID.materialTitle(row.id);
    }

    if (!isWebUrl(url)) {
      return FIELD_ID.materialUrl(row.id);
    }
  }

  return null;
}

/** Moves focus to the control with `fieldId` once it is in the document. */
function focusFieldById(fieldId: string): void {
  // The target may be a row mounted in this same update, so focus waits for
  // the next frame, when React has committed it.
  requestAnimationFrame(() => {
    const control = document.getElementById(fieldId);

    if (control instanceof HTMLElement) {
      control.focus();
    }
  });
}

function toMaterialRows(postEvent: TribeEventPostEventView | null): MaterialRow[] {
  return (postEvent?.materials ?? []).map((material, index) => ({
    id: index,
    title: material.title,
    url: material.url,
  }));
}

/**
 * "Agregar grabación y materiales": recording link plus an editable list of
 * material links, validated inline before submitting (the field to fix is
 * marked invalid and focused). Rows animate in and out as they are added
 * and removed, and a new row takes the focus. The provider check of
 * the recording (YouTube, Vimeo, Wistia, Loom) is authoritative on the server.
 */
export function TribeEventPostEventFormDialog({
  initialPostEvent,
  isOpen,
  isSaving,
  onClose,
  onSubmit,
}: TribeEventPostEventFormDialogProps) {
  const [recordingUrl, setRecordingUrl] = useState(
    initialPostEvent?.recording?.sourceUrl ?? EMPTY_VALUE
  );
  const [materialRows, setMaterialRows] = useState<MaterialRow[]>(() =>
    toMaterialRows(initialPostEvent)
  );
  const [nextRowId, setNextRowId] = useState(materialRows.length);
  const [validationIssue, setValidationIssue] = useState<PostEventValidationIssue | null>(null);
  // Last message shown, kept while the error region collapses.
  const [shownValidationMessage, setShownValidationMessage] = useState<string | null>(null);

  if (validationIssue && validationIssue.message !== shownValidationMessage) {
    setShownValidationMessage(validationIssue.message);
  }
  const canAddMaterial = materialRows.length < TRIBE_EVENT_POST_EVENT_LIMIT.materialsMax;

  const updateMaterial = (rowId: number, field: "title" | "url", value: string) => {
    setValidationIssue(null);
    setMaterialRows((currentRows) =>
      currentRows.map((row) => (row.id === rowId ? { ...row, [field]: value } : row))
    );
  };

  const addMaterial = () => {
    if (!canAddMaterial) {
      return;
    }

    setMaterialRows((currentRows) => [
      ...currentRows,
      { id: nextRowId, title: EMPTY_VALUE, url: EMPTY_VALUE },
    ]);
    setNextRowId((currentId) => currentId + 1);
    // The new row is where the manager types next.
    focusFieldById(FIELD_ID.materialTitle(nextRowId));
  };

  /** ARIA wiring that ties a control to the current validation message. */
  const getValidationProps = (fieldId: string) =>
    validationIssue?.fieldId === fieldId
      ? { "aria-describedby": FIELD_ID.validationError, "aria-invalid": true }
      : {};

  const removeMaterial = (rowId: number) => {
    setValidationIssue(null);
    setMaterialRows((currentRows) => currentRows.filter((row) => row.id !== rowId));
    // The removed row took the focused button with it; "Agregar material"
    // is the next useful stop and is always shown after a removal.
    focusFieldById(FIELD_ID.addMaterial);
  };

  const handleSubmit = (submitEvent: FormEvent<HTMLFormElement>) => {
    submitEvent.preventDefault();

    if (isSaving) {
      return;
    }

    const trimmedRecordingUrl = recordingUrl.trim();

    if (trimmedRecordingUrl && !isWebUrl(trimmedRecordingUrl)) {
      setValidationIssue({ fieldId: FIELD_ID.recordingUrl, message: COPY.invalidRecording });
      focusFieldById(FIELD_ID.recordingUrl);
      return;
    }

    // Fully empty rows are dropped; half-filled rows are an error.
    const invalidMaterialFieldId = findInvalidMaterialFieldId(materialRows);

    if (invalidMaterialFieldId) {
      setValidationIssue({ fieldId: invalidMaterialFieldId, message: COPY.invalidMaterial });
      focusFieldById(invalidMaterialFieldId);
      return;
    }

    const filledRows = materialRows
      .map((row) => ({ title: row.title.trim(), url: row.url.trim() }))
      .filter((row) => row.title || row.url);

    onSubmit({ materials: filledRows, recordingUrl: trimmedRecordingUrl || null });
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
      <DialogContent className={styles.TribeEventPostEventFormDialog}>
        <DialogHeader>
          <DialogTitle>{COPY.title}</DialogTitle>
          <DialogDescription>{COPY.description}</DialogDescription>
        </DialogHeader>
        <form className={styles.TribeEventPostEventFormDialog__form} noValidate onSubmit={handleSubmit}>
          <div className={styles.TribeEventPostEventFormDialog__field}>
            <label htmlFor={FIELD_ID.recordingUrl}>{COPY.recordingLabel}</label>
            <Input
              {...getValidationProps(FIELD_ID.recordingUrl)}
              id={FIELD_ID.recordingUrl}
              inputMode={INPUT_TYPE.url}
              maxLength={TRIBE_EVENT_POST_EVENT_LIMIT.urlMaxLength}
              placeholder={COPY.recordingPlaceholder}
              type={INPUT_TYPE.url}
              value={recordingUrl}
              onChange={(event) => {
                setValidationIssue(null);
                setRecordingUrl(event.currentTarget.value);
              }}
            />
          </div>

          <fieldset className={styles.TribeEventPostEventFormDialog__materials}>
            <legend className={styles.TribeEventPostEventFormDialog__legend}>
              {COPY.materialsLegend}
            </legend>
            <AnimatePresence initial={false}>
              {materialRows.map((row, index) => {
                const position = index + 1;

                return (
                  <AnimatedListItem
                    as={MATERIAL_ROW_ELEMENT}
                    className={styles.TribeEventPostEventFormDialog__materialRow}
                    key={row.id}
                  >
                    <Input
                      {...getValidationProps(FIELD_ID.materialTitle(row.id))}
                      aria-label={COPY.materialTitleLabel(position)}
                      className={styles.TribeEventPostEventFormDialog__materialTitle}
                      id={FIELD_ID.materialTitle(row.id)}
                      maxLength={TRIBE_EVENT_POST_EVENT_LIMIT.materialTitleMaxLength}
                      placeholder={COPY.materialTitlePlaceholder}
                      value={row.title}
                      onChange={(event) => updateMaterial(row.id, "title", event.currentTarget.value)}
                    />
                    <Input
                      {...getValidationProps(FIELD_ID.materialUrl(row.id))}
                      aria-label={COPY.materialUrlLabel(position)}
                      className={styles.TribeEventPostEventFormDialog__materialUrl}
                      id={FIELD_ID.materialUrl(row.id)}
                      inputMode={INPUT_TYPE.url}
                      maxLength={TRIBE_EVENT_POST_EVENT_LIMIT.urlMaxLength}
                      placeholder="https://"
                      type={INPUT_TYPE.url}
                      value={row.url}
                      onChange={(event) => updateMaterial(row.id, "url", event.currentTarget.value)}
                    />
                    <Button
                      aria-label={COPY.removeMaterial(position)}
                      className={styles.TribeEventPostEventFormDialog__materialRemove}
                      size={BUTTON_ATTRIBUTE.sizeSmall}
                      type={BUTTON_ATTRIBUTE.typeButton}
                      variant={BUTTON_ATTRIBUTE.variantGhost}
                      onClick={() => removeMaterial(row.id)}
                    >
                      <Trash2Icon aria-hidden />
                    </Button>
                  </AnimatedListItem>
                );
              })}
            </AnimatePresence>
            {canAddMaterial ? (
              <Button
                className={styles.TribeEventPostEventFormDialog__addMaterial}
                id={FIELD_ID.addMaterial}
                size={BUTTON_ATTRIBUTE.sizeSmall}
                type={BUTTON_ATTRIBUTE.typeButton}
                variant={BUTTON_ATTRIBUTE.variantOutline}
                onClick={addMaterial}
              >
                <PlusIcon aria-hidden />
                {COPY.addMaterial}
              </Button>
            ) : (
              <p className={styles.TribeEventPostEventFormDialog__hint}>{COPY.maxMaterials}</p>
            )}
          </fieldset>

          <AnimatedCollapse isOpen={validationIssue !== null}>
            <p
              className={styles.TribeEventPostEventFormDialog__error}
              id={FIELD_ID.validationError}
              role="alert"
            >
              {validationIssue?.message ?? shownValidationMessage}
            </p>
          </AnimatedCollapse>
          <div className={styles.TribeEventPostEventFormDialog__actions}>
            <Button
              type={BUTTON_ATTRIBUTE.typeButton}
              variant={BUTTON_ATTRIBUTE.variantGhost}
              onClick={onClose}
            >
              {COPY.cancelButton}
            </Button>
            <Button disabled={isSaving} type={BUTTON_ATTRIBUTE.typeSubmit}>
              {isSaving ? COPY.submittingButton : COPY.submitButton}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
