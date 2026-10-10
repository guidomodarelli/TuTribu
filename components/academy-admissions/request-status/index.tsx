/** Displays only owned request metadata and explicit cancellation callbacks. @module request-status */
import { Button, Checkbox } from "beez-ui";
import { useId } from "react";
import { Link } from "@/components/navigation/link";
import type { AdmissionRequestDto } from "@/src/modules/academy-admissions/application/results/admission-flow-result-schemas";
import { ADMISSION_UI_COPY } from "@/src/modules/academy-admissions/constants/admission-ui";
import { ADMISSION_REQUEST_STATUS } from "@/src/modules/academy-admissions/constants/admission-request";
import { ADMISSION_EVIDENCE_KIND, ADMISSION_DENIAL_REASON } from "@/src/modules/academy-admissions/constants/admission-eligibility";
import { ADMISSION_REQUEST_STATUS_COPY, ADMISSION_REQUEST_REVERIFICATION_COPY } from "@/src/modules/academy-admissions/constants/request-status-presentation";
import { formatBuenosAiresShortDate, formatBuenosAiresTime } from "@/lib/date-time/buenos-aires-format";
import styles from "./styles.module.scss";

/** @param value - Own ISO timestamp. @returns Its visible Buenos Aires date/time without changing the stored instant. */
const describeInstant = (value: string) => `${formatBuenosAiresShortDate(value)} · ${formatBuenosAiresTime(value)}`;
export type RequestStatusProps = { request: AdmissionRequestDto; now: string; confirmed: boolean; disabled: boolean; busy: boolean; errorMessage: string | null; retryHref?: string; onConfirm: (confirmed: boolean) => void; onCancel: () => void };
/** @param props - Guarded own snapshot and route-owned callbacks. @returns Persistent state and safe Spanish external copy, with no private review fields. */
export function RequestStatus({ request, now, confirmed, disabled, busy, errorMessage, retryHref, onConfirm, onCancel }: RequestStatusProps) {
  const confirmationId = useId();
  const expired = request.status === ADMISSION_REQUEST_STATUS.pending && Date.parse(now) >= Date.parse(request.expiresAt);
  const mayCancel = request.status === ADMISSION_REQUEST_STATUS.pending && !expired;
  return <section className={styles.RequestStatus} aria-label="Estado de tu solicitud">
    <p role="status">{expired ? ADMISSION_UI_COPY.expired : ADMISSION_REQUEST_STATUS_COPY[request.status]}</p>
    <dl className={styles.RequestStatus__facts}>
      <div className={styles.RequestStatus__fact}><dt className={styles.RequestStatus__label}>{ADMISSION_UI_COPY.submitted}</dt><dd className={styles.RequestStatus__value}><time dateTime={request.submittedAt}>{describeInstant(request.submittedAt)}</time></dd></div>
      <div className={styles.RequestStatus__fact}><dt className={styles.RequestStatus__label}>{ADMISSION_UI_COPY.expires}</dt><dd className={styles.RequestStatus__value}><time dateTime={request.expiresAt}>{describeInstant(request.expiresAt)}</time></dd></div>
      {request.retryAllowedAt && <div className={styles.RequestStatus__fact}><dt className={styles.RequestStatus__label}>{ADMISSION_UI_COPY.retryAt}</dt><dd className={styles.RequestStatus__value}><time dateTime={request.retryAllowedAt}>{describeInstant(request.retryAllowedAt)}</time></dd></div>}
    </dl>
    {request.contact && <p className={styles.RequestStatus__help}>{request.contact.maskedValue} · {request.contact.evidenceKind === ADMISSION_EVIDENCE_KIND.declared ? ADMISSION_UI_COPY.declared : ADMISSION_UI_COPY.verified}</p>}
    {request.externalMessage && <p className={styles.RequestStatus__message}>{request.externalMessage}</p>}
    {request.needsVerification && !expired && <p className={styles.RequestStatus__help}>{request.eligibilityReasons.includes(ADMISSION_DENIAL_REASON.evidenceRevoked) ? ADMISSION_REQUEST_REVERIFICATION_COPY.revoked : ADMISSION_REQUEST_REVERIFICATION_COPY.required}</p>}
    {mayCancel && <><div className={styles.RequestStatus__confirmation}><Checkbox id={confirmationId} checked={confirmed} disabled={disabled} onCheckedChange={(checked) => onConfirm(checked === true)} /><label htmlFor={confirmationId}>{ADMISSION_UI_COPY.confirmCancel}</label></div><div className={styles.RequestStatus__actions}><Button type="button" variant="outline" disabled={disabled || !confirmed} onClick={onCancel}>{busy ? ADMISSION_UI_COPY.cancelling : ADMISSION_UI_COPY.cancel}</Button></div></>}
    {retryHref && <Link href={retryHref}>{ADMISSION_UI_COPY.retry}</Link>}
    {errorMessage && <p role="alert" className={styles.RequestStatus__error}>{errorMessage}</p>}
  </section>;
}
