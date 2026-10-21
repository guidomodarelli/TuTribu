"use client";
/** Presents the guided entry flow and the searchable list without session, transport, clocks or storage. @module allowlist-management */
import { useId } from "react";
import { Button, Checkbox, EmptyState, Input, Label, Select } from "@golfo/ui";
import { GuidedSteps, GuidedStepsDisclosure, type GuidedStep } from "@/components/forms/guided-steps";
import { ButtonLink } from "@/components/navigation/link";
import type { AllowlistEntryResult } from "@/src/modules/academy-admissions/application/results/admission-resource-result";
import type { AllowlistDraft } from "@/src/modules/academy-admissions/application/commands/allowlist-browser-intent";
import { ADMISSION_LIMIT } from "@/src/modules/academy-admissions/constants/admission-limits";
import { ADMISSION_QUERY_LIMIT } from "@/src/modules/academy-admissions/constants/admission-public-contract";
import { ALLOWLIST_ENTRY_STATUS } from "@/src/modules/academy-admissions/constants/admission-resources";
import { ALLOWLIST_FILTER_ALL, ALLOWLIST_STATUS_LABEL, ALLOWLIST_SOURCE_LABEL, ALLOWLIST_BROWSER_COPY } from "@/src/modules/academy-admissions/constants/allowlist-browser";
import { ADMISSION_CONTACT_TYPE } from "@/src/modules/academy-admissions/constants/admission-contact";
import { ALLOWLIST_FILTER_OPTIONS, ALLOWLIST_ENTRY_STATUS_OPTIONS } from "@/src/modules/academy-admissions/constants/allowlist-options";
import styles from "./styles.module.scss";

export type AllowlistManagementProps = { items: readonly AllowlistEntryResult[]; contactType: "email" | "phone" | null; /** Rules page where the leader saves the configuration the list depends on. */ policyHref: string; search: string; status: "enabled" | "disabled" | null; draft: AllowlistDraft; confirmed: boolean; ready: boolean; busy: boolean; writing: boolean; privateVisible: boolean; pending: boolean; hasNext: boolean; conflict: boolean; errorMessage: string | null; fieldError: string | null; step: number; onStepChange: (step: number) => void; onSearchChange: (value: string) => void; onStatusChange: (value: "enabled" | "disabled" | null) => void; onSearch: () => void; onNext: () => void; onSelect: (entry: AllowlistEntryResult) => void; onNew: () => void; onDraftChange: (draft: AllowlistDraft) => void; onConfirm: (value: boolean) => void; onSave: () => void; onReadOriginal: () => void; onReadCurrentEntry: () => void };

