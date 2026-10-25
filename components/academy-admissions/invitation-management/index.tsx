"use client";
/** Presents the guided invitation actions and their private history without adapters or session lookups. @module invitation-management */
import { useEffect, useId, useRef } from "react";
import { Button, Checkbox, EmptyState, Input, Label, Select, Textarea } from "@golfo/ui";
import { GuidedSteps, GuidedStepsDisclosure, type GuidedStep } from "@/components/forms/guided-steps";
import type { PersonalInvitationManagementDraft } from "@/src/modules/academy-admissions/application/commands/personal-invitation-management-intent";
import type { PersonalInvitationManagementResult } from "@/src/modules/academy-admissions/application/results/admission-resource-result";
import { ADMISSION_LIMIT } from "@/src/modules/academy-admissions/constants/admission-limits";
import { PERSONAL_INVITATION_MANAGEMENT_COPY as COPY, PERSONAL_INVITATION_MANAGEMENT_MODE as MODE, PERSONAL_INVITATION_MANAGEMENT_STATUS_LABEL } from "@/src/modules/academy-admissions/constants/personal-invitation-management-browser";
import styles from "./styles.module.scss";

/** `busy` covers every read and write; `writing` only the explicit save, which keeps its label while it shows progress. */
export type InvitationManagementProps = { draft: PersonalInvitationManagementDraft; items: readonly PersonalInvitationManagementResult[]; contactType: "email" | "phone" | null; requiresAdditionalVerification: boolean; hasUsableAllowlist: boolean; allowedCountries: readonly string[]; ready: boolean; busy: boolean; writing: boolean; privateVisible: boolean; pending: boolean; confirmed: boolean; conflict: boolean; needsCurrent: boolean; selectionBlocked: boolean; onDiscardSelection: () => void; hasNext: boolean; errorMessage: string | null; fieldError: string | null; statusMessage: string | null; invitationUrl: string | null; step: number; onStepChange: (step: number) => void; onDraftChange: (value: PersonalInvitationManagementDraft) => void; onConfirm: (value: boolean) => void; onSave: () => void; onSelect: (item: PersonalInvitationManagementResult, mode: "create" | "rename" | "revoke") => void; onNew: () => void; onReadOriginal: () => void; onReadCurrent: () => void; onNext: () => void; onHideUrl: () => void; onCopyUrl: () => void };

