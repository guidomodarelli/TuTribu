/** Presents only safe retained history facts and route-owned recovery/navigation callbacks. @module admission-review-history */
import { ArrowLeftIcon } from "lucide-react";
import { Button } from "@golfo/ui";
import { ButtonLink, Link } from "@/components/navigation/link";
import { MorphBlock, SkeletonMorph } from "@/components/loaders/skeleton-morph";
import type { AdmissionReviewHistoryItemDto } from "@/src/modules/academy-admissions/constants/admission-review-history-schemas";
import { ADMISSION_REVIEW_HISTORY_ACTOR_LABEL, ADMISSION_REVIEW_HISTORY_COPY, ADMISSION_REVIEW_HISTORY_EVENT_LABEL } from "@/src/modules/academy-admissions/constants/admission-review-history-page";
import { ADMISSION_REVIEW_STATUS_LABEL } from "@/src/modules/academy-admissions/constants/admission-review-ui";
import { formatBuenosAiresShortDate, formatBuenosAiresTime } from "@/lib/date-time/buenos-aires-format";
import styles from "./styles.module.scss";

/** Events shown as skeletons while access is confirmed, and their height, close to one event with three facts. */
const HISTORY_PLACEHOLDER_COUNT = 3;
const HISTORY_PLACEHOLDER_HEIGHT = "5.5rem";

/** The route container owns current viewer checks and refresh; this presenter never reaches an adapter. */
export type AdmissionReviewHistoryProps = { items: readonly AdmissionReviewHistoryItemDto[]; checking: boolean; refreshDisabled: boolean; errorMessage: string | null; backHref: string; olderHref: string | null; newestHref: string | null; onRefresh: () => void };

/** @param props - Safe visible facts, allowlisted links and route-owned current-access recovery. @returns A plain semantic timeline without private notes, actor ids or provider diagnostics. */
export function AdmissionReviewHistory({ items, checking, refreshDisabled, errorMessage, backHref, olderHref, newestHref, onRefresh }: AdmissionReviewHistoryProps) {
  return <div className={styles.AdmissionReviewHistory}>
    <nav className={styles.AdmissionReviewHistory__toolbar} aria-label="Navegación del historial"><Link className={styles.AdmissionReviewHistory__back} href={backHref}><ArrowLeftIcon className={styles.AdmissionReviewHistory__backIcon} aria-hidden="true" />{ADMISSION_REVIEW_HISTORY_COPY.back}</Link><Button type="button" variant="secondary" size="sm" disabled={checking || refreshDisabled} onClick={onRefresh}>{ADMISSION_REVIEW_HISTORY_COPY.refresh}</Button></nav>
    {errorMessage && <p className={styles.AdmissionReviewHistory__error} role="alert">{errorMessage}</p>}
    {!errorMessage && <>
      {!checking && !items.length && <p role="status">{ADMISSION_REVIEW_HISTORY_COPY.empty}</p>}
      {/* Placeholders keep their positions so each one morphs into the event that takes its place once access is confirmed. */}
      <SkeletonMorph loading={checking} loadingLabel={ADMISSION_REVIEW_HISTORY_COPY.checking}>
        <ol className={styles.AdmissionReviewHistory__list} aria-label="Eventos de la solicitud">{checking
          ? Array.from({ length: HISTORY_PLACEHOLDER_COUNT }, (_placeholder, index) => <MorphBlock key={index} as="li" fill height={HISTORY_PLACEHOLDER_HEIGHT} className={styles.AdmissionReviewHistory__event} />)
          : items.map((event, index) => <MorphBlock key={index} as="li" fill height={HISTORY_PLACEHOLDER_HEIGHT} className={styles.AdmissionReviewHistory__event}>
            <div className={styles.AdmissionReviewHistory__eventHeader}><h2 className={styles.AdmissionReviewHistory__eventTitle}>{ADMISSION_REVIEW_HISTORY_EVENT_LABEL[event.eventType]}</h2><time className={styles.AdmissionReviewHistory__help} dateTime={event.createdAt}>{formatBuenosAiresShortDate(event.createdAt)} · {formatBuenosAiresTime(event.createdAt)}</time></div>
            <dl className={styles.AdmissionReviewHistory__facts}>
              <div className={styles.AdmissionReviewHistory__fact}><dt>{ADMISSION_REVIEW_HISTORY_COPY.actor}</dt><dd>{ADMISSION_REVIEW_HISTORY_ACTOR_LABEL[event.actorKind]}</dd></div>
              {event.fromStatus && <div className={styles.AdmissionReviewHistory__fact}><dt>{ADMISSION_REVIEW_HISTORY_COPY.from}</dt><dd>{ADMISSION_REVIEW_STATUS_LABEL[event.fromStatus]}</dd></div>}
              {event.toStatus && <div className={styles.AdmissionReviewHistory__fact}><dt>{ADMISSION_REVIEW_HISTORY_COPY.to}</dt><dd>{ADMISSION_REVIEW_STATUS_LABEL[event.toStatus]}</dd></div>}
              {event.resourceVersion !== null && <div className={styles.AdmissionReviewHistory__fact}><dt>{ADMISSION_REVIEW_HISTORY_COPY.version}</dt><dd>{event.resourceVersion}</dd></div>}
            </dl>
          </MorphBlock>)}</ol>
      </SkeletonMorph>
      {!checking && (olderHref || newestHref) && <nav className={styles.AdmissionReviewHistory__pages} aria-label="Páginas del historial">{newestHref && <ButtonLink variant="secondary" size="sm" href={newestHref}>{ADMISSION_REVIEW_HISTORY_COPY.newest}</ButtonLink>}{olderHref && <ButtonLink variant="secondary" size="sm" href={olderHref}>{ADMISSION_REVIEW_HISTORY_COPY.older}</ButtonLink>}</nav>}
    </>}
  </div>;
}
