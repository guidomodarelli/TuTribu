/** Renders policy editing and explicit confirmation from current props, without session or HTTP dependencies. @module admission-policy-form */
import { Badge, Button, Checkbox, Select, Textarea } from "@golfo/ui";
import { useId } from "react";
import { Link } from "@/components/navigation/link";
import type { AdmissionPolicyDraft } from "@/src/modules/academy-admissions/application/commands/admission-policy-draft";
import type { AdmissionPolicyStateDto } from "@/src/modules/academy-admissions/application/results/admission-policy-result-schemas";
import { ADMISSION_POLICY_MODE, ADMISSION_PHONE_CHANNEL, ADMISSION_POLICY_PUBLIC_STATE, ADMISSION_POLICY_PREPARATION_STATE } from "@/src/modules/academy-admissions/constants/admission-policy";
import { ADMISSION_CONTACT_TYPE } from "@/src/modules/academy-admissions/constants/admission-contact";
import { ADMISSION_LIMIT } from "@/src/modules/academy-admissions/constants/admission-limits";
import { ADMISSION_POLICY_PREFLIGHT_REASON_COPY, ADMISSION_POLICY_ACTIVATION_REQUIREMENT_COPY } from "@/src/modules/academy-admissions/constants/admission-policy-browser";
import type { AdmissionPolicyPreflightDto } from "@/src/modules/academy-admissions/application/ports/admission-policy-browser-client";
import { ADMISSION_POLICY_MODE_OPTIONS, ADMISSION_POLICY_CONTACT_OPTIONS, ADMISSION_POLICY_PHONE_CHANNEL_OPTIONS } from "@/src/modules/academy-admissions/constants/admission-policy-options";
import styles from "./styles.module.scss";
import { ADMISSION_WHATSAPP_COPY } from "@/src/modules/academy-admissions/constants/admission-whatsapp-number";

/** Preparation and safe messages come from the route container; they are never authority supplied by a form. */
export type AdmissionPolicyFormProps = {
  state: AdmissionPolicyStateDto; draft: AdmissionPolicyDraft; confirmed: boolean; canEdit: boolean; busy: boolean;
  errorMessage: string | null; validationMessage: string | null; preflightMessage: string | null; activationAvailable: boolean; pauseReason: string; usageSettingsHref: string | null;
  preflightResult: AdmissionPolicyPreflightDto | null;
  onChange: (draft: AdmissionPolicyDraft) => void; onConfirm: (confirmed: boolean) => void; onPauseReason: (reason: string) => void;
  onInitialize: () => void; onSave: () => void; onActivate: () => void; onPause: () => void; onCheckPreflight: () => void; onReloadCurrent: () => void;
  statusMessage?: string | null; uncertain?: boolean; canRetry?: boolean; onRetryOriginal?: () => void;
};

/** @param props - One rule option and its optional explanation. @returns A checkbox row with the explanation attached to the control. */
function RuleOption({ id, checked, disabled, label, help, onChange }: { id: string; checked: boolean; disabled: boolean; label: string; help?: string; onChange: (checked: boolean) => void }) {
  return <div className={styles.AdmissionPolicyForm__option}><Checkbox id={id} checked={checked} disabled={disabled} aria-describedby={help ? `${id}-help` : undefined} onCheckedChange={(value) => onChange(value === true)} /><div className={styles.AdmissionPolicyForm__optionText}><label htmlFor={id}>{label}</label>{help && <p className={styles.AdmissionPolicyForm__help} id={`${id}-help`}>{help}</p>}</div></div>;
}

