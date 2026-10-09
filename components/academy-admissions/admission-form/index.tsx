/** Renders an explicit declared-contact draft using shared primitives and callbacks only. @module admission-form */
import { Button, Checkbox, Input, Textarea } from "beez-ui";
import { useId } from "react";
import type { AdmissionDraft } from "@/lib/academy-admissions/admission-draft";
import { ADMISSION_UI_COPY } from "@/src/modules/academy-admissions/constants/admission-ui";
import { ADMISSION_LIMIT } from "@/src/modules/academy-admissions/constants/admission-limits";
import styles from "./styles.module.scss";

export type AdmissionFormProps = { draft: AdmissionDraft; contactType: "email" | "phone"; contactLocked?: boolean; confirmed: boolean; disabled: boolean; busy: boolean; errorMessage: string | null; onChange: (draft: AdmissionDraft) => void; onConfirm: (confirmed: boolean) => void; onSubmit: () => void };
/** @param props - Safe editor state and container callbacks. @returns A labelled form with visible validation, without auth or transport lookups. */
export function AdmissionForm({ draft, contactType, contactLocked = false, confirmed, disabled, busy, errorMessage, onChange, onConfirm, onSubmit }: AdmissionFormProps) {
  const instanceId = useId(), phoneId = `${instanceId}-phone`, countryId = `${instanceId}-country`, messageId = `${instanceId}-message`, confirmationId = `${instanceId}-confirm`, phoneHelpId = `${instanceId}-phone-help`;
  return <form className={styles.AdmissionForm} onSubmit={(event) => { event.preventDefault(); onSubmit(); }} aria-busy={busy}>
    {contactType === "phone" ? <>
      <div className={styles.AdmissionForm__field}><label className={styles.AdmissionForm__label} htmlFor={phoneId}>{ADMISSION_UI_COPY.phone}</label><Input id={phoneId} type="tel" autoComplete="tel" value={draft.phone} disabled={disabled || contactLocked} aria-describedby={phoneHelpId} onChange={(event) => onChange({ ...draft, phone: event.target.value })} /></div>
      <div className={styles.AdmissionForm__field}><label className={styles.AdmissionForm__label} htmlFor={countryId}>{ADMISSION_UI_COPY.country}</label><Input id={countryId} value={draft.country} disabled={disabled || contactLocked} autoCapitalize="characters" onChange={(event) => onChange({ ...draft, country: event.target.value })} /><p id={phoneHelpId} className={styles.AdmissionForm__help}>{contactLocked ? "El teléfono y su país conservan el contacto del código comprobado." : ADMISSION_UI_COPY.countryHelp}</p></div>
    </> : <p className={styles.AdmissionForm__help}>{ADMISSION_UI_COPY.email}</p>}
    <div className={styles.AdmissionForm__field}><label className={styles.AdmissionForm__label} htmlFor={messageId}>{ADMISSION_UI_COPY.message}</label><Textarea id={messageId} value={draft.message} maxLength={ADMISSION_LIMIT.internalMessageCharacters} disabled={disabled} onChange={(event) => onChange({ ...draft, message: event.target.value })} /></div>
    <div className={styles.AdmissionForm__confirmation}><Checkbox id={confirmationId} checked={confirmed} disabled={disabled} onCheckedChange={(checked) => onConfirm(checked === true)} /><label htmlFor={confirmationId}>{ADMISSION_UI_COPY.confirm}</label></div>
    {errorMessage && <p role="alert" className={styles.AdmissionForm__error}>{errorMessage}</p>}
    <div className={styles.AdmissionForm__actions}><Button type="submit" disabled={disabled || !confirmed}>{busy ? ADMISSION_UI_COPY.submitting : ADMISSION_UI_COPY.submit}</Button></div>
  </form>;
}