/** @param props - Controlled current state and explicit callbacks. @returns One guided action at a time, then the history it acts on; reads stay collapsed. */
export function InvitationManagement(props: InvitationManagementProps) {
  const id = useId(), feedback = useRef<HTMLParagraphElement>(null), disabled = !props.ready || props.busy || props.pending, draft = props.draft;
  const create = draft.mode === MODE.create, revoke = draft.mode === MODE.revoke, replacing = create && draft.replaceSelected;
  const cannotCreate = !props.contactType || props.contactType === "phone" && !props.requiresAdditionalVerification;
  const change = (patch: Partial<PersonalInvitationManagementDraft>) => props.onDraftChange({ ...draft, ...patch });
  useEffect(() => { if (props.errorMessage || props.fieldError) feedback.current?.focus(); }, [props.errorMessage, props.fieldError]);
  // A write in flight is not an unresolved original yet; only a settled one blocks the flow.
  const unresolved = props.pending && !props.writing;
  const reviewReason = unresolved ? COPY.pendingStepBlocked : props.conflict ? COPY.conflictBlocked : props.needsCurrent ? COPY.currentRequired : create && cannotCreate ? (props.contactType ? COPY.phoneOff : COPY.noPolicy) : replacing && !draft.replacementAcknowledged ? COPY.replacementRequired : !props.confirmed ? COPY.confirmRequired : undefined;
  const title = replacing ? "Reemitir invitación" : create ? "Emitir invitación personal" : revoke ? draft.selected?.status === "redeemed" ? "Retirar autorización" : "Revocar invitación" : "Renombrar invitación";
  const finalLabel = replacing ? "Reemitir invitación" : create ? "Emitir invitación" : revoke ? draft.selected?.status === "redeemed" ? "Retirar autorización" : "Revocar invitación" : "Guardar nombre";
  const startOver = draft.selected && <Button type="button" variant="ghost" size="sm" disabled={disabled || props.conflict} onClick={props.onNew}>Descartar y emitir una invitación nueva</Button>;
  const nameField = <div className={styles.InvitationManagement__field}><Label htmlFor={`${id}-name`}>Nombre interno</Label><Input id={`${id}-name`} value={draft.internalName} maxLength={ADMISSION_LIMIT.displayNameCharacters} disabled={disabled} onChange={(event) => change({ internalName: event.target.value })} /></div>;

  const review: GuidedStep = {
    id: "review", title: create ? "Revisá y emití" : "Revisá y guardá", description: "Esto es lo que se va a guardar. Podés volver atrás para cambiarlo.", blockedReason: reviewReason,
    content: <>
      <dl className={styles.InvitationManagement__facts}>
        {!revoke && <div className={styles.InvitationManagement__fact}><dt className={styles.InvitationManagement__term}>Nombre interno</dt><dd className={styles.InvitationManagement__value}>{draft.internalName.trim() || "Sin nombre"}</dd></div>}
        {(create || draft.selected) && <div className={styles.InvitationManagement__fact}><dt className={styles.InvitationManagement__term}>Destinatario</dt><dd className={styles.InvitationManagement__value}>{draft.identity || "Sin destinatario"}{props.contactType === "phone" && draft.country ? ` (${draft.country})` : ""}</dd></div>}
        {create && <div className={styles.InvitationManagement__fact}><dt className={styles.InvitationManagement__term}>Lista de habilitados</dt><dd className={styles.InvitationManagement__value}>{draft.requiresAllowlist ? "Exige coincidencia" : "Dispensada"}</dd></div>}
        {create && <div className={styles.InvitationManagement__fact}><dt className={styles.InvitationManagement__term}>Vencimiento del enlace</dt><dd className={styles.InvitationManagement__value}>{draft.noExpiry ? "Sin vencimiento" : draft.expiry ? `${draft.expiry.replace("T", " ")} (UTC)` : "Sin elegir"}</dd></div>}
        {revoke && draft.selected && <div className={styles.InvitationManagement__fact}><dt className={styles.InvitationManagement__term}>Invitación</dt><dd className={styles.InvitationManagement__value}>{draft.selected.internalName}, versión {draft.selected.version}</dd></div>}
      </dl>
      {replacing && draft.selected && <Checkbox id={`${id}-replacement`} checked={draft.replacementAcknowledged} disabled={disabled} label={`Confirmo revocar ${draft.selected.internalName} en su versión ${draft.selected.version} y emitir otra invitación.`} onCheckedChange={(value) => change({ replacementAcknowledged: value === true })} />}
      {(props.fieldError || props.errorMessage) && <p ref={feedback} role="alert" tabIndex={-1} className={styles.InvitationManagement__error}>{props.fieldError ?? props.errorMessage}</p>}
      <Checkbox id={`${id}-confirmed`} checked={props.confirmed} disabled={disabled || props.conflict || props.needsCurrent || create && cannotCreate} label="Confirmo esta acción sobre la invitación personal." onCheckedChange={(value) => props.onConfirm(value === true)} />
    </>,
  };

  const createSteps: GuidedStep[] = [
    {
      id: "recipient", title: "Destinatario", description: "Cada invitación corresponde a un destinatario, que queda fijo.", blockedReason: cannotCreate ? (props.contactType ? COPY.phoneOff : COPY.noPolicy) : !draft.internalName.trim() || !draft.identity.trim() ? COPY.recipientRequired : undefined,
      content: <>
        {nameField}
        <div className={styles.InvitationManagement__field}><Label htmlFor={`${id}-recipient`}>{props.contactType === "phone" ? "Teléfono destinatario" : "Correo destinatario"}</Label><Input id={`${id}-recipient`} type={props.contactType === "phone" ? "tel" : "email"} value={draft.identity} disabled={disabled || cannotCreate || draft.replaceSelected} aria-describedby={`${id}-recipient-help`} onChange={(event) => change({ identity: event.target.value })} /><p id={`${id}-recipient-help`} className={styles.InvitationManagement__help}>Cambiar contacto, requisito de lista o vigencia exige otra emisión.</p></div>
        {props.contactType === "phone" && <div className={styles.InvitationManagement__field}><Select value={draft.country} disabled={disabled || cannotCreate || draft.replaceSelected} onValueChange={(country) => change({ country })} id={`${id}-country`} label="País del teléfono" options={props.allowedCountries.map((country) => ({ value: country, label: country }))} placeholder="Elegí un país habilitado" /><p className={styles.InvitationManagement__help}>Ingresá un teléfono con prefijo internacional y un país habilitado por la academia.</p></div>}
      </>,
      secondary: startOver || undefined,
    },
    {
      id: "allowlist", title: "Lista de habilitados", description: "Decidí si el destinatario también tiene que estar en la lista.", blockedReason: !draft.requiresAllowlist && !draft.exemptionAcknowledged ? COPY.exemptionRequired : undefined,
      content: <>
        <Checkbox id={`${id}-list`} checked={draft.requiresAllowlist} disabled={disabled || !props.hasUsableAllowlist && !draft.requiresAllowlist} label="Exigir coincidencia en la lista de habilitados" onCheckedChange={(value) => change({ requiresAllowlist: value === true, exemptionAcknowledged: false })} />
        {!props.hasUsableAllowlist && <p className={styles.InvitationManagement__help}>No hay una lista utilizable para este tipo de contacto. La dispensa requiere reconocimiento explícito.</p>}
        {!draft.requiresAllowlist && <Checkbox id={`${id}-exemption`} checked={draft.exemptionAcknowledged} disabled={disabled} label="Reconozco la dispensa de lista; se conservan la prueba del destinatario, los códigos exigibles, la revisión manual y los bloqueos." onCheckedChange={(value) => change({ exemptionAcknowledged: value === true })} />}
      </>,
    },
    {
      id: "expiry", title: "Vencimiento", description: "Elegí hasta cuándo se puede usar el enlace.", blockedReason: draft.noExpiry ? (!draft.noExpiryAcknowledged ? COPY.noExpiryRequired : undefined) : !draft.expiry ? COPY.expiryRequired : undefined,
      content: <>
        <div className={styles.InvitationManagement__field}><Label htmlFor={`${id}-expiry`}>Vencimiento del enlace (fecha y hora UTC)</Label><Input id={`${id}-expiry`} type="datetime-local" value={draft.expiry} disabled={disabled || draft.noExpiry} onChange={(event) => change({ expiry: event.target.value })} /><p className={styles.InvitationManagement__help}>La propuesta inicial tiene siete días de vigencia. El vencimiento del enlace no cambia el plazo de una solicitud ya canjeada.</p></div>
        <Checkbox id={`${id}-no-expiry`} checked={draft.noExpiry} disabled={disabled} label="Sin vencimiento" onCheckedChange={(value) => change({ noExpiry: value === true, noExpiryAcknowledged: false })} />
        {draft.noExpiry && <Checkbox id={`${id}-no-expiry-ack`} checked={draft.noExpiryAcknowledged} disabled={disabled} label="Reconozco que el enlace seguirá utilizable hasta su canje o revocación." onCheckedChange={(value) => change({ noExpiryAcknowledged: value === true })} />}
      </>,
    },
    review,
  ];
  const renameSteps: GuidedStep[] = [
    { id: "name", title: "Nombre interno", description: "El nombre sólo lo ves vos; el enlace y el destinatario no cambian.", blockedReason: !draft.internalName.trim() ? COPY.nameRequired : undefined, content: nameField, secondary: startOver || undefined },
    review,
  ];
  const revokeSteps: GuidedStep[] = [
    {
      id: "reason", title: "Motivo", description: draft.selected ? `Se revoca la versión ${draft.selected.version} de ${draft.selected.internalName}.` : undefined, blockedReason: !draft.internalReason.trim() ? COPY.reasonRequired : draft.selected?.status === "redeemed" && !draft.withdrawalAcknowledged ? COPY.withdrawalRequired : undefined,
      content: <>
        <div className={styles.InvitationManagement__field}><Label htmlFor={`${id}-reason`}>Motivo interno</Label><Textarea id={`${id}-reason`} value={draft.internalReason} maxLength={ADMISSION_LIMIT.internalMessageCharacters} disabled={disabled} onChange={(event) => change({ internalReason: event.target.value })} /></div>
        {draft.selected?.status === "redeemed" && <Checkbox id={`${id}-withdrawal`} checked={draft.withdrawalAcknowledged} disabled={disabled} label="Confirmo retirar la autorización canjeada. Si su solicitud sigue pendiente, se cancela; un miembro admitido no se expulsa y el enlace no se recicla." onCheckedChange={(value) => change({ withdrawalAcknowledged: value === true })} />}
      </>,
      secondary: startOver || undefined,
    },
    review,
  ];
  const steps = create ? createSteps : revoke ? revokeSteps : renameSteps;

  return <section className={styles.InvitationManagement} aria-label="Gestión de invitaciones personales" aria-busy={props.busy}>
    {!props.privateVisible ? <p role="alert">{COPY.account}</p> : <>
      <p className={styles.InvitationManagement__help}>Abrir el enlace o comprobar un código no lo canjea. Solo el líder puede gestionar estas invitaciones.</p>
      {props.invitationUrl && <section className={styles.InvitationManagement__link} aria-labelledby={`${id}-link-title`}><h2 id={`${id}-link-title`}>Enlace recién emitido</h2><p>Copialo ahora. El enlace completo se muestra una sola vez y no se recupera desde el historial. Si perdés esta respuesta, revocá la invitación y emití otra.</p><Label htmlFor={`${id}-link`}>Enlace personal</Label><Input id={`${id}-link`} readOnly value={props.invitationUrl} onFocus={(event) => event.currentTarget.select()} /><div className={styles.InvitationManagement__actions}><Button type="button" onClick={props.onCopyUrl}>Copiar enlace</Button><Button type="button" variant="secondary" onClick={props.onHideUrl}>Ocultar enlace</Button></div></section>}
      <section className={styles.InvitationManagement__editor} aria-labelledby={`${id}-editor`}>
        <h2 id={`${id}-editor`}>{title}</h2>
        {props.statusMessage && <p role="status" className={styles.InvitationManagement__help}>{props.statusMessage}</p>}
        {unresolved && <div className={styles.InvitationManagement__callout}><p role="status">{COPY.pendingBlocked}</p><Button type="button" variant="secondary" disabled={props.busy} onClick={props.onReadOriginal}>Consultar operación original</Button></div>}
        {!unresolved && (props.selectionBlocked || props.needsCurrent) && <div className={styles.InvitationManagement__callout}><p role="status">{COPY.currentRequired}</p><div className={styles.InvitationManagement__actions}><Button type="button" variant="secondary" disabled={props.busy} onClick={props.onReadCurrent}>Consultar estado actual</Button>{props.selectionBlocked && <Button type="button" variant="secondary" disabled={props.busy || props.pending} onClick={props.onDiscardSelection}>Descartar selección</Button>}</div></div>}
        <GuidedSteps label={title} steps={steps} current={props.step} onCurrentChange={props.onStepChange} busy={disabled}
          finalAction={{ label: finalLabel, loading: props.writing, disabled: Boolean(reviewReason), onRun: props.onSave }} />
      </section>
      <section className={styles.InvitationManagement__history} aria-labelledby={`${id}-history`}><h2 id={`${id}-history`}>Historial de invitaciones</h2>
        {props.items.length === 0 ? <EmptyState label="Historial de invitaciones vacío" title="Todavía no hay invitaciones en esta vista." description="Emití una invitación personal para que una persona pueda pedir ingreso con su enlace." /> : <ul className={styles.InvitationManagement__list}>{props.items.map((item) => <li key={item.id} className={styles.InvitationManagement__row}><div className={styles.InvitationManagement__identity}><strong>{item.internalName}</strong><span>{item.recipient.value}</span><span>{PERSONAL_INVITATION_MANAGEMENT_STATUS_LABEL[item.status]}{item.authorizationRevokedAt ? " · Autorización retirada" : ""} · Versión {item.version}</span><span className={styles.InvitationManagement__help}>{item.requiresAllowlist ? "Exige lista de habilitados" : "Dispensa la lista"} · {item.expiresAt ? `Vigencia del enlace: ${item.expiresAt} (UTC)` : "Sin vencimiento del enlace"}</span>{item.redeemedAt && <span className={styles.InvitationManagement__help}>Canje: {item.redeemedAt} (UTC)</span>}</div><div className={styles.InvitationManagement__actions}><Button type="button" variant="secondary" size="sm" disabled={disabled || props.conflict} onClick={() => props.onSelect(item, MODE.rename)} aria-label={`Renombrar ${item.internalName}`}>Renombrar</Button>{item.status === "active" && <Button type="button" variant="secondary" size="sm" disabled={disabled || props.conflict} onClick={() => props.onSelect(item, MODE.create)} aria-label={`Reemitir ${item.internalName}`}>Reemitir</Button>}{(item.status === "active" || item.status === "redeemed" && !item.authorizationRevokedAt) && <Button type="button" variant="secondary" size="sm" disabled={disabled || props.conflict} onClick={() => props.onSelect(item, MODE.revoke)} aria-label={`Revocar ${item.internalName}`}>{item.status === "redeemed" ? "Retirar autorización" : "Revocar"}</Button>}</div></li>)}</ul>}
        <GuidedStepsDisclosure summary="Consultar y ver más">
          {!(props.selectionBlocked || props.needsCurrent) && <Button type="button" variant="secondary" size="sm" disabled={props.busy || props.pending} onClick={props.onReadCurrent}>Consultar estado actual</Button>}
          {props.hasNext && <Button type="button" variant="secondary" size="sm" disabled={disabled} onClick={props.onNext}>Ver más invitaciones</Button>}
        </GuidedStepsDisclosure>
      </section>
    </>}
  </section>;
}
