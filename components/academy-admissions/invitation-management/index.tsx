"use client";
/** Presents the guided invitation actions and their private history without adapters or session lookups. @module invitation-management */
import { useEffect, useId, useRef } from "react";
import { Button, EmptyState, Input, Label } from "@golfo/ui";
import { GuidedSteps, GuidedStepsDisclosure } from "@/components/forms/guided-steps";
import type { PersonalInvitationManagementDraft } from "@/src/modules/academy-admissions/application/commands/personal-invitation-management-intent";
import type { PersonalInvitationManagementResult } from "@/src/modules/academy-admissions/application/results/admission-resource-result";
import { PERSONAL_INVITATION_MANAGEMENT_COPY as COPY, PERSONAL_INVITATION_MANAGEMENT_MODE as MODE, PERSONAL_INVITATION_MANAGEMENT_STATUS_LABEL } from "@/src/modules/academy-admissions/constants/personal-invitation-management-browser";
import { formatBuenosAiresDateTime } from "@/lib/date-time/buenos-aires-format";
import { invitationLabels, invitationReviewBlockedReason, invitationSteps } from "./invitation-steps";
import styles from "./styles.module.scss";

/** `busy` covers every read and write; `writing` only the explicit save, which keeps its label while it shows progress. */
export type InvitationManagementProps = { draft: PersonalInvitationManagementDraft; items: readonly PersonalInvitationManagementResult[]; contactType: "email" | "phone" | null; requiresAdditionalVerification: boolean; hasUsableAllowlist: boolean; allowedCountries: readonly string[]; ready: boolean; busy: boolean; writing: boolean; privateVisible: boolean; pending: boolean; confirmed: boolean; conflict: boolean; needsCurrent: boolean; selectionBlocked: boolean; onDiscardSelection: () => void; hasNext: boolean; /** «Ver más» in progress: the shown invitations stay and only its button reports progress. */ loadingMore: boolean; /** Failure of «Ver más», shown next to its button. */ moreError: string | null; errorMessage: string | null; fieldError: string | null; statusMessage: string | null; invitationUrl: string | null; step: number; onStepChange: (step: number) => void; onDraftChange: (value: PersonalInvitationManagementDraft) => void; onConfirm: (value: boolean) => void; onSave: () => void; onSelect: (item: PersonalInvitationManagementResult, mode: "create" | "rename" | "revoke") => void; onNew: () => void; onReadOriginal: () => void; onReadCurrent: () => void; onNext: () => void; onHideUrl: () => void; onCopyUrl: () => void };

/** @param props - Field ids prefix, the issued link and its actions. @returns The link issued now, shown only once, with its copy and hide actions. */
function IssuedInvitationLink({ id, url, onCopyUrl, onHideUrl }: { id: string; url: string; onCopyUrl: () => void; onHideUrl: () => void }) {
  return <section className={styles.InvitationManagement__link} aria-labelledby={`${id}-link-title`}><h2 id={`${id}-link-title`}>Enlace recién emitido</h2><p>Copialo ahora. El enlace completo se muestra una sola vez y no se recupera desde el historial. Si perdés esta respuesta, revocá la invitación y emití otra.</p><Label htmlFor={`${id}-link`}>Enlace personal</Label><Input id={`${id}-link`} readOnly value={url} onFocus={(event) => event.currentTarget.select()} /><div className={styles.InvitationManagement__actions}><Button type="button" onClick={onCopyUrl}>Copiar enlace</Button><Button type="button" variant="secondary" onClick={onHideUrl}>Ocultar enlace</Button></div></section>;
}

/** @param props - One invitation, whether its actions wait and the selection callback. @returns The history row with its facts and the rename, reissue and revoke actions it allows. */
function InvitationHistoryItem({ item, disabled, onSelect }: { item: PersonalInvitationManagementResult; disabled: boolean; onSelect: InvitationManagementProps["onSelect"] }) {
  return <li className={styles.InvitationManagement__row}><div className={styles.InvitationManagement__identity}><strong>{item.internalName}</strong><span>{item.recipient.value}</span><span>{PERSONAL_INVITATION_MANAGEMENT_STATUS_LABEL[item.status]}{item.authorizationRevokedAt ? " · Autorización retirada" : ""} · Versión {item.version}</span><span className={styles.InvitationManagement__help}>{item.requiresAllowlist ? "Exige lista de habilitados" : "Dispensa la lista"} · {item.expiresAt ? `Vigencia del enlace: ${formatBuenosAiresDateTime(item.expiresAt)}` : "Sin vencimiento del enlace"}</span>{item.redeemedAt && <span className={styles.InvitationManagement__help}>Canje: {formatBuenosAiresDateTime(item.redeemedAt)}</span>}</div><div className={styles.InvitationManagement__actions}><Button type="button" variant="secondary" size="sm" disabled={disabled} onClick={() => onSelect(item, MODE.rename)} aria-label={`Renombrar ${item.internalName}`}>Renombrar</Button>{item.status === "active" && <Button type="button" variant="secondary" size="sm" disabled={disabled} onClick={() => onSelect(item, MODE.create)} aria-label={`Reemitir ${item.internalName}`}>Reemitir</Button>}{(item.status === "active" || item.status === "redeemed" && !item.authorizationRevokedAt) && <Button type="button" variant="secondary" size="sm" disabled={disabled} onClick={() => onSelect(item, MODE.revoke)} aria-label={`Revocar ${item.internalName}`}>{item.status === "redeemed" ? "Retirar autorización" : "Revocar"}</Button>}</div></li>;
}

