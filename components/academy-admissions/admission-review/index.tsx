/** Presents authorized review state and callbacks without importing auth or HTTP adapters. @module admission-review */
import { useId, type ReactNode } from "react";
import { Button, Checkbox } from "beez-ui";
import { AdmissionDecisionForm } from "@/components/academy-admissions/admission-decision-form";
import { Link } from "@/components/navigation/link";
import type { AdmissionReviewDto } from "@/src/modules/academy-admissions/application/results/admission-flow-result-schemas";
import { ADMISSION_REVIEW_UI_COPY, ADMISSION_REVIEW_ELIGIBILITY_COPY, ADMISSION_REVIEW_STATUS_LABEL, ADMISSION_REVIEW_SOURCE_LABEL } from "@/src/modules/academy-admissions/constants/admission-review-ui";
import { ADMISSION_DECISION } from "@/src/modules/academy-admissions/constants/admission-public-contract";
import { ADMISSION_EVIDENCE_KIND, ADMISSION_DENIAL_REASON } from "@/src/modules/academy-admissions/constants/admission-eligibility";
import { ADMISSION_LIMIT } from "@/src/modules/academy-admissions/constants/admission-limits";
import { ADMISSION_REVIEW_FILTER_COPY } from "@/src/modules/academy-admissions/constants/admission-review-filters";
import { ADMISSION_REVIEW_HISTORY_COPY } from "@/src/modules/academy-admissions/constants/admission-review-history-page";
import { ADMISSION_BATCH_REVIEW_COPY } from "@/src/modules/academy-admissions/constants/admission-batch-review-ui";
import { ADMISSION_REQUEST_STATUS } from "@/src/modules/academy-admissions/constants/admission-request";
import { formatBuenosAiresShortDate, formatBuenosAiresTime } from "@/lib/date-time/buenos-aires-format";
import styles from "./styles.module.scss";
import { ADMISSION_WHATSAPP_COPY } from "@/src/modules/academy-admissions/constants/admission-whatsapp-number";

/** Callback-only props keep current-account and operation recovery in the route container. */
export type AdmissionReviewProps = {
  filters?: ReactNode;
  batch?: ReactNode;
  recovery?: ReactNode;
  batchSelection?: { ids: ReadonlySet<string>; disabled: boolean; onToggle: (id: string, checked: boolean) => void };
  historyHref?: string;
  items: AdmissionReviewDto[]; selected: AdmissionReviewDto | null; hasMore: boolean;
  busy: boolean; disabled: boolean; confirmed: boolean; internalReason: string; externalMessage: string;
  errorMessage: string | null; statusMessage: string | null; uncertain: boolean; canRetry: boolean;
  onSelect: (id: string) => void; onClose: () => void; onRead: () => void; onLoadMore: () => void;
  onConfirm: (confirmed: boolean) => void; onInternalReason: (value: string) => void; onExternalMessage: (value: string) => void;
  onDecision: (decision: "approve" | "reject") => void; onRetry: () => void;
};

/** @param value - Own validated instant. @returns Deterministic Buenos Aires date/time on server and first client render. */
function describeInstant(value: string): string { return `${formatBuenosAiresShortDate(value)} · ${formatBuenosAiresTime(value)}`; }

