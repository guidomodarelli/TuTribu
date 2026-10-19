/** Presents only the leader-authorized history and emits explicit filter/pagination reads. @module admission-activity */
import { useId } from "react";
import { Button, EmptyState, Input, Select } from "@golfo/ui";
import type { AdmissionActivityPage } from "@/src/modules/academy-admissions/application/results/admission-activity-result";
import type { AdmissionActivityPageSelection } from "@/src/modules/academy-admissions/application/results/admission-activity-page-state";
import type { AdmissionActivityFilterDraft } from "@/src/modules/academy-admissions/application/commands/admission-activity-filter-draft";
import { ADMISSION_ACTIVITY_EVENT_LABELS, ADMISSION_ACTIVITY_RESOURCE_LABELS, ADMISSION_ACTIVITY_FILTER_ALL, ADMISSION_OBSERVATION_COPY } from "@/src/modules/academy-admissions/constants/admission-activity-labels";
import { ADMISSION_ERROR_MESSAGE } from "@/src/modules/academy-admissions/constants/admission-errors";
import type { AdmissionErrorCode } from "@/src/modules/academy-admissions/constants/admission-errors";
import { createAdmissionActivityDetailRows } from "@/lib/academy-admissions/admission-activity-view-model";
import { formatAdmissionObservationTime } from "@/lib/academy-admissions/admission-observation-format";
import styles from "./styles.module.scss";

/** No session, adapter or fetch enters this callback-only presenter. */
export type AdmissionActivityProps = {
  page: AdmissionActivityPage; selection: AdmissionActivityPageSelection; draft: AdmissionActivityFilterDraft;
  busy: boolean; validationMessage: string | null;
  onChange: (draft: AdmissionActivityFilterDraft) => void; onApply: () => void; onOlder: () => void;
};

/** @param props - Guarded history and distinct editable/applied selection. @returns Reconstructible original facts without overwriting current settings or rendering raw objects. */
export function AdmissionActivity(props: AdmissionActivityProps) {
  const instanceId = useId(), typeId = `${instanceId}-resource`, referenceId = `${instanceId}-reference`, validationId = `${instanceId}-validation`;
  return <section className={styles.AdmissionActivity} aria-labelledby={`${instanceId}-title`}>
    <header className={styles.AdmissionActivity__header}><h2 id={`${instanceId}-title`} className={styles.AdmissionActivity__title}>Historial de actividad</h2><p>Hechos originales de esta tribu. Sus versiones y configuraciones corresponden al momento del cambio.</p></header>
    <form className={styles.AdmissionActivity__form} onSubmit={(event) => { event.preventDefault(); if (!props.busy) props.onApply(); }}>
      <fieldset className={styles.AdmissionActivity__filters} disabled={props.busy}>
        <legend className={styles.AdmissionActivity__legend}>Filtrar historial</legend>
        <div className={styles.AdmissionActivity__field}><Select value={props.draft.resourceType} disabled={props.busy} onValueChange={(value) => props.onChange({ ...props.draft, resourceType: value })} id={typeId} label="Tipo de recurso" options={[{ value: ADMISSION_ACTIVITY_FILTER_ALL, label: "Todos los recursos" }, ...Object.entries(ADMISSION_ACTIVITY_RESOURCE_LABELS).map(([resourceType, label]) => ({ value: resourceType, label }))]} /></div>
        <div className={styles.AdmissionActivity__field}><label htmlFor={referenceId}>Referencia del recurso (opcional)</label><Input id={referenceId} value={props.draft.resourceId} disabled={props.busy} aria-invalid={Boolean(props.validationMessage)} aria-describedby={props.validationMessage ? validationId : undefined} onChange={(event) => props.onChange({ ...props.draft, resourceId: event.target.value })} /><p className={styles.AdmissionActivity__help}>Usá la referencia que figura en un hecho del historial. El filtro no concede acceso a otro recurso.</p></div>
      </fieldset>
      {props.validationMessage && <p id={validationId} role="alert" className={styles.AdmissionActivity__error}>{props.validationMessage}</p>}
      <Button type="submit" disabled={props.busy}>Aplicar filtros</Button>
    </form>
    <p className={styles.AdmissionActivity__help}>Filtros aplicados: {props.selection.resourceType ? ADMISSION_ACTIVITY_RESOURCE_LABELS[props.selection.resourceType] : "todos los recursos"}{props.selection.resourceId ? ` · ${props.selection.resourceId}` : ""}. Se muestran hasta {props.selection.limit} hechos por consulta.</p>
    {props.page.items.length ? <ol className={styles.AdmissionActivity__list}>{props.page.items.map((event) => {
      const cause = event.cause && Object.hasOwn(ADMISSION_ERROR_MESSAGE, event.cause) ? ADMISSION_ERROR_MESSAGE[event.cause as AdmissionErrorCode] : event.cause;
      const details = [
        { label: "Actor", value: event.actorUserId ?? ADMISSION_OBSERVATION_COPY.systemActor },
        { label: "Tribu", value: props.page.tribeId },
        { label: "Recurso", value: ADMISSION_ACTIVITY_RESOURCE_LABELS[event.resourceType] },
        { label: "Referencia del recurso", value: event.resourceId ?? ADMISSION_OBSERVATION_COPY.absent },
        { label: "Versión histórica", value: String(event.resourceVersion ?? ADMISSION_OBSERVATION_COPY.noVersion) },
        { label: "Regla aplicada", value: event.rule ?? ADMISSION_OBSERVATION_COPY.absent },
        { label: "Causa registrada", value: cause ?? ADMISSION_OBSERVATION_COPY.absent },
        { label: "Operación original", value: event.operationId ?? ADMISSION_OBSERVATION_COPY.absent },
        { label: "Operación de ciclo de vida", value: event.tribeLifecycleOperationId ?? ADMISSION_OBSERVATION_COPY.absent },
        ...createAdmissionActivityDetailRows(event.changes),
      ];
      return <li key={event.id} className={styles.AdmissionActivity__item}><details className={styles.AdmissionActivity__details}><summary className={styles.AdmissionActivity__summary}><span className={styles.AdmissionActivity__event}>{ADMISSION_ACTIVITY_EVENT_LABELS[event.eventType]}</span><time className={styles.AdmissionActivity__time} dateTime={event.createdAt}>{formatAdmissionObservationTime(event.createdAt)}</time></summary><dl className={styles.AdmissionActivity__facts}>{details.map((row, index) => <div className={styles.AdmissionActivity__fact} key={`${row.label}:${index}`}><dt className={styles.AdmissionActivity__term}>{row.label}</dt><dd className={styles.AdmissionActivity__value}>{row.value}</dd></div>)}</dl></details></li>;
    })}</ol> : <div role="status"><EmptyState label="Historial de actividad vacío" title="No hay eventos para los filtros aplicados." description="Probá con otro tipo de recurso o quitá la referencia." /></div>}
    {props.page.nextCursor && <Button type="button" variant="secondary" disabled={props.busy} onClick={props.onOlder}>Ver actividad anterior</Button>}
  </section>;
}
