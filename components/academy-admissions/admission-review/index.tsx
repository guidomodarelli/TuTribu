/** Presents authorized review state and callbacks without importing auth or HTTP adapters. @module admission-review */
import { useId } from "react";
import { Button, Checkbox, Textarea } from "beez-ui";
import type { AdmissionReviewDto } from "@/src/modules/academy-admissions/application/results/admission-flow-result-schemas";
import { ADMISSION_REVIEW_UI_COPY } from "@/src/modules/academy-admissions/constants/admission-review-ui";
import { ADMISSION_DECISION } from "@/src/modules/academy-admissions/constants/admission-public-contract";
import { ADMISSION_EVIDENCE_KIND } from "@/src/modules/academy-admissions/constants/admission-eligibility";
import { ADMISSION_LIMIT } from "@/src/modules/academy-admissions/constants/admission-limits";
import { formatBuenosAiresShortDate, formatBuenosAiresTime } from "@/lib/date-time/buenos-aires-format";
import styles from "./styles.module.scss";

/** Callback-only props keep current-account and operation recovery in the route container. */
export type AdmissionReviewProps = {
  items: AdmissionReviewDto[]; selected: AdmissionReviewDto | null; hasMore: boolean;
  busy: boolean; disabled: boolean; confirmed: boolean; internalReason: string; externalMessage: string;
  errorMessage: string | null; statusMessage: string | null; uncertain: boolean; canRetry: boolean;
  onSelect: (id: string) => void; onClose: () => void; onRead: () => void; onLoadMore: () => void;
  onConfirm: (confirmed: boolean) => void; onInternalReason: (value: string) => void; onExternalMessage: (value: string) => void;
  onDecision: (decision: "approve" | "reject") => void; onRetry: () => void;
};

/** @param value - Own validated instant. @returns Deterministic Buenos Aires date/time on server and first client render. */
function describeInstant(value: string): string { return `${formatBuenosAiresShortDate(value)} · ${formatBuenosAiresTime(value)}`; }

