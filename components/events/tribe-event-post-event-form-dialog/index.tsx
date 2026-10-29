"use client";

import { type Dispatch, type ReactNode, type SetStateAction, type SubmitEvent, useLayoutEffect, useRef, useState } from "react";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { AnimatePresence } from "motion/react";

import { Button, Dialog, DialogContent, Input, AnimatedCollapse, AnimatedListItem } from "@golfo/ui";

import { TribeEventFormActions } from "@/components/events/tribe-event-form-actions";
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
const WEB_URL_PROTOCOLS: ReadonlySet<string> = new Set(["http:", "https:"]);
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
  variantGhost: "ghost",
  variantSecondary: "secondary",
} as const;
const COPY = {
  addMaterial: "Agregar material",
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
    return WEB_URL_PROTOCOLS.has(new URL(value).protocol);
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

/** Moves focus to the control with `fieldId` when it is in the document. */
function focusFieldById(fieldId: string): void {
  const control = document.getElementById(fieldId);

  if (control instanceof HTMLElement) {
    control.focus();
  }
}

function toMaterialRows(postEvent: TribeEventPostEventView | null): MaterialRow[] {
  return (postEvent?.materials ?? []).map((material, index) => ({
    id: index,
    title: material.title,
    url: material.url,
  }));
}

/** ARIA wiring that ties a material control to the shared validation message. */
function getValidationProps(invalidFieldId: string | undefined, fieldId: string) {
  return invalidFieldId === fieldId
    ? { "aria-describedby": FIELD_ID.validationError, "aria-invalid": true }
    : {};
}

/**
 * First problem of the form: an invalid recording link, then a half-filled
 * material row (fully empty rows are dropped), or null when it can be sent.
 */
function findValidationIssue(
  trimmedRecordingUrl: string,
  materialRows: MaterialRow[]
): PostEventValidationIssue | null {
  if (trimmedRecordingUrl && !isWebUrl(trimmedRecordingUrl)) {
    return { fieldId: FIELD_ID.recordingUrl, message: COPY.invalidRecording };
  }

  const invalidMaterialFieldId = findInvalidMaterialFieldId(materialRows);

  return invalidMaterialFieldId
    ? { fieldId: invalidMaterialFieldId, message: COPY.invalidMaterial }
    : null;
}

/**
 * Control that takes the focus once the update that requested it commits.
 * It may be a row mounted by that update, and a removed row stays mounted
 * but inert while it leaves, so waiting for a frame would leave the focus
 * on a control that can no longer be used.
 *
 * @returns Asks to focus a field right after the current update commits.
 */
function usePendingFieldFocus() {
  const pendingFocusFieldIdRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    const pendingFocusFieldId = pendingFocusFieldIdRef.current;

    if (pendingFocusFieldId) {
      pendingFocusFieldIdRef.current = null;
      focusFieldById(pendingFocusFieldId);
    }
  });

  return (fieldId: string) => {
    pendingFocusFieldIdRef.current = fieldId;
  };
}

type MaterialRowFieldsProps = {
  invalidFieldId: string | undefined;
  onRemove: () => void;
  onUpdate: (field: "title" | "url", value: string) => void;
  /** One-based position, used in the accessible labels. */
  position: number;
  row: MaterialRow;
};

/** Name, link and remove button of one material. */
function MaterialRowFields({ invalidFieldId, onRemove, onUpdate, position, row }: MaterialRowFieldsProps) {
  return (
    <AnimatedListItem
      as={MATERIAL_ROW_ELEMENT}
      className={styles.TribeEventPostEventFormDialog__materialRow}
    >
      <Input
        {...getValidationProps(invalidFieldId, FIELD_ID.materialTitle(row.id))}
        aria-label={COPY.materialTitleLabel(position)}
        className={styles.TribeEventPostEventFormDialog__materialTitle}
        id={FIELD_ID.materialTitle(row.id)}
        maxLength={TRIBE_EVENT_POST_EVENT_LIMIT.materialTitleMaxLength}
        placeholder={COPY.materialTitlePlaceholder}
        value={row.title}
        onChange={(event) => onUpdate("title", event.currentTarget.value)}
      />
      <Input
        {...getValidationProps(invalidFieldId, FIELD_ID.materialUrl(row.id))}
        aria-label={COPY.materialUrlLabel(position)}
        className={styles.TribeEventPostEventFormDialog__materialUrl}
        id={FIELD_ID.materialUrl(row.id)}
        inputMode={INPUT_TYPE.url}
        maxLength={TRIBE_EVENT_POST_EVENT_LIMIT.urlMaxLength}
        placeholder="https://"
        type={INPUT_TYPE.url}
        value={row.url}
        onChange={(event) => onUpdate("url", event.currentTarget.value)}
      />
      <Button
        aria-label={COPY.removeMaterial(position)}
        className={styles.TribeEventPostEventFormDialog__materialRemove}
        size={BUTTON_ATTRIBUTE.sizeSmall}
        type={BUTTON_ATTRIBUTE.typeButton}
        variant={BUTTON_ATTRIBUTE.variantGhost}
        onClick={onRemove}
      >
        <Trash2Icon aria-hidden />
      </Button>
    </AnimatedListItem>
  );
}

