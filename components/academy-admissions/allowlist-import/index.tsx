"use client";
/** Presents the guided CSV import (upload, review, confirm) without transport or session access. @module allowlist-import-presenter */
import type { AllowlistImportDto } from "@/src/modules/academy-admissions/application/results/admission-management-result-schemas";
import { useId, useMemo, useState, type ReactNode } from "react";
import { Button, Checkbox, EmptyState, Input, Label } from "@golfo/ui";
import { ButtonLink } from "@/components/navigation/link";
import { GuidedSteps, type GuidedStep } from "@/components/forms/guided-steps";
import { PlatformSecurityNotice } from "@/components/academy-admissions/platform-security-notice";
import type { PlatformSecurityRequirement } from "@/src/modules/shared/domain/value-objects/platform-security-requirement";
import { ALLOWLIST_IMPORT_FILE_ACCEPT, ALLOWLIST_IMPORT_VISIBLE_ROW_COUNT, ALLOWLIST_IMPORT_BROWSER_COPY as COPY, ALLOWLIST_IMPORT_WRITE_ACTION, type AllowlistImportWriteAction } from "@/src/modules/academy-admissions/constants/allowlist-import-browser";
import { formatBuenosAiresDateTime } from "@/lib/date-time/buenos-aires-format";
import { isSelectableAllowlistImportRow, listSelectableAllowlistImportRows } from "@/lib/academy-admissions/allowlist-import-selection";
import { ALLOWLIST_IMPORT_REPORT_ERROR_LABEL, ALLOWLIST_IMPORT_REPORT_OUTCOME_LABEL } from "@/src/modules/academy-admissions/constants/allowlist-import";
import { ADMISSION_IMPORT_PUBLIC_STATE } from "@/src/modules/academy-admissions/constants/admission-management-contract";
import styles from "./styles.module.scss";
/** `busy` covers every read and write; `writeAction` names only the pressed write, which keeps its label and focus while it shows progress. */
export type AllowlistImportProps = { /** Rules page where the leader saves the configuration the import depends on. */ policyHref: string; /** Why the platform cannot protect previews and confirmations now; while present, only reads stay available. */ platformRequirement: PlatformSecurityRequirement | null; /** The last consult proved the pending original absent, so it can be discarded. */ originalAbsent: boolean; onDiscardOriginal: () => void; ready: boolean; busy: boolean; writeAction: AllowlistImportWriteAction | null; privateVisible: boolean; initializationFailed: boolean; hasSavedImport: boolean; onRetryInitialization: () => void; fileName: string | null; contactType: "email" | "phone" | null; snapshot: AllowlistImportDto | null; selection: readonly number[]; confirmed: boolean; pending: boolean; canResume: boolean; conflict: boolean; policyConflict: boolean; unresolvedCount: number; canReconcile: boolean; errorMessage: string | null; fieldError: string | null; statusMessage: string | null; step: number; onStepChange: (step: number) => void; onFile: (file: File) => void; onConfirmChange: (value: boolean) => void; onSelectRow: (row: number, selected: boolean) => void; /** Chooses every valid row without a result, or clears the selection. */ onSelectAllValid: (selected: boolean) => void; onPreview: () => void; onConfirm: () => void; onReadOriginal: () => void; onReadCurrent: () => void; /** Rereads only the platform block, with or without a saved import. */ onRecheckPlatform: () => void; onReadPolicy: () => void; onTemplate: () => void; onReport: () => void; onReconcile: () => void };

/** Derived import facts the step blockers and actions read beside the props. */
type ImportFlowFacts = { terminal: boolean; pendingBlocks: boolean; unresolvedBlocks: boolean; previewing: boolean; reconciling: boolean; confirmingRows: boolean; resumeLabel: boolean; writing: boolean };