/** @param props - Current allowlisted review data and route-owned state/callbacks. @returns A semantic responsive inbox/detail with explicit pre-action confirmation and visible feedback. */
export function AdmissionReview(props: AdmissionReviewProps) {
  const id = useId(), reasonId = `${id}-reason`, externalId = `${id}-external`, confirmId = `${id}-confirm`;
  const selected = props.selected;
  const evidenceCopy = selected?.evidence.kind === ADMISSION_EVIDENCE_KIND.base ? ADMISSION_REVIEW_UI_COPY.base : selected?.evidence.kind === ADMISSION_EVIDENCE_KIND.local ? ADMISSION_REVIEW_UI_COPY.local : selected?.evidence.kind === ADMISSION_EVIDENCE_KIND.declared ? ADMISSION_REVIEW_UI_COPY.declared : ADMISSION_REVIEW_UI_COPY.none;
  const canApprove = selected?.eligibleActions.includes(ADMISSION_DECISION.approve), canReject = selected?.eligibleActions.includes(ADMISSION_DECISION.reject);
  return <main className={styles.AdmissionReview}>
    <header className={styles.AdmissionReview__header}><h1 className={styles.AdmissionReview__title}>{ADMISSION_REVIEW_UI_COPY.title}</h1><p className={styles.AdmissionReview__help}>{ADMISSION_REVIEW_UI_COPY.description}</p></header>
    <div className={styles.AdmissionReview__actions}><Button variant="outline" onClick={props.onRead} disabled={props.busy}>{props.busy ? ADMISSION_REVIEW_UI_COPY.reading : ADMISSION_REVIEW_UI_COPY.read}</Button>{selected && <Button variant="ghost" onClick={props.onClose} disabled={props.busy || props.uncertain}>{ADMISSION_REVIEW_UI_COPY.close}</Button>}</div>
    {props.errorMessage && <p className={styles.AdmissionReview__error} role="alert">{props.errorMessage}</p>}
    {props.statusMessage && <p className={styles.AdmissionReview__help} role="status">{props.statusMessage}</p>}
    {props.uncertain && <section className={styles.AdmissionReview__section} aria-label="Recuperación de la decisión"><p role="status">{ADMISSION_REVIEW_UI_COPY.uncertain}</p>{props.canRetry && <Button variant="outline" disabled={props.busy || !props.confirmed} onClick={props.onRetry}>{ADMISSION_REVIEW_UI_COPY.retry}</Button>}</section>}
    {selected ? <section className={styles.AdmissionReview__section} aria-label="Detalle de la solicitud">
      <h2 className={styles.AdmissionReview__subtitle}>{selected.applicant.name}</h2>
      <dl className={styles.AdmissionReview__facts}>
        <div><dt>Presentación</dt><dd><time dateTime={selected.submittedAt}>{describeInstant(selected.submittedAt)}</time></dd></div>
        <div><dt>Vencimiento</dt><dd><time dateTime={selected.expiresAt}>{describeInstant(selected.expiresAt)}</time></dd></div>
        <div><dt>Contacto</dt><dd>{selected.rawContact ?? "No informado"}</dd></div>
      </dl>
      <p className={styles.AdmissionReview__help}>{evidenceCopy}</p>
      {selected.evidence.verifiedAt && <p className={styles.AdmissionReview__help}>Verificado el <time dateTime={selected.evidence.verifiedAt}>{describeInstant(selected.evidence.verifiedAt)}</time>.</p>}
      {selected.applicantMessage && <section className={styles.AdmissionReview__section}><h3 className={styles.AdmissionReview__label}>Mensaje del solicitante</h3><p>{selected.applicantMessage}</p></section>}
      {selected.internalReason && <section className={styles.AdmissionReview__section}><h3 className={styles.AdmissionReview__label}>Motivo interno registrado</h3><p>{selected.internalReason}</p></section>}
      {selected.externalMessage && <section className={styles.AdmissionReview__section}><h3 className={styles.AdmissionReview__label}>Mensaje externo registrado</h3><p>{selected.externalMessage}</p></section>}
      {selected.needsVerification && <p className={styles.AdmissionReview__help}>La solicitud necesita verificación adicional antes de aprobarse.</p>}
      {!canApprove && <p className={styles.AdmissionReview__help}>La aprobación no está disponible para el estado y las condiciones actuales de esta solicitud.</p>}
      {(canApprove || canReject || props.uncertain) && <form className={styles.AdmissionReview__section} onSubmit={(event) => event.preventDefault()}>
        <div className={styles.AdmissionReview__field}><label className={styles.AdmissionReview__label} htmlFor={reasonId}>{ADMISSION_REVIEW_UI_COPY.internalReason}</label><Textarea id={reasonId} value={props.internalReason} onChange={(event) => props.onInternalReason(event.target.value)} maxLength={ADMISSION_LIMIT.internalMessageCharacters} disabled={props.disabled || props.uncertain} aria-describedby={`${reasonId}-help`} /><p id={`${reasonId}-help`} className={styles.AdmissionReview__help}>{ADMISSION_REVIEW_UI_COPY.internalHelp} Hasta {ADMISSION_LIMIT.internalMessageCharacters} caracteres.</p></div>
        <div className={styles.AdmissionReview__field}><label className={styles.AdmissionReview__label} htmlFor={externalId}>{ADMISSION_REVIEW_UI_COPY.externalMessage}</label><Textarea id={externalId} value={props.externalMessage} onChange={(event) => props.onExternalMessage(event.target.value)} maxLength={ADMISSION_LIMIT.externalMessageCharacters} disabled={props.disabled || props.uncertain} aria-describedby={`${externalId}-help`} /><p id={`${externalId}-help`} className={styles.AdmissionReview__help}>{ADMISSION_REVIEW_UI_COPY.externalHelp} Hasta {ADMISSION_LIMIT.externalMessageCharacters} caracteres.</p></div>
        <div className={styles.AdmissionReview__confirmation}><Checkbox id={confirmId} checked={props.confirmed} disabled={props.disabled} onCheckedChange={(checked) => props.onConfirm(checked === true)} /><label htmlFor={confirmId}>{ADMISSION_REVIEW_UI_COPY.confirm}</label></div>
        <div className={styles.AdmissionReview__actions}>{canApprove && <Button type="button" disabled={props.disabled || props.uncertain || !props.confirmed || !props.internalReason.trim()} onClick={() => props.onDecision(ADMISSION_DECISION.approve)}>{props.busy ? ADMISSION_REVIEW_UI_COPY.writing : ADMISSION_REVIEW_UI_COPY.approve}</Button>}{canReject && <Button type="button" variant="outline" disabled={props.disabled || props.uncertain || !props.confirmed || !props.internalReason.trim()} onClick={() => props.onDecision(ADMISSION_DECISION.reject)}>{props.busy ? ADMISSION_REVIEW_UI_COPY.writing : ADMISSION_REVIEW_UI_COPY.reject}</Button>}</div>
      </form>}
    </section> : <section className={styles.AdmissionReview__section} aria-label="Bandeja de solicitudes">
      {!props.busy && !props.items.length && <p>{ADMISSION_REVIEW_UI_COPY.empty}</p>}
      <ol className={styles.AdmissionReview__list}>{props.items.map((request) => <li className={styles.AdmissionReview__row} key={request.id}><div><h2 className={styles.AdmissionReview__subtitle}>{request.applicant.name}</h2><p className={styles.AdmissionReview__help}><time dateTime={request.submittedAt}>{describeInstant(request.submittedAt)}</time> · {request.contact?.maskedValue ?? "Sin contacto"}</p></div><Button variant="outline" onClick={() => props.onSelect(request.id)} disabled={props.disabled || props.uncertain} aria-label={`${ADMISSION_REVIEW_UI_COPY.detail}: ${request.applicant.name}`}>{ADMISSION_REVIEW_UI_COPY.detail}</Button></li>)}</ol>
      {props.hasMore && <Button variant="outline" disabled={props.disabled || props.uncertain} onClick={props.onLoadMore}>{ADMISSION_REVIEW_UI_COPY.loadMore}</Button>}
    </section>}
  </main>;
}
