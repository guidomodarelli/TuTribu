/** Presents authorized review state and callbacks without importing auth or HTTP adapters. @module admission-review */
import { ArrowLeftIcon } from "lucide-react";
import { useId, type ReactNode, type Ref } from "react";
import { Badge, Button, Checkbox, type BadgeTone } from "@astra-kit/ui";
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

/** Status colors follow the request outcome: pending asks for attention, terminal outcomes stay quiet. */
const REVIEW_STATUS_TONE = { pending: "info", approved: "success", rejected: "danger", cancelled: "neutral", expired: "neutral" } as const satisfies Record<keyof typeof ADMISSION_REVIEW_STATUS_LABEL, BadgeTone>;

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
  statusRef?: Ref<HTMLParagraphElement>;
  onSelect: (id: string) => void; onClose: () => void; onRead: () => void; onLoadMore: () => void;
  onConfirm: (confirmed: boolean) => void; onInternalReason: (value: string) => void; onExternalMessage: (value: string) => void;
  onDecision: (decision: "approve" | "reject") => void; onRetry: () => void;
};

/** @param value - Own validated instant. @returns Deterministic Buenos Aires date/time on server and first client render. */
function describeInstant(value: string): string { return `${formatBuenosAiresShortDate(value)} · ${formatBuenosAiresTime(value)}`; }

/** @param props - Current request status and pending-age flag. @returns Quiet status badges that never replace the textual facts. */
function RequestBadges({ request }: { request: AdmissionReviewDto }) {
  return <ul className={styles.AdmissionReview__badges}>
    <li><Badge tone={REVIEW_STATUS_TONE[request.status]}>{ADMISSION_REVIEW_STATUS_LABEL[request.status]}</Badge></li>
    <li><Badge tone="neutral">{ADMISSION_REVIEW_SOURCE_LABEL[request.source]}</Badge></li>
    {request.pendingAgeThresholdReached && <li><Badge tone="warning">{ADMISSION_REVIEW_UI_COPY.pendingAgeHighlight}</Badge></li>}
  </ul>;
}