/** @param props - Current import view state. @returns Whether the import finished, which write runs, and what blocks the flow. */
function importFlowFacts(props: AllowlistImportProps): ImportFlowFacts {
  const pendingBlocks = props.pending && !props.canResume;
  const terminal = props.snapshot?.state === ADMISSION_IMPORT_PUBLIC_STATE.completed || props.snapshot?.state === ADMISSION_IMPORT_PUBLIC_STATE.cancelled || props.snapshot?.state === ADMISSION_IMPORT_PUBLIC_STATE.expired;
  const confirmingRows = props.writeAction === ALLOWLIST_IMPORT_WRITE_ACTION.confirm || props.writeAction === ALLOWLIST_IMPORT_WRITE_ACTION.resume;
  // A write in flight is not an unresolved original yet: only a settled, unconfirmed one blocks the flow.
  const writing = props.writeAction !== null;
  return {
    terminal, pendingBlocks, confirmingRows, writing,
    unresolvedBlocks: !writing && (pendingBlocks || props.unresolvedCount > 0),
    previewing: props.writeAction === ALLOWLIST_IMPORT_WRITE_ACTION.preview,
    reconciling: props.writeAction === ALLOWLIST_IMPORT_WRITE_ACTION.reconcile,
    // The pressed confirmation keeps its label even though the write itself retires the resumable original.
    resumeLabel: confirmingRows ? props.writeAction === ALLOWLIST_IMPORT_WRITE_ACTION.resume : props.canResume,
  };
}
type ImportRow = AllowlistImportDto["rows"][number];

/** @param props - Current import view state. @param facts - Derived flow facts. @returns What blocks creating the preview, or undefined once it can be created or already exists. */
function uploadBlockedReason(props: AllowlistImportProps, facts: ImportFlowFacts): string | undefined {
  if (props.platformRequirement && !props.snapshot) return COPY.platformBlocked;
  if (!props.contactType) return COPY.noPolicy;
  if (props.snapshot) return undefined;
  if (facts.unresolvedBlocks) return COPY.pendingStepBlocked;
  if (props.policyConflict) return COPY.policyConflictBlocked;
  if (!props.fileName) return COPY.fileRequired;
  return !props.confirmed && !facts.previewing ? COPY.previewConfirmRequired : undefined;
}

/** @param props - Current import view state. @param facts - Derived flow facts. @returns What blocks leaving the review step, or undefined. */
function reviewBlockedReason(props: AllowlistImportProps, facts: ImportFlowFacts): string | undefined {
  if (facts.terminal) return COPY.finished;
  return props.selection.length === 0 && !facts.confirmingRows ? COPY.selectionRequired : undefined;
}

/** @param props - Current import view state. @param facts - Derived flow facts. @returns What blocks importing the chosen rows, or undefined while they can be (or are being) imported. */
function confirmBlockedReason(props: AllowlistImportProps, facts: ImportFlowFacts): string | undefined {
  if (facts.confirmingRows) return undefined;
  if (facts.terminal) return COPY.finished;
  if (props.platformRequirement) return COPY.platformBlocked;
  if (facts.pendingBlocks) return COPY.pendingStepBlocked;
  if (props.conflict) return COPY.conflictBlocked;
  if (props.selection.length === 0) return COPY.selectionRequired;
  return props.confirmed ? undefined : COPY.importConfirmRequired;
}

/** @param row - One previewed row. @returns Its confirmed result, or whether it needs fixing or waits to be chosen. */
function rowStatusLabel(row: ImportRow): string {
  if (row.outcome) return ALLOWLIST_IMPORT_REPORT_OUTCOME_LABEL[row.outcome];
  return row.errors.length ? "Revisar datos" : "Válida pendiente";
}