type MaterialsFieldsetProps = {
  canAddMaterial: boolean;
  invalidFieldId: string | undefined;
  materialRows: MaterialRow[];
  onAdd: () => void;
  onRemove: (rowId: number) => void;
  onUpdate: (rowId: number, field: "title" | "url", value: string) => void;
};

/** Editable list of material links, up to the materials limit. */
function MaterialsFieldset({
  canAddMaterial,
  invalidFieldId,
  materialRows,
  onAdd,
  onRemove,
  onUpdate,
}: MaterialsFieldsetProps) {
  return (
    <fieldset className={styles.TribeEventPostEventFormDialog__materials}>
      <legend className={styles.TribeEventPostEventFormDialog__legend}>
        {COPY.materialsLegend}
      </legend>
      <AnimatePresence initial={false}>
        {materialRows.map((row, index) => (
          <MaterialRowFields
            invalidFieldId={invalidFieldId}
            key={row.id}
            position={index + 1}
            row={row}
            onRemove={() => onRemove(row.id)}
            onUpdate={(field, value) => onUpdate(row.id, field, value)}
          />
        ))}
      </AnimatePresence>
      {canAddMaterial ? (
        <Button
          className={styles.TribeEventPostEventFormDialog__addMaterial}
          id={FIELD_ID.addMaterial}
          size={BUTTON_ATTRIBUTE.sizeSmall}
          type={BUTTON_ATTRIBUTE.typeButton}
          variant={BUTTON_ATTRIBUTE.variantSecondary}
          onClick={onAdd}
        >
          <PlusIcon aria-hidden />
          {COPY.addMaterial}
        </Button>
      ) : (
        <p className={styles.TribeEventPostEventFormDialog__hint}>{COPY.maxMaterials}</p>
      )}
    </fieldset>
  );
}

type PostEventFormActionsProps = Pick<TribeEventPostEventFormDialogProps, "isSaving" | "onClose">;

/** Cancel and save buttons of the form. */
function PostEventFormActions({ isSaving, onClose }: PostEventFormActionsProps) {
  return (
    <TribeEventFormActions
      className={styles.TribeEventPostEventFormDialog__actions}
      isSaving={isSaving}
      onClose={onClose}
      savingLabel={COPY.submittingButton}
      submitLabel={COPY.submitButton}
    />
  );
}

/**
 * Validates the form and builds the payload: fully empty material rows are
 * dropped and half-filled rows are an error.
 */
function buildPostEventSubmission(
  recordingUrl: string,
  materialRows: MaterialRow[]
): { issue: PostEventValidationIssue } | { payload: TribeEventPostEventFormPayload } {
  const trimmedRecordingUrl = recordingUrl.trim();
  const issue = findValidationIssue(trimmedRecordingUrl, materialRows);

  if (issue) {
    return { issue };
  }

  const filledRows = materialRows
    .map((row) => ({ title: row.title.trim(), url: row.url.trim() }))
    .filter((row) => row.title || row.url);

  return { payload: { materials: filledRows, recordingUrl: trimmedRecordingUrl || null } };
}

/**
 * Last material message shown, kept while the error region collapses.
 *
 * @param materialIssue - Current material validation issue, if any.
 * @returns The message to keep rendering.
 */
function useShownMaterialMessage(materialIssue: PostEventValidationIssue | null) {
  const [shownMaterialMessage, setShownMaterialMessage] = useState<string | null>(null);

  if (materialIssue && materialIssue.message !== shownMaterialMessage) {
    setShownMaterialMessage(materialIssue.message);
  }

  return shownMaterialMessage;
}

type MaterialRowActionsInput = {
  canAddMaterial: boolean;
  /** Asks to focus a field right after the current update commits. */
  focusFieldAfterUpdate: (fieldId: string) => void;
  nextRowId: number;
  setMaterialRows: Dispatch<SetStateAction<MaterialRow[]>>;
  setNextRowId: Dispatch<SetStateAction<number>>;
  setValidationIssue: Dispatch<SetStateAction<PostEventValidationIssue | null>>;
};

