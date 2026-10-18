/** Presents shared decision fields and explicit confirmation without owning transport or session state. @module admission-decision-form */
import { useId } from "react";
import { Button, Checkbox, Textarea } from "beez-ui";
import { ADMISSION_REVIEW_UI_COPY } from "@/src/modules/academy-admissions/constants/admission-review-ui";
import { ADMISSION_DECISION } from "@/src/modules/academy-admissions/constants/admission-public-contract";
import { ADMISSION_LIMIT } from "@/src/modules/academy-admissions/constants/admission-limits";
import styles from "./styles.module.scss";

/** Immutable originals keep editable fields locked while a fresh retry can require confirmation again. */
export type AdmissionDecisionFormProps = {
  internalReason: string; externalMessage: string; confirmed: boolean; disabled: boolean; busy: boolean; locked?: boolean;
  allowApprove: boolean; allowReject: boolean; confirmationLabel?: string; approveLabel?: string; rejectLabel?: string; writingLabel?: string;
  onInternalReason: (value: string) => void; onExternalMessage: (value: string) => void; onConfirm: (value: boolean) => void;
  onDecision: (decision: "approve" | "reject") => void;
};

/** @param props - Route-owned values, availability and callbacks. @returns A semantic decision form with adjacent validation guidance. */
export function AdmissionDecisionForm(props: AdmissionDecisionFormProps) {
  const id = useId(), reasonId = `${id}-reason`, externalId = `${id}-external`, confirmId = `${id}-confirm`;
  return <form className={styles.AdmissionDecisionForm} onSubmit={(event) => event.preventDefault()}>
    <div className={styles.AdmissionDecisionForm__field}><label className={styles.AdmissionDecisionForm__label} htmlFor={reasonId}>{ADMISSION_REVIEW_UI_COPY.internalReason}</label><Textarea id={reasonId} value={props.internalReason} onChange={(event) => props.onInternalReason(event.target.value)} maxLength={ADMISSION_LIMIT.internalMessageCharacters} disabled={props.disabled || props.locked} aria-describedby={`${reasonId}-help`} /><p id={`${reasonId}-help`} className={styles.AdmissionDecisionForm__help}>{ADMISSION_REVIEW_UI_COPY.internalHelp} Hasta {ADMISSION_LIMIT.internalMessageCharacters} caracteres.</p></div>
    <div className={styles.AdmissionDecisionForm__field}><label className={styles.AdmissionDecisionForm__label} htmlFor={externalId}>{ADMISSION_REVIEW_UI_COPY.externalMessage}</label><Textarea id={externalId} value={props.externalMessage} onChange={(event) => props.onExternalMessage(event.target.value)} maxLength={ADMISSION_LIMIT.externalMessageCharacters} disabled={props.disabled || props.locked} aria-describedby={`${externalId}-help`} /><p id={`${externalId}-help`} className={styles.AdmissionDecisionForm__help}>{ADMISSION_REVIEW_UI_COPY.externalHelp} Hasta {ADMISSION_LIMIT.externalMessageCharacters} caracteres.</p></div>
    <div className={styles.AdmissionDecisionForm__confirmation}><Checkbox id={confirmId} checked={props.confirmed} disabled={props.disabled} onCheckedChange={(checked) => props.onConfirm(checked === true)} /><label htmlFor={confirmId}>{props.confirmationLabel ?? ADMISSION_REVIEW_UI_COPY.confirm}</label></div>
    <div className={styles.AdmissionDecisionForm__actions}>{props.allowApprove && <Button type="button" disabled={props.disabled || props.locked || !props.confirmed || !props.internalReason.trim()} onClick={() => props.onDecision(ADMISSION_DECISION.approve)}>{props.busy ? props.writingLabel ?? ADMISSION_REVIEW_UI_COPY.writing : props.approveLabel ?? ADMISSION_REVIEW_UI_COPY.approve}</Button>}{props.allowReject && <Button type="button" variant="secondary" disabled={props.disabled || props.locked || !props.confirmed || !props.internalReason.trim()} onClick={() => props.onDecision(ADMISSION_DECISION.reject)}>{props.busy ? props.writingLabel ?? ADMISSION_REVIEW_UI_COPY.writing : props.rejectLabel ?? ADMISSION_REVIEW_UI_COPY.reject}</Button>}</div>
  </form>;
}
