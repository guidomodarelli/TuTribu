/** Presents only safe retained history facts and route-owned recovery/navigation callbacks. @module admission-review-history */
import { Button } from "@astra-kit/ui";
import { Link } from "@/components/navigation/link";
import type { AdmissionReviewHistoryItemDto } from "@/src/modules/academy-admissions/application/results/admission-review-history-result";
import { ADMISSION_REVIEW_HISTORY_ACTOR_LABEL, ADMISSION_REVIEW_HISTORY_COPY, ADMISSION_REVIEW_HISTORY_EVENT_LABEL } from "@/src/modules/academy-admissions/constants/admission-review-history-page";
import { ADMISSION_REVIEW_STATUS_LABEL } from "@/src/modules/academy-admissions/constants/admission-review-ui";
import { formatBuenosAiresShortDate, formatBuenosAiresTime } from "@/lib/date-time/buenos-aires-format";
import styles from "./styles.module.scss";

/** The route container owns current viewer checks and refresh; this presenter never reaches an adapter. */
export type AdmissionReviewHistoryProps = { items: readonly AdmissionReviewHistoryItemDto[]; checking: boolean; refreshDisabled: boolean; errorMessage: string | null; backHref: string; olderHref: string | null; newestHref: string | null; onRefresh: () => void };

/** @param props - Safe visible facts, allowlisted links and route-owned current-access recovery. @returns A plain semantic timeline without private notes, actor ids or provider diagnostics. */
export function AdmissionReviewHistory({ items, checking, refreshDisabled, errorMessage, backHref, olderHref, newestHref, onRefresh }: AdmissionReviewHistoryProps) {
  return <div className={styles.AdmissionReviewHistory}>
    <nav className={styles.AdmissionReviewHistory__toolbar} aria-label="Navegación del historial"><Link className={styles.AdmissionReviewHistory__back} href={backHref}><span aria-hidden="true">←</span> {ADMISSION_REVIEW_HISTORY_COPY.back}</Link><Button type="button" variant="secondary" size="sm" disabled={checking || refreshDisabled} onClick={onRefresh}>{ADMISSION_REVIEW_HISTORY_COPY.refresh}</Button></nav>
    {checking && <p className={styles.AdmissionReviewHistory__help} role="status">{ADMISSION_REVIEW_HISTORY_COPY.checking}</p>}
    {errorMessage && <p className={styles.AdmissionReviewHistory__error} role="alert">{errorMessage}</p>}
    {!checking && !errorMessage && <>
      {!items.length && <p role="status">{ADMISSION_REVIEW_HISTORY_COPY.empty}</p>}
      <ol className={styles.AdmissionReviewHistory__list} aria-label="Eventos de la solicitud">{items.map((event) => <li key={event.id} className={styles.AdmissionReviewHistory__event}>
        <div className={styles.AdmissionReviewHistory__eventHeader}><h2 className={styles.AdmissionReviewHistory__eventTitle}>{ADMISSION_REVIEW_HISTORY_EVENT_LABEL[event.eventType]}</h2><time className={styles.AdmissionReviewHistory__help} dateTime={event.createdAt}>{formatBuenosAiresShortDate(event.createdAt)} · {formatBuenosAiresTime(event.createdAt)}</time></div>
        <dl className={styles.AdmissionReviewHistory__facts}>
          <div className={styles.AdmissionReviewHistory__fact}><dt>{ADMISSION_REVIEW_HISTORY_COPY.actor}</dt><dd>{ADMISSION_REVIEW_HISTORY_ACTOR_LABEL[event.actorKind]}</dd></div>
          {event.fromStatus && <div className={styles.AdmissionReviewHistory__fact}><dt>{ADMISSION_REVIEW_HISTORY_COPY.from}</dt><dd>{ADMISSION_REVIEW_STATUS_LABEL[event.fromStatus]}</dd></div>}
          {event.toStatus && <div className={styles.AdmissionReviewHistory__fact}><dt>{ADMISSION_REVIEW_HISTORY_COPY.to}</dt><dd>{ADMISSION_REVIEW_STATUS_LABEL[event.toStatus]}</dd></div>}
          {event.resourceVersion !== null && <div className={styles.AdmissionReviewHistory__fact}><dt>{ADMISSION_REVIEW_HISTORY_COPY.version}</dt><dd>{event.resourceVersion}</dd></div>}
        </dl>
      </li>)}</ol>
      {(olderHref || newestHref) && <nav className={styles.AdmissionReviewHistory__pages} aria-label="Páginas del historial">{newestHref && <Link className={styles.AdmissionReviewHistory__page} href={newestHref}>{ADMISSION_REVIEW_HISTORY_COPY.newest}</Link>}{olderHref && <Link className={styles.AdmissionReviewHistory__page} href={olderHref}>{ADMISSION_REVIEW_HISTORY_COPY.older}</Link>}</nav>}
    </>}
  </div>;
}