/** @param props - Current allowlisted review data and route-owned state/callbacks. @returns A semantic inbox/detail with explicit confirmation and a live region registered before its feedback changes. */
export function AdmissionReview(props: AdmissionReviewProps) {
  const id = useId();
  const selected = props.selected;
  const eligibilityMessages = selected?.eligibilityReasons.flatMap((reason) => {
    const message = ADMISSION_REVIEW_ELIGIBILITY_COPY[reason];
    return message ? [{ reason, message }] : [];
  }) ?? [];
  const proofReasonVisible = eligibilityMessages.some(({ reason }) => reason === ADMISSION_DENIAL_REASON.proofRequired || reason === ADMISSION_DENIAL_REASON.evidenceRevoked);
  const evidenceCopy = selected?.evidence.kind === ADMISSION_EVIDENCE_KIND.base ? ADMISSION_REVIEW_UI_COPY.base : selected?.evidence.kind === ADMISSION_EVIDENCE_KIND.local ? ADMISSION_REVIEW_UI_COPY.local : selected?.evidence.kind === ADMISSION_EVIDENCE_KIND.declared ? ADMISSION_REVIEW_UI_COPY.declared : ADMISSION_REVIEW_UI_COPY.none;
  const canApprove = selected?.eligibleActions.includes(ADMISSION_DECISION.approve), canReject = selected?.eligibleActions.includes(ADMISSION_DECISION.reject);
  return <main className={styles.AdmissionReview}>
    <header className={styles.AdmissionReview__header}><h1 className={styles.AdmissionReview__title}>{ADMISSION_REVIEW_UI_COPY.title}</h1><p className={styles.AdmissionReview__help}>{ADMISSION_REVIEW_UI_COPY.description}</p></header>
    {!selected && props.filters}
    <div className={styles.AdmissionReview__actions}><Button variant="outline" onClick={props.onRead} disabled={props.busy}>{props.busy ? ADMISSION_REVIEW_UI_COPY.reading : ADMISSION_REVIEW_UI_COPY.read}</Button>{selected && <Button variant="ghost" onClick={props.onClose} disabled={props.busy || props.uncertain}>{ADMISSION_REVIEW_UI_COPY.close}</Button>}</div>
    {props.errorMessage && <p className={styles.AdmissionReview__error} role="alert">{props.errorMessage}</p>}
    <p className={styles.AdmissionReview__feedback} role="status" aria-live="polite" aria-atomic="true">{props.statusMessage ?? ""}</p>
    {props.recovery !== undefined ? props.recovery : props.uncertain && <section className={styles.AdmissionReview__section} aria-label="Recuperación de la decisión"><p role="status">{ADMISSION_REVIEW_UI_COPY.uncertain}</p>{props.canRetry && <Button variant="outline" disabled={props.busy || !props.confirmed} onClick={props.onRetry}>{ADMISSION_REVIEW_UI_COPY.retry}</Button>}</section>}
    {selected ? <section className={styles.AdmissionReview__section} aria-label="Detalle de la solicitud">
      <h2 className={styles.AdmissionReview__subtitle}>{selected.applicant.name}</h2>
      {selected.pendingAgeThresholdReached && <p className={styles.AdmissionReview__ageHighlight}>{ADMISSION_REVIEW_UI_COPY.pendingAgeHighlight}</p>}
      {props.historyHref && !props.disabled && !props.busy && !props.uncertain && <Link href={props.historyHref}>{ADMISSION_REVIEW_HISTORY_COPY.open}</Link>}
      <dl className={styles.AdmissionReview__facts}>
        <div><dt>Presentación</dt><dd><time dateTime={selected.submittedAt}>{describeInstant(selected.submittedAt)}</time></dd></div>
        <div><dt>Vencimiento</dt><dd><time dateTime={selected.expiresAt}>{describeInstant(selected.expiresAt)}</time></dd></div>
        <div><dt>Contacto</dt><dd>{selected.rawContact ?? "No informado"}</dd></div>
        <div><dt>{ADMISSION_WHATSAPP_COPY.label}</dt><dd>{selected.whatsappNumber ?? ADMISSION_WHATSAPP_COPY.notProvided}{selected.whatsappNumber && <p className={styles.AdmissionReview__help}>{ADMISSION_WHATSAPP_COPY.declared}</p>}</dd></div>
        <div><dt>Estado</dt><dd>{ADMISSION_REVIEW_STATUS_LABEL[selected.status]}</dd></div>
        <div><dt>Origen</dt><dd>{ADMISSION_REVIEW_SOURCE_LABEL[selected.source]}</dd></div>
      </dl>
      <p className={styles.AdmissionReview__help}>{evidenceCopy}</p>
      {selected.evidence.verifiedAt && <p className={styles.AdmissionReview__help}>Verificado el <time dateTime={selected.evidence.verifiedAt}>{describeInstant(selected.evidence.verifiedAt)}</time>.</p>}
      {selected.applicantMessage && <section className={styles.AdmissionReview__section}><h3 className={styles.AdmissionReview__label}>Mensaje del solicitante</h3><p>{selected.applicantMessage}</p></section>}
      {selected.internalReason && <section className={styles.AdmissionReview__section}><h3 className={styles.AdmissionReview__label}>Motivo interno registrado</h3><p>{selected.internalReason}</p></section>}
      {selected.externalMessage && <section className={styles.AdmissionReview__section}><h3 className={styles.AdmissionReview__label}>Mensaje externo registrado</h3><p>{selected.externalMessage}</p></section>}
      {selected.needsVerification && !proofReasonVisible && <p className={styles.AdmissionReview__help}>La solicitud necesita verificación adicional antes de aprobarse.</p>}
      {eligibilityMessages.map(({ reason, message }) => <p key={reason} role="status" className={styles.AdmissionReview__help}>{message}</p>)}
      {!canApprove && <p className={styles.AdmissionReview__help}>La aprobación no está disponible para el estado y las condiciones actuales de esta solicitud.</p>}
      {(canApprove || canReject || props.uncertain) && <AdmissionDecisionForm internalReason={props.internalReason} externalMessage={props.externalMessage} confirmed={props.confirmed} disabled={props.disabled} busy={props.busy} locked={props.uncertain} allowApprove={Boolean(canApprove)} allowReject={Boolean(canReject)} onInternalReason={props.onInternalReason} onExternalMessage={props.onExternalMessage} onConfirm={props.onConfirm} onDecision={props.onDecision} />}
    </section> : <section className={styles.AdmissionReview__section} aria-label="Bandeja de solicitudes">
      {!props.busy && !props.items.length && <p>{props.hasMore ? ADMISSION_REVIEW_FILTER_COPY.emptyPage : ADMISSION_REVIEW_UI_COPY.empty}</p>}
      <ol className={styles.AdmissionReview__list}>{props.items.map((request) => <li className={styles.AdmissionReview__row} key={request.id}><div><h2 className={styles.AdmissionReview__subtitle}>{request.applicant.name}</h2>{request.pendingAgeThresholdReached && <p className={styles.AdmissionReview__ageHighlight}>{ADMISSION_REVIEW_UI_COPY.pendingAgeHighlight}</p>}<p className={styles.AdmissionReview__help}>{ADMISSION_REVIEW_STATUS_LABEL[request.status]} · {ADMISSION_REVIEW_SOURCE_LABEL[request.source]} · <time dateTime={request.submittedAt}>{describeInstant(request.submittedAt)}</time> · {request.contact?.maskedValue ?? "Sin contacto"}</p></div>{props.batchSelection && <div className={styles.AdmissionReview__rowSelection}><Checkbox id={`${id}-${request.id}`} aria-label={`${ADMISSION_BATCH_REVIEW_COPY.selectPrefix} ${request.applicant.name}`} checked={props.batchSelection.ids.has(request.id)} disabled={props.batchSelection.disabled || request.status !== ADMISSION_REQUEST_STATUS.pending || !request.eligibleActions.length || !props.batchSelection.ids.has(request.id) && props.batchSelection.ids.size >= ADMISSION_LIMIT.batchRequestCount} onCheckedChange={(checked) => props.batchSelection?.onToggle(request.id, checked === true)} /><label htmlFor={`${id}-${request.id}`}>{ADMISSION_BATCH_REVIEW_COPY.select}</label></div>}<Button variant="outline" onClick={() => props.onSelect(request.id)} disabled={props.disabled || props.uncertain} aria-label={`${ADMISSION_REVIEW_UI_COPY.detail}: ${request.applicant.name}`}>{ADMISSION_REVIEW_UI_COPY.detail}</Button></li>)}</ol>
      {props.hasMore && <Button variant="outline" disabled={props.disabled || props.uncertain} onClick={props.onLoadMore}>{ADMISSION_REVIEW_UI_COPY.loadMore}</Button>}
    </section>}
    {!selected && props.batch}
  </main>;
}
