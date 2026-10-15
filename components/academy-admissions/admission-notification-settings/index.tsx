/** Presents personal frequency and leader-only email controls without session, transport or recovery storage dependencies. @module admission-notification-settings */
import { useId } from "react";
import { Button, Checkbox, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@guidomodarelli/beez-ui";
import { Link } from "@/components/navigation/link";
import type { AdmissionNotificationPreferenceMode } from "@/src/modules/notifications/domain/entities/admission-notification-preference";
import type { AdmissionNotificationPreferenceView, AdmissionNotificationEmailSettingsView } from "@/src/modules/notifications/application/results/admission-notification-settings-result";
import type { AdmissionNotificationEmailSettingsDraft } from "@/src/modules/notifications/application/commands/admission-notification-email-settings-draft";
import { ADMISSION_NOTIFICATION_PREFERENCE_MODE as MODE, ADMISSION_NOTIFICATION_PREFERENCE_SOURCE } from "@/src/modules/notifications/constants/admission-notification-preference";
import { ADMISSION_NOTIFICATION_SETTINGS_TIME_ZONE_MAX_LENGTH } from "@/src/modules/notifications/constants/admission-notification-settings-http";
import styles from "./styles.module.scss";

/** All private state and side effects remain owned by the route container. */
export type AdmissionNotificationSettingsProps = {
  preference: AdmissionNotificationPreferenceView; mode: AdmissionNotificationPreferenceMode; email: AdmissionNotificationEmailSettingsView | null;
  draft: AdmissionNotificationEmailSettingsDraft; busy: boolean; disabled: boolean; confirmed: boolean; pending: boolean; canRetry: boolean;
  preferenceError: string | null; preferenceStatus: string | null; emailError: string | null; emailStatus: string | null;
  reauthenticationRequired: boolean; reauthenticationHref: string | null; messagingHref: string;
  onMode: (mode: AdmissionNotificationPreferenceMode) => void; onSavePreference: () => void; onDraft: (draft: AdmissionNotificationEmailSettingsDraft) => void;
  onConfirm: (confirmed: boolean) => void; onSaveEmail: () => void; onRead: () => void; onRetryOriginal: () => void; onPrepareReauthentication: () => void;
};
/** @param props - Guarded current state, retained draft and explicit callbacks. @returns Two accessible forms with adjacent validation, status and original recovery controls. */
export function AdmissionNotificationSettings(props: AdmissionNotificationSettingsProps) {
  const id = useId(), modeId = `${id}-mode`, enabledId = `${id}-enabled`, zoneId = `${id}-zone`, confirmId = `${id}-confirm`;
  const fieldsDisabled = props.busy || props.pending, editDisabled = props.disabled || fieldsDisabled, personalDisabled = props.disabled || props.busy, zoneInvalid = !props.draft.timeZone.trim();
  return <div className={styles.AdmissionNotificationSettings} aria-busy={props.busy}>
    <p className={styles.AdmissionNotificationSettings__help}>Elegí cómo recibir los nuevos avisos de revisión. La preferencia es personal; el líder habilita el correo de la tribu por separado. Los avisos dentro de TuTribu se conservan.</p>
    <div className={styles.AdmissionNotificationSettings__actions}><Button variant="outline" onClick={props.onRead} disabled={props.busy}>Consultar estado actual</Button></div>
    {props.busy && <p role="status" className={styles.AdmissionNotificationSettings__help}>Procesando los ajustes de admisión…</p>}
    {props.disabled && !props.busy && <p role="status" className={styles.AdmissionNotificationSettings__help}>Consultá el estado actual antes de guardar otro cambio.</p>}
    <form className={styles.AdmissionNotificationSettings__section} onSubmit={(event) => { event.preventDefault(); if (!personalDisabled) props.onSavePreference(); }} aria-labelledby={`${modeId}-title`}>
      <h2 id={`${modeId}-title`} className={styles.AdmissionNotificationSettings__subtitle}>Mi preferencia de correo</h2>
      <p className={styles.AdmissionNotificationSettings__help}>{props.preference.source === ADMISSION_NOTIFICATION_PREFERENCE_SOURCE.implicit ? "Todavía usás la elección predeterminada de tu rol." : "Tenés una elección personal guardada."} Guardar no envía avisos anteriores ni activa los códigos de contacto.</p>
      <div className={styles.AdmissionNotificationSettings__field}><label htmlFor={modeId}>Frecuencia</label><Select value={props.mode} disabled={props.busy} onValueChange={(value) => { if (value === MODE.grouped || value === MODE.individual || value === MODE.daily || value === MODE.omitted) props.onMode(value); }}><SelectTrigger id={modeId} aria-describedby={`${modeId}-help`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value={MODE.grouped}>Agrupar cada cinco minutos</SelectItem><SelectItem value={MODE.individual}>Un correo por aviso</SelectItem><SelectItem value={MODE.daily}>Resumen diario</SelectItem><SelectItem value={MODE.omitted}>Omitir correos de revisión</SelectItem></SelectContent></Select><p id={`${modeId}-help`} className={styles.AdmissionNotificationSettings__help}>El resumen diario usa las 09:00 y la zona horaria de la tribu. Esta elección no cambia la de otros responsables.</p></div>
      {props.preferenceError && <p role="alert" className={styles.AdmissionNotificationSettings__error}>{props.preferenceError}</p>}
      {props.preferenceStatus && <p role="status" className={styles.AdmissionNotificationSettings__help}>{props.preferenceStatus}</p>}
      <div className={styles.AdmissionNotificationSettings__actions}><Button type="submit" disabled={personalDisabled}>Guardar mi preferencia</Button></div>
    </form>
    {props.email && <form className={styles.AdmissionNotificationSettings__section} aria-labelledby={`${enabledId}-title`} onSubmit={(event) => { event.preventDefault(); if (!editDisabled && props.confirmed && !zoneInvalid) props.onSaveEmail(); }}>
      <h2 id={`${enabledId}-title`} className={styles.AdmissionNotificationSettings__subtitle}>Correo de la tribu</h2>
      <p role="status" className={styles.AdmissionNotificationSettings__help}>{props.email.enabled ? "El correo de admisión está habilitado." : "El correo de admisión está deshabilitado."} Sólo el líder activo puede cambiarlo.</p>
      <div className={styles.AdmissionNotificationSettings__check}><Checkbox id={enabledId} checked={props.draft.enabled} disabled={fieldsDisabled} onCheckedChange={(checked) => props.onDraft({ ...props.draft, enabled: checked === true })} /><label htmlFor={enabledId}>Habilitar correo de admisión</label></div>
      <p className={styles.AdmissionNotificationSettings__help}>Se requiere un correo preparado en mensajería. Habilitarlo se aplica a hechos nuevos, respeta cada preferencia personal y no habilita OTP.</p>
      <div className={styles.AdmissionNotificationSettings__field}><label htmlFor={zoneId}>Zona horaria de la tribu</label><Input id={zoneId} value={props.draft.timeZone} disabled={fieldsDisabled} maxLength={ADMISSION_NOTIFICATION_SETTINGS_TIME_ZONE_MAX_LENGTH} aria-invalid={zoneInvalid || undefined} aria-describedby={`${zoneId}-help`} onChange={(event) => props.onDraft({ ...props.draft, timeZone: event.target.value })} /><p id={`${zoneId}-help`} className={styles.AdmissionNotificationSettings__help}>{zoneInvalid ? "Indicá una zona horaria antes de guardar." : "Usá un nombre de zona, por ejemplo America/Argentina/Buenos_Aires. Se aplica al resumen diario de la tribu."}</p></div>
      {props.pending && <p role="status" className={styles.AdmissionNotificationSettings__help}>Conservamos el cambio original. Consultá su estado antes de empezar otro; los ajustes actuales pueden tener una versión posterior.</p>}
      {props.emailError && <p role="alert" className={styles.AdmissionNotificationSettings__error}>{props.emailError}</p>}
      {props.emailStatus && <p role="status" className={styles.AdmissionNotificationSettings__help}>{props.emailStatus}</p>}
      <div className={styles.AdmissionNotificationSettings__check}><Checkbox id={confirmId} checked={props.confirmed} disabled={props.busy || props.disabled || props.pending && !props.canRetry} onCheckedChange={(checked) => props.onConfirm(checked === true)} /><label htmlFor={confirmId}>Confirmo la habilitación y la zona elegidas para el correo de esta tribu.</label></div>
      <div className={styles.AdmissionNotificationSettings__actions}>{props.pending ? <Button type="button" onClick={props.onRetryOriginal} disabled={props.busy || props.disabled || !props.canRetry || !props.confirmed}>Reintentar el cambio original</Button> : <Button type="submit" disabled={editDisabled || !props.confirmed || zoneInvalid}>Guardar correo de admisión</Button>}<Link href={props.messagingHref}>Revisar mensajería</Link></div>
      {props.reauthenticationRequired && <div className={styles.AdmissionNotificationSettings__recovery}><p>Este cambio requiere una confirmación reciente de Google. Al volver, revisá y confirmá el cambio original; la autenticación no lo guarda por sí sola.</p>{props.reauthenticationHref ? <Link href={props.reauthenticationHref}>Continuar con Google</Link> : <Button type="button" variant="outline" onClick={props.onPrepareReauthentication} disabled={props.busy}>Preparar confirmación con Google</Button>}</div>}
    </form>}
  </div>;
}