/** @param props - Controlled safe state and callbacks from one route-level workflow. @returns The entry flow first, then the list it edits; recoveries and filters stay out of the main path. */
export function AllowlistManagement(props: AllowlistManagementProps) {
  const fieldId = useId(), disabled = !props.ready || props.busy || props.pending, editing = props.draft.entryId !== null;
  const phone = props.contactType === ADMISSION_CONTACT_TYPE.phone;
  const contactLabel = phone ? "Teléfono de la entrada" : "Correo de la entrada";
  const contactReason = !props.contactType ? ALLOWLIST_BROWSER_COPY.noPolicy : !editing && !props.draft.identity.trim() ? ALLOWLIST_BROWSER_COPY.identityRequired : undefined;
  const unresolved = props.pending && !props.writing;
  const reviewReason = unresolved ? ALLOWLIST_BROWSER_COPY.pendingStepBlocked : props.conflict ? ALLOWLIST_BROWSER_COPY.conflictBlocked : !props.confirmed ? ALLOWLIST_BROWSER_COPY.confirmRequired : undefined;
  const steps: GuidedStep[] = [
    {
      id: "contact", title: "Contacto", description: editing ? "El contacto de una entrada existente no se cambia." : "Escribí el contacto que la lista va a habilitar.", blockedReason: contactReason,
      content: editing
        ? <dl className={styles.AllowlistManagement__facts}><div className={styles.AllowlistManagement__fact}><dt className={styles.AllowlistManagement__term}>{contactLabel}</dt><dd className={styles.AllowlistManagement__value}>{props.draft.identity}</dd></div></dl>
        : <>
          <div className={styles.AllowlistManagement__field}><Label htmlFor={`${fieldId}-identity`}>{contactLabel}</Label><Input id={`${fieldId}-identity`} type={phone ? "tel" : "email"} value={props.draft.identity} disabled={disabled || !props.contactType} aria-describedby={`${fieldId}-identity-help`} aria-invalid={Boolean(props.fieldError)} onChange={(event) => props.onDraftChange({ ...props.draft, identity: event.target.value })} /><p id={`${fieldId}-identity-help`} className={styles.AllowlistManagement__help}>Se conserva la coincidencia exacta después de normalizar el contacto.</p></div>
          {phone && <div className={styles.AllowlistManagement__field}><Label htmlFor={`${fieldId}-country`}>País del teléfono (código de dos letras)</Label><Input id={`${fieldId}-country`} value={props.draft.country} disabled={disabled} onChange={(event) => props.onDraftChange({ ...props.draft, country: event.target.value.toUpperCase() })} /><p className={styles.AllowlistManagement__help}>Podés dejarlo vacío si el prefijo internacional identifica un país inequívoco.</p></div>}
        </>,
      secondary: editing ? <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={props.onNew}>Descartar la edición y agregar otra entrada</Button> : undefined,
    },
    {
      id: "details", title: editing ? "Nombre y estado" : "Nombre", description: editing ? "Cambiá el nombre orientativo o deshabilitá la entrada." : "Agregá un nombre orientativo si te ayuda a reconocer la entrada.",
      content: <>
        <div className={styles.AllowlistManagement__field}><Label htmlFor={`${fieldId}-name`}>Nombre orientativo (opcional)</Label><Input id={`${fieldId}-name`} value={props.draft.displayName} maxLength={ADMISSION_LIMIT.displayNameCharacters} disabled={disabled} onChange={(event) => props.onDraftChange({ ...props.draft, displayName: event.target.value })} /></div>
        {editing && <><div className={styles.AllowlistManagement__field}><Select value={props.draft.status} disabled={disabled} onValueChange={(value) => props.onDraftChange({ ...props.draft, status: value === ALLOWLIST_ENTRY_STATUS.enabled ? ALLOWLIST_ENTRY_STATUS.enabled : ALLOWLIST_ENTRY_STATUS.disabled })} id={`${fieldId}-status`} label="Estado de esta entrada" options={ALLOWLIST_ENTRY_STATUS_OPTIONS} /></div>
          <p className={styles.AllowlistManagement__help}>Deshabilitar afecta nuevos ingresos que dependan de esta entrada. No expulsa miembros ni libera un contacto vinculado; la gestión de membresía es una acción separada.</p></>}
      </>,
    },
    {
      id: "review", title: editing ? "Revisá y guardá" : "Revisá y agregá", description: "Esto es lo que se va a guardar. Podés volver atrás para cambiarlo.", blockedReason: reviewReason,
      content: <>
        <dl className={styles.AllowlistManagement__facts}>
          <div className={styles.AllowlistManagement__fact}><dt className={styles.AllowlistManagement__term}>{contactLabel}</dt><dd className={styles.AllowlistManagement__value}>{props.draft.identity || "Sin contacto"}{phone && !editing && props.draft.country ? ` (${props.draft.country})` : ""}</dd></div>
          <div className={styles.AllowlistManagement__fact}><dt className={styles.AllowlistManagement__term}>Nombre orientativo</dt><dd className={styles.AllowlistManagement__value}>{props.draft.displayName.trim() || "Sin nombre"}</dd></div>
          <div className={styles.AllowlistManagement__fact}><dt className={styles.AllowlistManagement__term}>Estado</dt><dd className={styles.AllowlistManagement__value}>{ALLOWLIST_STATUS_LABEL[props.draft.status]}</dd></div>
        </dl>
        <p className={styles.AllowlistManagement__help}>Agregar o cambiar una entrada no crea membresía ni comprueba el contacto de una cuenta.</p>
        {props.fieldError && <p role="alert" className={styles.AllowlistManagement__error}>{props.fieldError}</p>}
        {props.conflict && <Button type="button" variant="secondary" disabled={props.busy} onClick={props.onReadCurrentEntry}>Consultar versión actual</Button>}
        <Checkbox id={`${fieldId}-confirmed`} checked={props.confirmed} disabled={disabled || !props.contactType || props.conflict} label="Confirmo el cambio de esta entrada de lista" onCheckedChange={(value) => props.onConfirm(value === true)} />
      </>,
    },
  ];

  return <section className={styles.AllowlistManagement} aria-label="Gestión de lista de habilitados" aria-busy={props.busy}>
    <p className={styles.AllowlistManagement__help}>La lista habilita coincidencias futuras según las reglas de admisión.</p>
    {!props.privateVisible ? <p role="alert">{props.errorMessage ?? ALLOWLIST_BROWSER_COPY.account}</p> : <>
      <section className={styles.AllowlistManagement__editor} aria-labelledby={`${fieldId}-editor`}>
        <h2 id={`${fieldId}-editor`}>{editing ? "Editar entrada" : "Agregar entrada"}</h2>
        {props.errorMessage && <p role="alert" className={styles.AllowlistManagement__error}>{props.errorMessage}</p>}
        {unresolved && <div className={styles.AllowlistManagement__callout}><p role="status">{ALLOWLIST_BROWSER_COPY.pendingBlocked}</p><Button type="button" variant="secondary" disabled={props.busy} onClick={props.onReadOriginal}>Consultar operación original</Button></div>}
        {!props.contactType && !editing
          ? <EmptyState label={ALLOWLIST_BROWSER_COPY.noPolicyTitle} title={ALLOWLIST_BROWSER_COPY.noPolicyTitle} description={ALLOWLIST_BROWSER_COPY.noPolicy} action={<ButtonLink href={props.policyHref} variant="primary" size="sm">{ALLOWLIST_BROWSER_COPY.noPolicyAction}</ButtonLink>} />
          : <GuidedSteps label={editing ? "Editar entrada de la lista" : "Agregar entrada a la lista"} steps={steps} current={props.step} onCurrentChange={props.onStepChange} busy={disabled}
          finalAction={{ label: editing ? "Guardar entrada" : "Agregar entrada", loading: props.writing, disabled: Boolean(reviewReason) || !props.contactType, onRun: props.onSave }} />}
      </section>
      <section className={styles.AllowlistManagement__entries} aria-labelledby={`${fieldId}-entries`}><h2 id={`${fieldId}-entries`}>Entradas de la lista</h2>
        <GuidedStepsDisclosure summary="Buscar y filtrar entradas">
          <form className={styles.AllowlistManagement__filters} onSubmit={(event) => { event.preventDefault(); if (!disabled) props.onSearch(); }}>
            <div className={styles.AllowlistManagement__field}><Label htmlFor={`${fieldId}-search`}>Buscar contacto o nombre</Label><Input id={`${fieldId}-search`} value={props.search} maxLength={ADMISSION_QUERY_LIMIT.searchCharacters} disabled={disabled} onChange={(event) => props.onSearchChange(event.target.value)} /></div>
            <div className={styles.AllowlistManagement__field}><Select value={props.status ?? ALLOWLIST_FILTER_ALL} disabled={disabled} onValueChange={(value) => props.onStatusChange(value === ALLOWLIST_FILTER_ALL ? null : value === ALLOWLIST_ENTRY_STATUS.enabled ? ALLOWLIST_ENTRY_STATUS.enabled : ALLOWLIST_ENTRY_STATUS.disabled)} id={`${fieldId}-filter`} label="Estado de las entradas" options={ALLOWLIST_FILTER_OPTIONS} /></div>
            <Button type="submit" variant="secondary" disabled={disabled}>Buscar</Button>
          </form>
        </GuidedStepsDisclosure>
        {props.items.length === 0 ? <EmptyState label="Lista de habilitados vacía" title="No hay entradas con estos filtros." description="Agregá una entrada o importá un CSV; también podés cambiar la búsqueda." /> : <ul className={styles.AllowlistManagement__list}>{props.items.map((entry) => <li className={styles.AllowlistManagement__row} key={entry.id}><div className={styles.AllowlistManagement__identity}><strong>{entry.identity}</strong>{entry.displayName && <span>{entry.displayName}</span>}<span className={styles.AllowlistManagement__help}>{ALLOWLIST_STATUS_LABEL[entry.status]} · {ALLOWLIST_SOURCE_LABEL[entry.source]} · Versión {entry.version}</span></div><Button type="button" variant="secondary" size="sm" disabled={disabled} onClick={() => props.onSelect(entry)} aria-label={`Editar ${entry.identity}`}>Editar</Button></li>)}</ul>}
        {props.hasNext && <div className={styles.AllowlistManagement__actions}><Button type="button" variant="secondary" disabled={disabled} onClick={props.onNext}>Ver más entradas</Button></div>}
      </section>
    </>}
  </section>;
}