/** Edit, add and remove actions of the material rows. */
function createMaterialRowActions({
  canAddMaterial,
  focusFieldAfterUpdate,
  nextRowId,
  setMaterialRows,
  setNextRowId,
  setValidationIssue,
}: MaterialRowActionsInput) {
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
    focusFieldAfterUpdate(FIELD_ID.materialTitle(nextRowId));
  };

  const removeMaterial = (rowId: number) => {
    setValidationIssue(null);
    setMaterialRows((currentRows) => currentRows.filter((row) => row.id !== rowId));
    // The removed row took the focused button with it; "Agregar material"
    // is the next useful stop and is always shown after a removal.
    focusFieldAfterUpdate(FIELD_ID.addMaterial);
  };

  return { addMaterial, removeMaterial, updateMaterial };
}

/** Shared message under the material list, kept while it collapses. */
function MaterialValidationMessage({ isOpen, message }: { isOpen: boolean; message: string | null }) {
  return (
    <AnimatedCollapse isOpen={isOpen}>
      <p
        className={styles.TribeEventPostEventFormDialog__error}
        id={FIELD_ID.validationError}
        role="alert"
      >
        {message}
      </p>
    </AnimatedCollapse>
  );
}

type RecordingUrlFieldProps = {
  error: string | undefined;
  onChange: (value: string) => void;
  value: string;
};

/** Optional recording link, with its own message under it. */
function RecordingUrlField({ error, onChange, value }: RecordingUrlFieldProps) {
  return (
    <Input
      error={error}
      id={FIELD_ID.recordingUrl}
      inputMode={INPUT_TYPE.url}
      label={COPY.recordingLabel}
      maxLength={TRIBE_EVENT_POST_EVENT_LIMIT.urlMaxLength}
      placeholder={COPY.recordingPlaceholder}
      type={INPUT_TYPE.url}
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  );
}

type PostEventFormDialogShellProps = Pick<TribeEventPostEventFormDialogProps, "isOpen" | "onClose"> & {
  children: ReactNode;
};

/** Dialog frame of the form; closing it from outside calls `onClose`. */
function PostEventFormDialogShell({ children, isOpen, onClose }: PostEventFormDialogShellProps) {
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
        className={styles.TribeEventPostEventFormDialog}
        title={COPY.title}
        description={COPY.description}
      >
        {children}
      </DialogContent>
    </Dialog>
  );
}

/**
 * The recording link shows its own message under it; material rows share
 * the message under the list.
 */
function splitValidationIssue(validationIssue: PostEventValidationIssue | null) {
  return {
    materialIssue:
      validationIssue && validationIssue.fieldId !== FIELD_ID.recordingUrl ? validationIssue : null,
    recordingUrlError:
      validationIssue?.fieldId === FIELD_ID.recordingUrl ? validationIssue.message : undefined,
  };
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
  const { materialIssue, recordingUrlError } = splitValidationIssue(validationIssue);
  const shownMaterialMessage = useShownMaterialMessage(materialIssue);
  const canAddMaterial = materialRows.length < TRIBE_EVENT_POST_EVENT_LIMIT.materialsMax;
  const focusFieldAfterUpdate = usePendingFieldFocus();

  const materialActions = createMaterialRowActions({
    canAddMaterial,
    focusFieldAfterUpdate,
    nextRowId,
    setMaterialRows,
    setNextRowId,
    setValidationIssue,
  });

  const handleSubmit = (submitEvent: SubmitEvent<HTMLFormElement>) => {
    submitEvent.preventDefault();

    if (isSaving) {
      return;
    }

    const result = buildPostEventSubmission(recordingUrl, materialRows);

    if ("issue" in result) {
      setValidationIssue(result.issue);
      focusFieldAfterUpdate(result.issue.fieldId);
      return;
    }

    onSubmit(result.payload);
  };

  return (
    <PostEventFormDialogShell isOpen={isOpen} onClose={onClose}>
      <form className={styles.TribeEventPostEventFormDialog__form} noValidate onSubmit={handleSubmit}>
        <RecordingUrlField
          error={recordingUrlError}
          value={recordingUrl}
          onChange={(value) => {
            setValidationIssue(null);
            setRecordingUrl(value);
          }}
        />
        <MaterialsFieldset
          canAddMaterial={canAddMaterial}
          invalidFieldId={validationIssue?.fieldId}
          materialRows={materialRows}
          onAdd={materialActions.addMaterial}
          onRemove={materialActions.removeMaterial}
          onUpdate={materialActions.updateMaterial}
        />
        <MaterialValidationMessage
          message={materialIssue?.message ?? shownMaterialMessage}
          isOpen={materialIssue !== null}
        />
        <PostEventFormActions isSaving={isSaving} onClose={onClose} />
      </form>
    </PostEventFormDialogShell>
  );
}
