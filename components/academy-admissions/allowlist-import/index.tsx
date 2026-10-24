"use client";
/** Presents the guided CSV import (upload, review, confirm) without transport or session access. @module allowlist-import-presenter */
import type { AllowlistImportDto } from "@/src/modules/academy-admissions/application/results/admission-management-result-schemas";
import { useId, useMemo, useState } from "react";
import { Button, Checkbox, EmptyState, Input, Label } from "@golfo/ui";
import { ButtonLink } from "@/components/navigation/link";
import { GuidedSteps, type GuidedStep } from "@/components/forms/guided-steps";
import { ALLOWLIST_IMPORT_FILE_ACCEPT, ALLOWLIST_IMPORT_VISIBLE_ROW_COUNT, ALLOWLIST_IMPORT_BROWSER_COPY as COPY, ALLOWLIST_IMPORT_WRITE_ACTION, type AllowlistImportWriteAction } from "@/src/modules/academy-admissions/constants/allowlist-import-browser";
import { ALLOWLIST_IMPORT_REPORT_ERROR_LABEL, ALLOWLIST_IMPORT_REPORT_OUTCOME_LABEL } from "@/src/modules/academy-admissions/constants/allowlist-import";
import { ADMISSION_IMPORT_PUBLIC_STATE } from "@/src/modules/academy-admissions/constants/admission-management-contract";
import styles from "./styles.module.scss";
/** `busy` covers every read and write; `writeAction` names only the pressed write, which keeps its label and focus while it shows progress. */
export type AllowlistImportProps = { /** Rules page where the leader saves the configuration the import depends on. */ policyHref: string; ready: boolean; busy: boolean; writeAction: AllowlistImportWriteAction | null; privateVisible: boolean; initializationFailed: boolean; hasSavedImport: boolean; onRetryInitialization: () => void; fileName: string | null; contactType: "email" | "phone" | null; snapshot: AllowlistImportDto | null; selection: readonly number[]; confirmed: boolean; pending: boolean; canResume: boolean; conflict: boolean; policyConflict: boolean; unresolvedCount: number; canReconcile: boolean; errorMessage: string | null; fieldError: string | null; statusMessage: string | null; step: number; onStepChange: (step: number) => void; onFile: (file: File) => void; onConfirmChange: (value: boolean) => void; onSelectRow: (row: number, selected: boolean) => void; onPreview: () => void; onConfirm: () => void; onReadOriginal: () => void; onReadCurrent: () => void; onReadPolicy: () => void; onTemplate: () => void; onReport: () => void; onReconcile: () => void };