/** @param props - Current allowlisted review data and route-owned state/callbacks. @returns A semantic inbox/detail with explicit confirmation and a live region registered before its feedback changes. */
export function AdmissionReview({ statusRef, ...props }: AdmissionReviewProps) {
  const id = useId();
  const selected = props.selected;
  const eligibilityMessages = selected?.eligibilityReasons.flatMap((reason) => {
    const message = ADMISSION_REVIEW_ELIGIBILITY_COPY[reason];
    return message ? [{ reason, message }] : [];
  }) ?? [];
  const proofReasonVisible = eligibilityMessages.some(({ reason }) => reason === ADMISSION_DENIAL_REASON.proofRequired || reason === ADMISSION_DENIAL_REASON.evidenceRevoked);
  const evidenceCopy = selected?.evidence.kind === ADMISSION_EVIDENCE_KIND.base ? ADMISSION_REVIEW_UI_COPY.base : selected?.evidence.kind === ADMISSION_EVIDENCE_KIND.local ? ADMISSION_REVIEW_UI_COPY.local : selected?.evidence.kind === ADMISSION_EVIDENCE_KIND.declared ? ADMISSION_REVIEW_UI_COPY.declared : ADMISSION_REVIEW_UI_COPY.none;
  const canApprove = selected?.eligibleActions.includes(ADMISSION_DECISION.approve), canReject = selected?.eligibleActions.includes(ADMISSION_DECISION.reject);
  return <div className={styles.AdmissionReview}>
    {!selected && props.filters}
    <div className={styles.AdmissionReview__toolbar}>
      {selected && <Button variant="ghost" size="sm" onClick={props.onClose} disabled={props.busy || props.uncertain}><ArrowLeftIcon className={styles.AdmissionReview__backIcon} aria-hidden="true" />{ADMISSION_REVIEW_UI_COPY.close}</Button>}
      <Button variant="secondary" size="sm" onClick={props.onRead} disabled={props.busy}>{props.busy ? ADMISSION_REVIEW_UI_COPY.reading : ADMISSION_REVIEW_UI_COPY.read}</Button>
    </div>
    {props.errorMessage && <p className={`${styles.AdmissionReview__feedback} ${styles["AdmissionReview__feedback--alert"]}`} role="alert">{props.errorMessage}</p>}
    <p ref={statusRef} tabIndex={-1} className={styles.AdmissionReview__feedback} role="status" aria-live="polite" aria-atomic="true">{props.statusMessage ?? ""}</p>
    {props.recovery !== undefined ? props.recovery : props.uncertain && <section className={styles.AdmissionReview__callout} aria-label="Recuperación de la decisión"><p role="status">{ADMISSION_REVIEW_UI_COPY.uncertain}</p>{props.canRetry && <Button variant="secondary" disabled={props.busy || !props.confirmed} onClick={props.onRetry}>{ADMISSION_REVIEW_UI_COPY.retry}</Button>}</section>}
    {selected ? <section className={styles.AdmissionReview__detail} aria-label="Detalle de la solicitud">
      <header className={styles.AdmissionReview__detailHeader}>
        <h2 className={styles.AdmissionReview__name}>{selected.applicant.name}</h2>
        <RequestBadges request={selected} />
        {props.historyHref && !props.disabled && !props.busy && !props.uncertain && <Link className={styles.AdmissionReview__link} href={props.historyHref}>{ADMISSION_REVIEW_HISTORY_COPY.open}</Link>}
      </header>
      <dl className={styles.AdmissionReview__facts}>
        <div className={styles.AdmissionReview__fact}><dt>Presentación</dt><dd><time dateTime={selected.submittedAt}>{describeInstant(selected.submittedAt)}</time></dd></div>
        <div className={styles.AdmissionReview__fact}><dt>Vencimiento</dt><dd><time dateTime={selected.expiresAt}>{describeInstant(selected.expiresAt)}</time></dd></div>
        <div className={styles.AdmissionReview__fact}><dt>Contacto</dt><dd>{selected.rawContact ?? "No informado"}</dd></div>
        <div className={styles.AdmissionReview__fact}><dt>{ADMISSION_WHATSAPP_COPY.label}</dt><dd>{selected.whatsappNumber ?? ADMISSION_WHATSAPP_COPY.notProvided}{selected.whatsappNumber && <p className={styles.AdmissionReview__note}>{ADMISSION_WHATSAPP_COPY.declared}</p>}</dd></div>
      </dl>
      <div className={styles.AdmissionReview__notes}>
        <p className={styles.AdmissionReview__note}>{evidenceCopy}</p>
        {selected.evidence.verifiedAt && <p className={styles.AdmissionReview__note}>Verificado el <time dateTime={selected.evidence.verifiedAt}>{describeInstant(selected.evidence.verifiedAt)}</time>.</p>}
      </div>
      {selected.applicantMessage && <section className={styles.AdmissionReview__message}><h3 className={styles.AdmissionReview__label}>Mensaje del solicitante</h3><p className={styles.AdmissionReview__quote}>{selected.applicantMessage}</p></section>}
      {selected.internalReason && <section className={styles.AdmissionReview__message}><h3 className={styles.AdmissionReview__label}>Motivo interno registrado</h3><p className={styles.AdmissionReview__quote}>{selected.internalReason}</p></section>}
      {selected.externalMessage && <section className={styles.AdmissionReview__message}><h3 className={styles.AdmissionReview__label}>Mensaje externo registrado</h3><p className={styles.AdmissionReview__quote}>{selected.externalMessage}</p></section>}
      {(selected.needsVerification && !proofReasonVisible || eligibilityMessages.length > 0 || !canApprove) && <div className={styles.AdmissionReview__conditions}>
        {selected.needsVerification && !proofReasonVisible && <p className={styles.AdmissionReview__note}>La solicitud necesita verificación adicional antes de aprobarse.</p>}
        {eligibilityMessages.map(({ reason, message }) => <p key={reason} role="status" className={styles.AdmissionReview__note}>{message}</p>)}
        {!canApprove && <p className={styles.AdmissionReview__note}>La aprobación no está disponible para el estado y las condiciones actuales de esta solicitud.</p>}
      </div>}
      {(canApprove || canReject || props.uncertain) && <section className={styles.AdmissionReview__decision} aria-labelledby={`${id}-decision`}>
        <h3 id={`${id}-decision`} className={styles.AdmissionReview__sectionTitle}>Decisión</h3>
        <AdmissionDecisionForm internalReason={props.internalReason} externalMessage={props.externalMessage} confirmed={props.confirmed} disabled={props.disabled} busy={props.busy} locked={props.uncertain} allowApprove={Boolean(canApprove)} allowReject={Boolean(canReject)} onInternalReason={props.onInternalReason} onExternalMessage={props.onExternalMessage} onConfirm={props.onConfirm} onDecision={props.onDecision} />
      </section>}
    </section> : <section className={styles.AdmissionReview__inbox} aria-label="Bandeja de solicitudes">
      {!props.busy && !props.items.length && <p className={styles.AdmissionReview__empty}>{props.hasMore ? ADMISSION_REVIEW_FILTER_COPY.emptyPage : ADMISSION_REVIEW_UI_COPY.empty}</p>}
      <ol className={styles.AdmissionReview__list}>{props.items.map((request) => <li className={styles.AdmissionReview__row} key={request.id}>
        {props.batchSelection && <div className={styles.AdmissionReview__rowSelection}><Checkbox id={`${id}-${request.id}`} aria-label={`${ADMISSION_BATCH_REVIEW_COPY.selectPrefix} ${request.applicant.name}`} checked={props.batchSelection.ids.has(request.id)} disabled={props.batchSelection.disabled || request.status !== ADMISSION_REQUEST_STATUS.pending || !request.eligibleActions.length || !props.batchSelection.ids.has(request.id) && props.batchSelection.ids.size >= ADMISSION_LIMIT.batchRequestCount} onCheckedChange={(checked) => props.batchSelection?.onToggle(request.id, checked === true)} /><label className={styles.AdmissionReview__visuallyHidden} htmlFor={`${id}-${request.id}`}>{ADMISSION_BATCH_REVIEW_COPY.select}</label></div>}
        <div className={styles.AdmissionReview__rowMain}>
          <h2 className={styles.AdmissionReview__rowTitle}>{request.applicant.name}</h2>
          <RequestBadges request={request} />
          <p className={styles.AdmissionReview__note}><time dateTime={request.submittedAt}>{describeInstant(request.submittedAt)}</time> · {request.contact?.maskedValue ?? "Sin contacto"}</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => props.onSelect(request.id)} disabled={props.disabled || props.uncertain} aria-label={`${ADMISSION_REVIEW_UI_COPY.detail}: ${request.applicant.name}`}>{ADMISSION_REVIEW_UI_COPY.detail}</Button>
      </li>)}</ol>
      {props.hasMore && <div><Button variant="secondary" disabled={props.disabled || props.uncertain} onClick={props.onLoadMore}>{ADMISSION_REVIEW_UI_COPY.loadMore}</Button></div>}
    </section>}
    {!selected && props.batch}
  </div>;
}