/** @param props - One previewed row, its selection state and the selection callback. @returns The row with its own checkbox, contact, status and errors. */
function ImportRowItem({ row, fieldId, checked, disabled, onSelectRow }: { row: ImportRow; fieldId: string; checked: boolean; disabled: boolean; onSelectRow: AllowlistImportProps["onSelectRow"] }) {
  return <li className={styles.AllowlistImport__row}>
    <div className={styles.AllowlistImport__selection}><Checkbox id={`${fieldId}-row-${row.rowNumber}`} checked={checked} disabled={disabled || !isSelectableAllowlistImportRow(row)} onCheckedChange={(value) => onSelectRow(row.rowNumber, value === true)} /><Label htmlFor={`${fieldId}-row-${row.rowNumber}`}>Seleccionar fila {row.rowNumber}</Label></div>
    <div className={styles.AllowlistImport__identity}><strong>{row.identity || "Contacto vacío"}</strong>{row.displayName && <span>{row.displayName}</span>}<span className={styles.AllowlistImport__help}>{rowStatusLabel(row)}{row.version !== undefined && ` · Versión de entrada ${row.version}`}</span>{row.errors.length > 0 && <span className={styles.AllowlistImport__error}>{row.errors.map((error) => ALLOWLIST_IMPORT_REPORT_ERROR_LABEL[error]).join(" · ")}</span>}</div>
  </li>;
}

/** @param props - First shown row offset, row total, busy state and the offset setter. @returns Previous/next row page controls. */
function RowPager({ offset, total, busy, onOffset }: { offset: number; total: number; busy: boolean; onOffset: (offset: number) => void }) {
  return <nav className={styles.AllowlistImport__actions} aria-label="Páginas de filas importadas"><Button type="button" variant="secondary" disabled={busy || offset === 0} onClick={() => onOffset(Math.max(0, offset - ALLOWLIST_IMPORT_VISIBLE_ROW_COUNT))}>Filas anteriores</Button><span>Filas {offset + 1}–{Math.min(offset + ALLOWLIST_IMPORT_VISIBLE_ROW_COUNT, total)} de {total}</span><Button type="button" variant="secondary" disabled={busy || offset + ALLOWLIST_IMPORT_VISIBLE_ROW_COUNT >= total} onClick={() => onOffset(offset + ALLOWLIST_IMPORT_VISIBLE_ROW_COUNT)}>Filas siguientes</Button></nav>;
}

/** @param props - Import view state, its derived flow facts and whether controls are disabled. @returns The unresolved-original notice with its read and reconcile actions. */
function PendingOriginalCallout({ props, unresolvedBlocks, reconciling, disabled }: { props: AllowlistImportProps; unresolvedBlocks: boolean; reconciling: boolean; disabled: boolean }) {
  return <div className={styles.AllowlistImport__callout}>
    {unresolvedBlocks && <p role="status">{COPY.pendingBlocked}</p>}
    <div className={styles.AllowlistImport__actions}><Button type="button" variant="secondary" disabled={disabled} onClick={props.onReadOriginal}>Consultar operación original</Button>{props.originalAbsent && <Button type="button" variant="ghost" disabled={disabled} onClick={props.onDiscardOriginal}>Descartar la operación sin registrar</Button>}{(props.canReconcile || reconciling) && <Button type="button" variant="secondary" loading={reconciling} disabled={!reconciling && (disabled || Boolean(props.platformRequirement))} onClick={props.onReconcile}>Conciliar resultados anteriores</Button>}</div>
    {props.unresolvedCount > 0 && <span className={styles.AllowlistImport__help}>Confirmaciones anteriores por conciliar: {props.unresolvedCount}</span>}
  </div>;
}