/** @param props - Safe controlled view state and explicit callbacks. @returns A three-step import with paged rows and one next action, without session, file reading or network access. */
export function AllowlistImport(props: AllowlistImportProps) {
  const fieldId = useId(), [offset, setOffset] = useState(0), rows = props.snapshot?.rows ?? [];
  const selected = useMemo(() => new Set(props.selection), [props.selection]), boundedOffset = Math.min(offset, Math.max(0, Math.ceil(rows.length / ALLOWLIST_IMPORT_VISIBLE_ROW_COUNT) - 1) * ALLOWLIST_IMPORT_VISIBLE_ROW_COUNT);
  const visibleRows = rows.slice(boundedOffset, boundedOffset + ALLOWLIST_IMPORT_VISIBLE_ROW_COUNT), disabled = !props.ready || props.busy, pendingBlocks = props.pending && !props.canResume;
  const terminal = props.snapshot?.state === ADMISSION_IMPORT_PUBLIC_STATE.completed || props.snapshot?.state === ADMISSION_IMPORT_PUBLIC_STATE.cancelled || props.snapshot?.state === ADMISSION_IMPORT_PUBLIC_STATE.expired;
  const previewing = props.writeAction === ALLOWLIST_IMPORT_WRITE_ACTION.preview, reconciling = props.writeAction === ALLOWLIST_IMPORT_WRITE_ACTION.reconcile;
  const confirmingRows = props.writeAction === ALLOWLIST_IMPORT_WRITE_ACTION.confirm || props.writeAction === ALLOWLIST_IMPORT_WRITE_ACTION.resume;
  // The pressed confirmation keeps its label even though the write itself retires the resumable original.
  const resumeLabel = confirmingRows ? props.writeAction === ALLOWLIST_IMPORT_WRITE_ACTION.resume : props.canResume;
  // A write in flight is not an unresolved original yet: only a settled, unconfirmed one blocks the flow.
  const writing = props.writeAction !== null;
  const unresolvedBlocks = !writing && (pendingBlocks || props.unresolvedCount > 0);
  const uploadReason = !props.contactType ? COPY.noPolicy : props.snapshot ? undefined : unresolvedBlocks ? COPY.pendingStepBlocked : props.policyConflict ? COPY.policyConflictBlocked : !props.fileName ? COPY.fileRequired : !props.confirmed && !previewing ? COPY.previewConfirmRequired : undefined;
  const reviewReason = terminal ? COPY.finished : props.selection.length === 0 && !confirmingRows ? COPY.selectionRequired : undefined;
  const confirmReason = confirmingRows ? undefined : terminal ? COPY.finished : pendingBlocks ? COPY.pendingStepBlocked : props.conflict ? COPY.conflictBlocked : props.selection.length === 0 ? COPY.selectionRequired : !props.confirmed ? COPY.importConfirmRequired : undefined;
  const fieldError = props.fieldError && <p role="alert" className={styles.AllowlistImport__error}>{props.fieldError}</p>;
  const progress = props.snapshot && <div className={styles.AllowlistImport__actions}><Button type="button" variant="secondary" size="sm" disabled={disabled} onClick={props.onReadCurrent}>Consultar progreso actual</Button><Button type="button" variant="secondary" size="sm" disabled={disabled} onClick={props.onReport}>Descargar reporte</Button></div>;

  const steps: GuidedStep[] = [
    {
      id: "upload", title: "Subir archivo", description: "Elegí el CSV con los contactos que querés habilitar.", blockedReason: uploadReason,
      action: props.snapshot ? undefined : { label: "Crear vista previa", loading: previewing, disabled: disabled && !previewing, onRun: props.onPreview },
      content: <>
        <p className={styles.AllowlistImport__help}>CSV en UTF-8, separado por comas, con encabezados <code>identity,display_name</code>. Hasta 10.000 filas y 5 MiB. El nombre es opcional; para teléfonos usá el prefijo internacional completo.</p>
        <div className={styles.AllowlistImport__field}><Label htmlFor={`${fieldId}-file`}>Archivo CSV de habilitados</Label><Input id={`${fieldId}-file`} type="file" accept={ALLOWLIST_IMPORT_FILE_ACCEPT} disabled={disabled || props.pending || props.unresolvedCount > 0 || !props.contactType} aria-describedby={`${fieldId}-file-help`} aria-invalid={Boolean(props.fieldError)} onChange={(event) => { const file = event.target.files?.[0]; if (file) { setOffset(0); props.onFile(file); } event.target.value = ""; }} /><p id={`${fieldId}-file-help`} className={styles.AllowlistImport__help}>{props.fileName ? `Archivo conservado: ${props.fileName}` : "Elegí el archivo para revisar su formato antes de crear la vista previa."}</p></div>
        {fieldError}
        {props.policyConflict && <Button type="button" variant="secondary" disabled={disabled} onClick={props.onReadPolicy}>Consultar configuración actual</Button>}
        {props.snapshot ? <p className={styles.AllowlistImport__help}>La vista previa de este archivo ya está creada. Elegí otro archivo si querés empezar de nuevo.</p>
          : <Checkbox id={`${fieldId}-preview-confirmed`} checked={props.confirmed} disabled={disabled || props.pending || !props.fileName || !props.contactType} label="Confirmo guardar esta vista previa temporal" description="La vista previa no agrega entradas." onCheckedChange={(value) => props.onConfirmChange(value === true)} />}
      </>,
      secondary: <Button type="button" variant="secondary" size="sm" disabled={disabled} onClick={props.onTemplate}>Descargar plantilla</Button>, secondaryLabel: "Plantilla del archivo",
    },
    {
      id: "review", title: "Revisar filas", description: "Marcá cada fila válida que querés incorporar. No se seleccionan filas automáticamente.", blockedReason: reviewReason,
      content: props.snapshot && <>
        <dl className={styles.AllowlistImport__counts}><div className={styles.AllowlistImport__count}><dt>Elegidas ahora</dt><dd>{props.selection.length}</dd></div><div className={styles.AllowlistImport__count}><dt>Agregadas</dt><dd>{props.snapshot.counts.added}</dd></div><div className={styles.AllowlistImport__count}><dt>Sin cambios</dt><dd>{props.snapshot.counts.unchanged}</dd></div><div className={styles.AllowlistImport__count}><dt>Omitidas</dt><dd>{props.snapshot.counts.skipped}</dd></div><div className={styles.AllowlistImport__count}><dt>Conflictos</dt><dd>{props.snapshot.counts.conflict}</dd></div></dl>
        <ul className={styles.AllowlistImport__rows}>{visibleRows.map((row) => <li className={styles.AllowlistImport__row} key={row.rowNumber}>
          <div className={styles.AllowlistImport__selection}><Checkbox id={`${fieldId}-row-${row.rowNumber}`} checked={selected.has(row.rowNumber)} disabled={disabled || pendingBlocks || terminal || row.errors.length > 0 || row.outcome !== undefined} onCheckedChange={(value) => props.onSelectRow(row.rowNumber, value === true)} /><Label htmlFor={`${fieldId}-row-${row.rowNumber}`}>Seleccionar fila {row.rowNumber}</Label></div>
          <div className={styles.AllowlistImport__identity}><strong>{row.identity || "Contacto vacío"}</strong>{row.displayName && <span>{row.displayName}</span>}<span className={styles.AllowlistImport__help}>{row.outcome ? ALLOWLIST_IMPORT_REPORT_OUTCOME_LABEL[row.outcome] : row.errors.length ? "Revisar datos" : "Válida pendiente"}{row.version !== undefined && ` · Versión de entrada ${row.version}`}</span>{row.errors.length > 0 && <span className={styles.AllowlistImport__error}>{row.errors.map((error) => ALLOWLIST_IMPORT_REPORT_ERROR_LABEL[error]).join(" · ")}</span>}</div>
        </li>)}</ul>
        {rows.length > ALLOWLIST_IMPORT_VISIBLE_ROW_COUNT && <nav className={styles.AllowlistImport__actions} aria-label="Páginas de filas importadas"><Button type="button" variant="secondary" disabled={props.busy || boundedOffset === 0} onClick={() => setOffset(Math.max(0, boundedOffset - ALLOWLIST_IMPORT_VISIBLE_ROW_COUNT))}>Filas anteriores</Button><span>Filas {boundedOffset + 1}–{Math.min(boundedOffset + ALLOWLIST_IMPORT_VISIBLE_ROW_COUNT, rows.length)} de {rows.length}</span><Button type="button" variant="secondary" disabled={props.busy || boundedOffset + ALLOWLIST_IMPORT_VISIBLE_ROW_COUNT >= rows.length} onClick={() => setOffset(boundedOffset + ALLOWLIST_IMPORT_VISIBLE_ROW_COUNT)}>Filas siguientes</Button></nav>}
        <p className={styles.AllowlistImport__help}>Versión {props.snapshot.sourceVersion}. Reporte disponible hasta <time dateTime={props.snapshot.expiresAt}>{props.snapshot.expiresAt.replace("T", " ").replace("Z", " UTC")}</time>; después de ese plazo no puede consultarse. Los resultados ya confirmados se conservan y no se repiten.</p>
      </>,
      secondary: progress, secondaryLabel: "Progreso y reporte",
    },
    {
      id: "confirm", title: "Confirmar e importar", description: "Revisá cuántas filas se incorporan antes de importarlas.", blockedReason: confirmReason,
      content: <>
        <p className={styles.AllowlistImport__summary}>{props.selection.length === 1 ? "Vas a incorporar 1 fila elegida." : `Vas a incorporar ${props.selection.length} filas elegidas.`}</p>
        <p className={styles.AllowlistImport__help}>La confirmación sólo incorpora filas válidas nuevas; no reemplaza toda la lista, reactiva entradas ni crea membresías.</p>
        {fieldError}
        {props.conflict && <Button type="button" variant="secondary" disabled={disabled} onClick={props.onReadCurrent}>Consultar progreso actual</Button>}
        <Checkbox id={`${fieldId}-rows-confirmed`} checked={props.confirmed} disabled={disabled || pendingBlocks || terminal || props.selection.length === 0 || props.conflict} label="Confirmo incorporar sólo las filas elegidas" onCheckedChange={(value) => props.onConfirmChange(value === true)} />
        <p className={styles.AllowlistImport__help}>El reporte neutraliza fórmulas y conserva HTML como texto. Es para lectura; no lo uses como archivo original para reimportar ni asumas que otra herramienta preserva su protección al guardarlo.</p>
      </>,
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
      {(!writing && (props.pending || props.unresolvedCount > 0) || reconciling) && <div className={styles.AllowlistImport__callout}>
        {unresolvedBlocks && <p role="status">{COPY.pendingBlocked}</p>}
        <div className={styles.AllowlistImport__actions}><Button type="button" variant="secondary" disabled={disabled} onClick={props.onReadOriginal}>Consultar operación original</Button>{(props.canReconcile || reconciling) && <Button type="button" variant="secondary" loading={reconciling} disabled={!reconciling && disabled} onClick={props.onReconcile}>Conciliar resultados anteriores</Button>}</div>
        {props.unresolvedCount > 0 && <span className={styles.AllowlistImport__help}>Confirmaciones anteriores por conciliar: {props.unresolvedCount}</span>}
      </div>}
      {props.hasSavedImport && !props.snapshot && <Button type="button" variant="secondary" disabled={disabled} onClick={props.onReadCurrent}>Consultar progreso actual</Button>}
      {!props.contactType && !props.snapshot && !props.hasSavedImport
        ? <EmptyState label={COPY.noPolicyTitle} title={COPY.noPolicyTitle} description={COPY.noPolicy} action={<ButtonLink href={props.policyHref} variant="primary" size="sm">{COPY.noPolicyAction}</ButtonLink>} />
        : <GuidedSteps label="Importar habilitados desde CSV" steps={steps} current={props.step} onCurrentChange={props.onStepChange} busy={disabled}
          finalAction={{ label: resumeLabel ? "Retomar filas pendientes" : "Importar filas elegidas", loading: confirmingRows, disabled: Boolean(confirmReason) || disabled && !confirmingRows, onRun: props.onConfirm }} />}
    </>}
  </section>;
}
