/** Presents an own pending correction without owning account, requests or recovery state. @module admission-whatsapp-number-form */
import { useId } from "react";
import { Button, Checkbox } from "@astra-kit/ui";
import { AdmissionWhatsappNumberField } from "@/components/academy-admissions/admission-whatsapp-number-field";
import { ADMISSION_WHATSAPP_COPY } from "@/src/modules/academy-admissions/constants/admission-whatsapp-number";
import styles from "./styles.module.scss";

/** The route container binds explicit confirmation to the displayed resource version. */
export type AdmissionWhatsappNumberFormProps = { value: string; currentNumber: string | null; required: boolean; confirmed: boolean; disabled: boolean; busy: boolean; errorMessage: string | null; onChange: (value: string) => void; onConfirm: (confirmed: boolean) => void; onSubmit: () => void };

/** @param props - Owned current value, draft and version-bound action callbacks. @returns A separate labelled form preserving the original admission contact and evidence. */
export function AdmissionWhatsappNumberForm(props: AdmissionWhatsappNumberFormProps) {
  const id = useId(), titleId = `${id}-title`, confirmationId = `${id}-confirm`;
  return <form className={styles.AdmissionWhatsappNumberForm} noValidate aria-labelledby={titleId} aria-busy={props.busy} onSubmit={(event) => { event.preventDefault(); props.onSubmit(); }}>
    <h2 className={styles.AdmissionWhatsappNumberForm__title} id={titleId}>{ADMISSION_WHATSAPP_COPY.editTitle}</h2>
    <p className={styles.AdmissionWhatsappNumberForm__current}>{ADMISSION_WHATSAPP_COPY.currentNumber}: {props.currentNumber ?? ADMISSION_WHATSAPP_COPY.notProvided}</p>
    <AdmissionWhatsappNumberField value={props.value} required={props.required} disabled={props.disabled} errorMessage={props.errorMessage} onChange={props.onChange} />
    <div className={styles.AdmissionWhatsappNumberForm__confirmation}>
      <Checkbox id={confirmationId} checked={props.confirmed} disabled={props.disabled} onCheckedChange={(checked) => props.onConfirm(checked === true)} />
      <label htmlFor={confirmationId}>{ADMISSION_WHATSAPP_COPY.confirmEdit}</label>
    </div>
    <div className={styles.AdmissionWhatsappNumberForm__actions}><Button type="submit" disabled={props.disabled || !props.confirmed}>{props.busy ? ADMISSION_WHATSAPP_COPY.saving : ADMISSION_WHATSAPP_COPY.save}</Button></div>
  </form>;
}