/** @param props - Import view state, field ids prefix, disabled state, the shared field error and the file callback. @returns The CSV format help, the file field and the preview consent. */
function UploadStepContent({ props, fieldId, disabled, fieldError, onFileChosen }: { props: AllowlistImportProps; fieldId: string; disabled: boolean; fieldError: ReactNode; onFileChosen: (file: File) => void }) {
  return <>
    <p className={styles.AllowlistImport__help}>CSV en UTF-8, separado por comas, con encabezados <code>identity,display_name</code>. Hasta 10.000 filas y 5 MiB. El nombre es opcional; para teléfonos usá el prefijo internacional completo.</p>
    <div className={styles.AllowlistImport__field}><Label htmlFor={`${fieldId}-file`}>Archivo CSV de habilitados</Label><Input id={`${fieldId}-file`} type="file" accept={ALLOWLIST_IMPORT_FILE_ACCEPT} disabled={disabled || props.pending || props.unresolvedCount > 0 || !props.contactType || Boolean(props.platformRequirement)} aria-describedby={`${fieldId}-file-help`} aria-invalid={Boolean(props.fieldError)} onChange={(event) => { const file = event.target.files?.[0]; if (file) onFileChosen(file); event.target.value = ""; }} /><p id={`${fieldId}-file-help`} className={styles.AllowlistImport__help}>{props.fileName ? `Archivo conservado: ${props.fileName}` : "Elegí el archivo para revisar su formato antes de crear la vista previa."}</p></div>
    {fieldError}
    {props.policyConflict && <Button type="button" variant="secondary" disabled={disabled} onClick={props.onReadPolicy}>Consultar configuración actual</Button>}
    {props.snapshot ? <p className={styles.AllowlistImport__help}>La vista previa de este archivo ya está creada. Elegí otro archivo si querés empezar de nuevo.</p>
      : <Checkbox id={`${fieldId}-preview-confirmed`} checked={props.confirmed} disabled={disabled || props.pending || !props.fileName || !props.contactType || Boolean(props.platformRequirement)} label="Confirmo guardar esta vista previa temporal" description="La vista previa no agrega entradas." onCheckedChange={(value) => props.onConfirmChange(value === true)} />}
  </>;
}

/** @param props - Import view state, field ids prefix, whether controls wait (`disabled`) or the import is blocked or finished (`blocked`), and the shared field error. @returns The chosen row count, the import consent and the report note. */
function ConfirmStepContent({ props, fieldId, disabled, blocked, fieldError }: { props: AllowlistImportProps; fieldId: string; disabled: boolean; blocked: boolean; fieldError: ReactNode }) {
  return <>
    <p className={styles.AllowlistImport__summary}>{props.selection.length === 1 ? "Vas a incorporar 1 fila elegida." : `Vas a incorporar ${props.selection.length} filas elegidas.`}</p>
    <p className={styles.AllowlistImport__help}>La confirmación sólo incorpora filas válidas nuevas; no reemplaza toda la lista, reactiva entradas ni crea membresías.</p>
    {fieldError}
    {props.conflict && <Button type="button" variant="secondary" disabled={disabled} onClick={props.onReadCurrent}>Consultar progreso actual</Button>}
    <Checkbox id={`${fieldId}-rows-confirmed`} checked={props.confirmed} disabled={blocked || props.selection.length === 0 || props.conflict} label="Confirmo incorporar sólo las filas elegidas" onCheckedChange={(value) => props.onConfirmChange(value === true)} />
    <p className={styles.AllowlistImport__help}>El reporte neutraliza fórmulas y conserva HTML como texto. Es para lectura; no lo uses como archivo original para reimportar ni asumas que otra herramienta preserva su protección al guardarlo.</p>
  </>;
}

/** Selection state of the previewed rows. */
type RowSelection = { selected: ReadonlySet<number>; disabled: boolean; selectableCount: number };
/** The shown page of previewed rows and its paging. */
type RowPage = { rows: readonly ImportRow[]; offset: number; total: number; onOffset: (offset: number) => void };