/** @param props - Current safe state, retained draft and validated container callbacks. @returns Accessible policy form with independent controls, explicit impact and current protection status. */
export function AdmissionPolicyForm(props: AdmissionPolicyFormProps) {
  const instanceId = useId(), modeId = `${instanceId}-mode`, contactId = `${instanceId}-contact`, checkId = `${instanceId}-check`, whatsappId = `${instanceId}-whatsapp`, openId = `${instanceId}-open`, exceptionsId = `${instanceId}-exceptions`, phoneId = `${instanceId}-phone`, smsId = `${instanceId}-sms`, confirmId = `${instanceId}-confirm`, reasonId = `${instanceId}-reason`;
  const unavailable = props.state.state === ADMISSION_POLICY_PUBLIC_STATE.unavailable, disabled = !props.canEdit || props.busy || unavailable, hasPolicy = props.state.policy !== null;
  const activationRequirements = [...new Set([...props.state.preparation.requirements, ...(props.state.policy?.requirements ?? [])])];
  const mayConfirm = !disabled && props.confirmed && !props.validationMessage;
  return <form className={styles.AdmissionPolicyForm} aria-busy={props.busy} onSubmit={(event) => { event.preventDefault(); if (mayConfirm && hasPolicy) props.onSave(); }}>
    <section className={styles.AdmissionPolicyForm__summary} aria-label="Estado actual">
      <ul className={styles.AdmissionPolicyForm__badges}>
        <li><Badge tone={props.state.controlActivated ? "success" : "neutral"}>{props.state.controlActivated ? "Control activo" : "Control sin activar"}</Badge></li>
        {hasPolicy && <li><Badge tone={props.state.policy?.isOpen ? "info" : "neutral"}>{props.state.policy?.isOpen ? "Recibe solicitudes" : "Sin nuevas solicitudes"}</Badge></li>}
        <li><Badge tone="neutral">{props.state.impact.pendingRequestCount === 1 ? "1 solicitud pendiente" : `${props.state.impact.pendingRequestCount} solicitudes pendientes`}</Badge></li>
      </ul>
      <p className={styles.AdmissionPolicyForm__lead} role="status">{props.state.controlActivated ? "El control de admisión ya protege los ingresos gratuitos de esta academia." : "Esta academia todavía no tiene activado el control. Guardar un borrador no protege los enlaces anteriores."}</p>
      {!props.canEdit && <p className={styles.AdmissionPolicyForm__help}>La configuración sólo está disponible para el líder activo de esta academia.</p>}
      {unavailable && <p role="alert" className={`${styles.AdmissionPolicyForm__feedback} ${styles["AdmissionPolicyForm__feedback--alert"]}`}>La configuración requiere revisión antes de continuar. La protección existente se conserva.</p>}
    </section>
    {hasPolicy && <div className={styles.AdmissionPolicyForm__block}><fieldset className={styles.AdmissionPolicyForm__fieldset} disabled={disabled}>
      <legend className={styles.AdmissionPolicyForm__legend}>Reglas de ingreso</legend>
      <div className={styles.AdmissionPolicyForm__selects}>
        <div className={styles.AdmissionPolicyForm__field}><Select value={props.draft.mode} disabled={disabled} onValueChange={(value) => { if (value === ADMISSION_POLICY_MODE.manualReview || value === ADMISSION_POLICY_MODE.allowlist) props.onChange({ ...props.draft, mode: value }); }} id={modeId} label="Forma de revisión" options={ADMISSION_POLICY_MODE_OPTIONS} /></div>
        <div className={styles.AdmissionPolicyForm__field}><Select value={props.draft.contactType} disabled={disabled || props.state.impact.contactTypeLocked} onValueChange={(value) => { if (value === ADMISSION_CONTACT_TYPE.email || value === ADMISSION_CONTACT_TYPE.phone) props.onChange({ ...props.draft, contactType: value }); }} id={contactId} label="Contacto para el ingreso" options={ADMISSION_POLICY_CONTACT_OPTIONS} />{props.state.impact.contactTypeLocked && <p className={styles.AdmissionPolicyForm__help}>El tipo de contacto quedó fijado al activar el control.</p>}</div>
      </div>
      <div className={styles.AdmissionPolicyForm__options}>
        <RuleOption id={openId} checked={props.draft.isOpen} disabled={disabled} label="Recibir nuevas solicitudes" onChange={(checked) => props.onChange({ ...props.draft, isOpen: checked })} />
        <RuleOption id={checkId} checked={props.draft.requiresAdditionalVerification} disabled={disabled} label="Comprobar el contacto con un código" help="Esta comprobación se elige por separado de los avisos y de la conexión de mensajería. Podés preparar un borrador antes de tener un canal disponible." onChange={(checked) => props.onChange({ ...props.draft, requiresAdditionalVerification: checked })} />
        <RuleOption id={whatsappId} checked={props.draft.requiresWhatsappNumber ?? false} disabled={disabled} label={ADMISSION_WHATSAPP_COPY.policyLabel} help={ADMISSION_WHATSAPP_COPY.policyHelp} onChange={(checked) => props.onChange({ ...props.draft, requiresWhatsappNumber: checked })} />
        <RuleOption id={exceptionsId} checked={props.draft.allowCommonExceptions} disabled={disabled} label="Permitir solicitudes comunes como excepción" onChange={(checked) => props.onChange({ ...props.draft, allowCommonExceptions: checked })} />
      </div>
      {props.draft.contactType === ADMISSION_CONTACT_TYPE.phone && <div className={styles.AdmissionPolicyForm__phone}>
        {!props.draft.requiresAdditionalVerification && <p role="status" className={styles.AdmissionPolicyForm__help}>Con teléfono y códigos desactivados, el ingreso común manual está disponible; las invitaciones personales por teléfono no están disponibles.</p>}
        <div className={styles.AdmissionPolicyForm__field}><Select value={props.draft.phoneChannel ?? undefined} disabled={disabled || !props.draft.requiresAdditionalVerification} onValueChange={(value) => { if (value === ADMISSION_PHONE_CHANNEL.sms || value === ADMISSION_PHONE_CHANNEL.whatsapp) props.onChange({ ...props.draft, phoneChannel: value }); }} id={phoneId} label="Canal del código" options={ADMISSION_POLICY_PHONE_CHANNEL_OPTIONS} placeholder="Elegí un canal" /></div>
        <RuleOption id={smsId} checked={props.draft.allowSmsAlternative} disabled={disabled || !props.draft.requiresAdditionalVerification || props.draft.phoneChannel !== ADMISSION_PHONE_CHANNEL.whatsapp} label="Ofrecer SMS como alternativa a WhatsApp" onChange={(checked) => props.onChange({ ...props.draft, allowSmsAlternative: checked })} />
      </div>}
    </fieldset></div>}
    <section className={styles.AdmissionPolicyForm__block} aria-labelledby={`${instanceId}-countries`}>
      <h2 id={`${instanceId}-countries`} className={styles.AdmissionPolicyForm__sectionTitle}>Países habilitados</h2>
      <p className={styles.AdmissionPolicyForm__lead}>{props.state.usage?.allowedCountries.length ? props.state.usage.allowedCountries.join(", ") : "Todavía no hay países habilitados para el envío telefónico."}</p>
      {props.usageSettingsHref && <Link className={styles.AdmissionPolicyForm__link} href={props.usageSettingsHref}>Configurar países y cupos de mensajería</Link>}
    </section>
    <section className={styles.AdmissionPolicyForm__block} aria-label="Impacto de la configuración">
      <h2 className={styles.AdmissionPolicyForm__sectionTitle}>Antes de confirmar</h2>
      <div className={styles.AdmissionPolicyForm__impact}><p>{props.state.impact.pendingRequestCount} solicitudes pendientes conservan su fecha y su estado; se revisarán con las reglas vigentes. Activar los códigos inicia una nueva exigencia de comprobación y no aprueba solicitudes automáticamente.</p><p>Al activar por primera vez, el tipo de contacto elegido queda fijo.</p></div>
      {props.draft.requiresAdditionalVerification && props.state.preparation.state === ADMISSION_POLICY_PREPARATION_STATE.notEvaluated && <p className={styles.AdmissionPolicyForm__help}>El canal y los cupos para los códigos todavía no fueron comprobados. Deben estar preparados para activar; esta revisión de protecciones no confirma su disponibilidad.</p>}
      {activationRequirements.length > 0 && <section className={styles.AdmissionPolicyForm__callout} aria-label="Requisitos de la configuración">
        <h3 className={styles.AdmissionPolicyForm__subtitle}>Requisitos de la configuración</h3>
        <ul className={styles.AdmissionPolicyForm__reasons}>{activationRequirements.map((requirement) => <li key={requirement}>{ADMISSION_POLICY_ACTIVATION_REQUIREMENT_COPY[requirement]}</li>)}</ul>
      </section>}
      {props.preflightResult && <section className={styles.AdmissionPolicyForm__callout} aria-label="Resultado de los requisitos de activación">
        <h3 className={styles.AdmissionPolicyForm__subtitle}>Resultado de la comprobación</h3>
        <p>Membresías con historial comercial desconocido: <strong>{props.preflightResult.impact.unknownCommercialMemberCount}</strong>.</p>
        <p>Membresías comerciales restringidas con rol de líder o guardián: <strong>{props.preflightResult.impact.privilegedCommercialMemberCount}</strong>.</p>
        {props.preflightResult.reasons.length > 0 && <ul className={styles.AdmissionPolicyForm__reasons}>{props.preflightResult.reasons.map((reason) => <li key={reason}>{ADMISSION_POLICY_PREFLIGHT_REASON_COPY[reason]}</li>)}</ul>}
        <p className={styles.AdmissionPolicyForm__help}>Esta consulta no cambia membresías, roles ni fechas. No permite reconstruir el historial ni recuperar membresías desde esta pantalla.</p>
      </section>}
      <div className={styles.AdmissionPolicyForm__check}><Checkbox id={confirmId} checked={props.confirmed} disabled={disabled} onCheckedChange={(checked) => props.onConfirm(checked === true)} /><label htmlFor={confirmId}>Revisé las reglas y su impacto y quiero confirmar esta acción.</label></div>
      {!props.confirmed && <p className={styles.AdmissionPolicyForm__help}>Marcá la confirmación para preparar o guardar la configuración.</p>}
      {props.validationMessage && <p role="alert" className={styles.AdmissionPolicyForm__error}>{props.validationMessage}</p>}
      <div className={styles.AdmissionPolicyForm__actions}>{hasPolicy ? <Button type="submit" disabled={!mayConfirm}>{props.busy ? "Procesando…" : props.state.controlActivated ? "Guardar configuración" : "Guardar borrador"}</Button> : <Button type="button" disabled={!mayConfirm} onClick={props.onInitialize}>Preparar configuración</Button>}{hasPolicy && !props.state.controlActivated && <><Button type="button" disabled={!mayConfirm || !props.activationAvailable} onClick={props.onActivate}>Activar control de admisión</Button><Button type="button" variant="secondary" disabled={disabled} onClick={props.onCheckPreflight}>Revisar requisitos de activación</Button></>}</div>
      {props.preflightMessage && <p role="status" className={styles.AdmissionPolicyForm__help}>{props.preflightMessage}</p>}
      {props.statusMessage && <p role="status" className={styles.AdmissionPolicyForm__feedback}>{props.statusMessage}</p>}
      {props.errorMessage && <div role="alert" className={styles.AdmissionPolicyForm__recovery}><p className={styles.AdmissionPolicyForm__error}>{props.errorMessage}</p><p className={styles.AdmissionPolicyForm__help}>El borrador se conserva para que puedas compararlo antes de volver a confirmar.</p><Button type="button" variant="secondary" disabled={props.busy} onClick={props.onReloadCurrent}>Consultar configuración actual</Button></div>}
      {props.uncertain && <section className={styles.AdmissionPolicyForm__callout} aria-label="Recuperar operación original"><p role="status">Todavía no podemos confirmar el resultado. Consultá la operación original antes de volver a guardar.</p><Button type="button" variant="secondary" disabled={props.busy} onClick={props.onReloadCurrent}>Consultar operación original</Button>{props.canRetry && <><div className={styles.AdmissionPolicyForm__check}><Checkbox id={`${instanceId}-retry`} checked={props.confirmed} disabled={props.busy} onCheckedChange={(checked) => props.onConfirm(checked === true)} /><label htmlFor={`${instanceId}-retry`}>Confirmo reintentar la misma operación con sus datos originales.</label></div><Button type="button" disabled={!props.confirmed || props.busy} onClick={props.onRetryOriginal}>Reintentar operación original</Button></>}</section>}
    </section>
    {props.state.policy?.isOpen && <section className={styles.AdmissionPolicyForm__block} aria-label="Pausar admisiones">
      <h2 className={styles.AdmissionPolicyForm__sectionTitle}>Pausa de admisiones</h2>
      <div className={styles.AdmissionPolicyForm__field}><label htmlFor={reasonId}>Motivo de la pausa</label><Textarea id={reasonId} value={props.pauseReason} maxLength={ADMISSION_LIMIT.internalMessageCharacters} disabled={disabled} aria-describedby={`${reasonId}-help`} onChange={(event) => props.onPauseReason(event.target.value)} /><p id={`${reasonId}-help`} className={styles.AdmissionPolicyForm__help}>La pausa cierra nuevas solicitudes y aprobaciones. Consultar, rechazar o cancelar solicitudes sigue disponible. Requiere la confirmación de arriba. Hasta {ADMISSION_LIMIT.internalMessageCharacters} caracteres.</p></div>
      <div className={styles.AdmissionPolicyForm__actions}><Button type="button" variant="danger" disabled={disabled || !props.confirmed || !props.pauseReason.trim()} onClick={props.onPause}>Pausar admisiones</Button></div>
    </section>}
  </form>;
}
