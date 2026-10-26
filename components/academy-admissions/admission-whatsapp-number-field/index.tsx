/** Presents one declared group number without account, storage, validation or transport dependencies. @module admission-whatsapp-number-field */
import { useId } from "react";
import { Input } from "@golfo/ui";
import { ADMISSION_WHATSAPP_COPY } from "@/src/modules/academy-admissions/constants/admission-whatsapp-number";
import styles from "./styles.module.scss";

/** The owning container supplies validation and current required/disabled state. */
export type AdmissionWhatsappNumberFieldProps = { value: string; required: boolean; disabled: boolean; errorMessage?: string | null; onChange: (value: string) => void };

/** @param props - Controlled declared value and safe field feedback. @returns A labelled shared telephone input with associated help and error. */
export function AdmissionWhatsappNumberField(props: AdmissionWhatsappNumberFieldProps) {
  const id = useId(), helpId = `${id}-help`, errorId = `${id}-error`;
  return <div className={styles.AdmissionWhatsappNumberField}>
    <label className={styles.AdmissionWhatsappNumberField__label} htmlFor={id}>{props.required ? ADMISSION_WHATSAPP_COPY.label : ADMISSION_WHATSAPP_COPY.optionalLabel}</label>
    <Input className={styles.AdmissionWhatsappNumberField__input} id={id} type="tel" inputMode="tel" autoComplete="tel" required={props.required} value={props.value} disabled={props.disabled} aria-invalid={props.errorMessage ? true : undefined} aria-describedby={`${helpId}${props.errorMessage ? ` ${errorId}` : ""}`} onChange={(event) => props.onChange(event.target.value)} />
    <p className={styles.AdmissionWhatsappNumberField__help} id={helpId}>{ADMISSION_WHATSAPP_COPY.help} {ADMISSION_WHATSAPP_COPY.formatHelp}</p>
    {props.errorMessage && <p className={styles.AdmissionWhatsappNumberField__error} id={errorId} role="alert">{props.errorMessage}</p>}
  </div>;
}