/** @param props - The preview, the import view state, field ids prefix, the row selection and the shown page. @returns The preview counts, bulk selection, the paged rows and the report window. */
function ReviewStepContent({ snapshot, props, fieldId, selection, page }: { snapshot: AllowlistImportDto; props: AllowlistImportProps; fieldId: string; selection: RowSelection; page: RowPage }) {
  return <>
    <dl className={styles.AllowlistImport__counts}><div className={styles.AllowlistImport__count}><dt>Elegidas ahora</dt><dd>{props.selection.length}</dd></div><div className={styles.AllowlistImport__count}><dt>Válidas sin resultado</dt><dd>{selection.selectableCount}</dd></div><div className={styles.AllowlistImport__count}><dt>Agregadas</dt><dd>{snapshot.counts.added}</dd></div><div className={styles.AllowlistImport__count}><dt>Sin cambios</dt><dd>{snapshot.counts.unchanged}</dd></div><div className={styles.AllowlistImport__count}><dt>Omitidas</dt><dd>{snapshot.counts.skipped}</dd></div><div className={styles.AllowlistImport__count}><dt>Conflictos</dt><dd>{snapshot.counts.conflict}</dd></div></dl>
    <div className={styles.AllowlistImport__actions}>
      <Button type="button" variant="secondary" size="sm" disabled={selection.disabled || selection.selectableCount === 0 || props.selection.length === selection.selectableCount} onClick={() => props.onSelectAllValid(true)}>Seleccionar todas las válidas</Button>
      <Button type="button" variant="ghost" size="sm" disabled={selection.disabled || props.selection.length === 0} onClick={() => props.onSelectAllValid(false)}>Quitar selección</Button>
    </div>
    <ul className={styles.AllowlistImport__rows}>{page.rows.map((row) => <ImportRowItem key={row.rowNumber} row={row} fieldId={fieldId} checked={selection.selected.has(row.rowNumber)} disabled={selection.disabled} onSelectRow={props.onSelectRow} />)}</ul>
    {page.total > ALLOWLIST_IMPORT_VISIBLE_ROW_COUNT && <RowPager offset={page.offset} total={page.total} busy={props.busy} onOffset={page.onOffset} />}
    <p className={styles.AllowlistImport__help}>Versión {snapshot.sourceVersion}. Reporte disponible hasta <time dateTime={snapshot.expiresAt}>{formatBuenosAiresDateTime(snapshot.expiresAt)}</time>; después de ese plazo no puede consultarse. Los resultados ya confirmados se conservan y no se repiten.</p>
  </>;
}

/**
 * @param props - Import view state.
 * @returns The platform block while the platform cannot protect imports (the rules cannot be saved either, so it replaces their link),
 * the link to the rules while none are saved, or nothing when the import needs no prerequisite.
 */
function ImportPrerequisite({ props }: { props: AllowlistImportProps }) {
  if (props.platformRequirement) return <PlatformSecurityNotice requirement={props.platformRequirement} consequence={COPY.platformConsequence} onRecheck={props.onRecheckPlatform} busy={!props.ready || props.busy} />;
  if (hasImportFlow(props)) return null;
  return <EmptyState label={COPY.noPolicyTitle} title={COPY.noPolicyTitle} description={COPY.noPolicy} action={<ButtonLink href={props.policyHref} variant="primary" size="sm">{COPY.noPolicyAction}</ButtonLink>} />;
}

/** @param props - Import view state. @returns Whether the guided import applies: the rules are saved, or a saved import still needs its progress. */
function hasImportFlow(props: AllowlistImportProps): boolean {
  return Boolean(props.contactType || props.snapshot || props.hasSavedImport);
}