/** @param props - Listed invitations, paging state and callbacks. @param id - Prefix of the field ids. @param disabled - Whether controls wait. @returns The private invitation history with its reads collapsed. */
function InvitationHistory({ props, id, disabled }: { props: InvitationManagementProps; id: string; disabled: boolean }) {
  return <section className={styles.InvitationManagement__history} aria-labelledby={`${id}-history`}><h2 id={`${id}-history`}>Historial de invitaciones</h2>
    {props.items.length === 0 ? <EmptyState label="Historial de invitaciones vacío" title="Todavía no hay invitaciones en esta vista." description="Emití una invitación personal para que una persona pueda pedir ingreso con su enlace." /> : <ul className={styles.InvitationManagement__list}>{props.items.map((item) => <InvitationHistoryItem key={item.id} item={item} disabled={disabled || props.conflict} onSelect={props.onSelect} />)}</ul>}
    <GuidedStepsDisclosure summary="Consultar y ver más">
      {!(props.selectionBlocked || props.needsCurrent) && <Button type="button" variant="secondary" size="sm" disabled={props.busy || props.pending} onClick={props.onReadCurrent}>Consultar estado actual</Button>}
      {props.hasNext && <Button type="button" variant="secondary" size="sm" loading={props.loadingMore} disabled={disabled && !props.loadingMore} onClick={props.onNext}>Ver más invitaciones</Button>}
      {props.moreError && <p role="alert" className={styles.InvitationManagement__error}>{props.moreError}</p>}
    </GuidedStepsDisclosure>
  </section>;
}

/** @param props - Controlled current state and explicit callbacks. @returns One guided action at a time, then the history it acts on; reads stay collapsed. */
export function InvitationManagement(props: InvitationManagementProps) {
  const id = useId(), feedback = useRef<HTMLParagraphElement>(null), disabled = !props.ready || props.busy || props.pending, draft = props.draft;
  const create = draft.mode === MODE.create, revoke = draft.mode === MODE.revoke, replacing = create && draft.replaceSelected;
  const cannotCreate = !props.contactType || props.contactType === "phone" && !props.requiresAdditionalVerification;
  const change = (patch: Partial<PersonalInvitationManagementDraft>) => props.onDraftChange({ ...draft, ...patch });
  useEffect(() => { if (props.errorMessage || props.fieldError) feedback.current?.focus(); }, [props.errorMessage, props.fieldError]);
  // A write in flight is not an unresolved original yet; only a settled one blocks the flow.
  const unresolved = props.pending && !props.writing;
  const reviewReason = invitationReviewBlockedReason(props, { unresolved, create, replacing, cannotCreate });
  const { title, finalLabel } = invitationLabels(draft, { create, revoke, replacing });
  const feedbackMessage = (props.fieldError || props.errorMessage) && <p ref={feedback} role="alert" tabIndex={-1} className={styles.InvitationManagement__error}>{props.fieldError ?? props.errorMessage}</p>;
  const steps = invitationSteps({ props, id, disabled, create, revoke, replacing, cannotCreate, reviewReason, feedback: feedbackMessage, change });

  return <section className={styles.InvitationManagement} aria-label="Gestión de invitaciones personales" aria-busy={props.busy}>
    {!props.privateVisible ? <p role="alert">{COPY.account}</p> : <>
      <p className={styles.InvitationManagement__help}>Abrir el enlace o comprobar un código no lo canjea. Solo el líder puede gestionar estas invitaciones.</p>
      {props.invitationUrl && <IssuedInvitationLink id={id} url={props.invitationUrl} onCopyUrl={props.onCopyUrl} onHideUrl={props.onHideUrl} />}
      <section className={styles.InvitationManagement__editor} aria-labelledby={`${id}-editor`}>
        <h2 id={`${id}-editor`}>{title}</h2>
        {props.statusMessage && <p role="status" className={styles.InvitationManagement__help}>{props.statusMessage}</p>}
        {unresolved && <div className={styles.InvitationManagement__callout}><p role="status">{COPY.pendingBlocked}</p><Button type="button" variant="secondary" disabled={props.busy} onClick={props.onReadOriginal}>Consultar operación original</Button></div>}
        {!unresolved && (props.selectionBlocked || props.needsCurrent) && <div className={styles.InvitationManagement__callout}><p role="status">{COPY.currentRequired}</p><div className={styles.InvitationManagement__actions}><Button type="button" variant="secondary" disabled={props.busy} onClick={props.onReadCurrent}>Consultar estado actual</Button>{props.selectionBlocked && <Button type="button" variant="secondary" disabled={props.busy || props.pending} onClick={props.onDiscardSelection}>Descartar selección</Button>}</div></div>}
        <GuidedSteps label={title} steps={steps} current={props.step} onCurrentChange={props.onStepChange} busy={disabled}
          finalAction={{ label: finalLabel, loading: props.writing, disabled: Boolean(reviewReason), onRun: props.onSave }} />
      </section>
      <InvitationHistory props={props} id={id} disabled={disabled} />
    </>}
  </section>;
}