/** @param props - Safe controlled view state and explicit callbacks. @returns A three-step import with paged rows and one next action, without session, file reading or network access. */
export function AllowlistImport(props: AllowlistImportProps) {
  const fieldId = useId(), [offset, setOffset] = useState(0), rows = props.snapshot?.rows ?? [];
  const selected = useMemo(() => new Set(props.selection), [props.selection]), boundedOffset = Math.min(offset, Math.max(0, Math.ceil(rows.length / ALLOWLIST_IMPORT_VISIBLE_ROW_COUNT) - 1) * ALLOWLIST_IMPORT_VISIBLE_ROW_COUNT);
  const visibleRows = rows.slice(boundedOffset, boundedOffset + ALLOWLIST_IMPORT_VISIBLE_ROW_COUNT), disabled = !props.ready || props.busy;
  const facts = importFlowFacts(props), { terminal, pendingBlocks, unresolvedBlocks, previewing, reconciling, confirmingRows, resumeLabel, writing } = facts;
  // Up to 10.000 rows: choosing them all is one action instead of one checkbox per row.
  const selectableCount = useMemo(() => props.snapshot ? listSelectableAllowlistImportRows(props.snapshot.rows).length : 0, [props.snapshot]);
  const selectionDisabled = disabled || pendingBlocks || terminal;
  const uploadReason = uploadBlockedReason(props, facts), reviewReason = reviewBlockedReason(props, facts), confirmReason = confirmBlockedReason(props, facts);
  const fieldError = props.fieldError && <p role="alert" className={styles.AllowlistImport__error}>{props.fieldError}</p>;
  const chooseFile = (file: File) => { setOffset(0); props.onFile(file); };
  const progress = props.snapshot && <div className={styles.AllowlistImport__actions}><Button type="button" variant="secondary" size="sm" disabled={disabled} onClick={props.onReadCurrent}>Consultar progreso actual</Button><Button type="button" variant="secondary" size="sm" disabled={disabled} onClick={props.onReport}>Descargar reporte</Button></div>;

  const steps: GuidedStep[] = [
    {
      id: "upload", title: "Subir archivo", description: "Elegí el CSV con los contactos que querés habilitar.", blockedReason: uploadReason,
      action: props.snapshot ? undefined : { label: "Crear vista previa", loading: previewing, disabled: disabled && !previewing, onRun: props.onPreview },
      content: <UploadStepContent props={props} fieldId={fieldId} disabled={disabled} fieldError={fieldError} onFileChosen={chooseFile} />,
      secondary: <Button type="button" variant="secondary" size="sm" disabled={disabled} onClick={props.onTemplate}>Descargar plantilla</Button>, secondaryLabel: "Plantilla del archivo",
    },
    {
      id: "review", title: "Revisar filas", description: "Marcá las filas válidas que querés incorporar, de a una o todas juntas. No se elige ninguna automáticamente.", blockedReason: reviewReason,
      content: props.snapshot && <ReviewStepContent snapshot={props.snapshot} props={props} fieldId={fieldId} selection={{ selected, disabled: selectionDisabled, selectableCount }} page={{ rows: visibleRows, offset: boundedOffset, total: rows.length, onOffset: setOffset }} />,
      secondary: progress, secondaryLabel: "Progreso y reporte",
    },
    {
      id: "confirm", title: "Confirmar e importar", description: "Revisá cuántas filas se incorporan antes de importarlas.", blockedReason: confirmReason,
      content: <ConfirmStepContent props={props} fieldId={fieldId} disabled={disabled} blocked={disabled || pendingBlocks || terminal || Boolean(props.platformRequirement)} fieldError={fieldError} />,
      secondary: progress, secondaryLabel: "Progreso y reporte",
    },
  ];

  return <section className={styles.AllowlistImport} aria-label="Importación de habilitados" aria-busy={props.busy}>
    <p className={styles.AllowlistImport__help}>La vista previa no agrega entradas. Al confirmar se incorporan sólo las filas que elijas.</p>
    {!props.privateVisible ? <p role="alert">{props.errorMessage ?? COPY.account}</p> : <>
      {!props.ready && !props.initializationFailed && <p role="status">{COPY.checking}</p>}
      {props.initializationFailed && <Button type="button" variant="secondary" disabled={props.busy} onClick={props.onRetryInitialization}>Reintentar consulta inicial</Button>}
      {props.statusMessage && <p role="status">{props.statusMessage}</p>}
      {props.errorMessage && <p role="alert" className={styles.AllowlistImport__error}>{props.errorMessage}</p>}
      {(!writing && (props.pending || props.unresolvedCount > 0) || reconciling) && <PendingOriginalCallout props={props} unresolvedBlocks={unresolvedBlocks} reconciling={reconciling} disabled={disabled} />}
      {props.hasSavedImport && !props.snapshot && <Button type="button" variant="secondary" disabled={disabled} onClick={props.onReadCurrent}>Consultar progreso actual</Button>}
      <ImportPrerequisite props={props} />
      {hasImportFlow(props) && <GuidedSteps label="Importar habilitados desde CSV" steps={steps} current={props.step} onCurrentChange={props.onStepChange} busy={disabled}
        finalAction={{ label: resumeLabel ? "Retomar filas pendientes" : "Importar filas elegidas", loading: confirmingRows, disabled: Boolean(confirmReason) || disabled && !confirmingRows, onRun: props.onConfirm }} />}
    </>}
  </section>;
}
