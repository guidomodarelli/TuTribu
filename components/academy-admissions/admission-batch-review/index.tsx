/** Presents explicit named batch confirmation and original recovery controls. @module admission-batch-review */
import { AnimatedCollapse, Button } from "@golfo/ui";
import { AdmissionDecisionForm, type AdmissionDecisionFormProps } from "@/components/academy-admissions/admission-decision-form";
import { AdmissionBatchResults } from "@/components/academy-admissions/admission-batch-results";
import type { AdmissionBatchResultDto } from "@/src/modules/academy-admissions/application/results/admission-flow-result-schemas";
import type { AdmissionBatchReviewSelection } from "@/src/modules/academy-admissions/application/results/admission-review-intent";
import { ADMISSION_BATCH_REVIEW_COPY as COPY } from "@/src/modules/academy-admissions/constants/admission-batch-review-ui";
import { ADMISSION_LIMIT } from "@/src/modules/academy-admissions/constants/admission-limits";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import styles from "./styles.module.scss";

/** The parent owns all writes, recovery, authority and retained results. */
export type AdmissionBatchReviewProps = AdmissionDecisionFormProps & {
  selection: AdmissionBatchReviewSelection[]; manifest: AdmissionBatchReviewSelection[]; result: AdmissionBatchResultDto | null;
  pending: boolean; canRetry: boolean; errorMessage: string | null; onClear: () => void; onRetry: () => void;
};

/** @param props - Current selection or immutable original and safe feedback. @returns Adjacent confirmation, recovery and retained per-row results. */
export function AdmissionBatchReview(props: AdmissionBatchReviewProps) {
  const selection = props.pending ? props.manifest : props.selection;
  const waiting = props.pending && props.result?.state !== OPERATION_STATE.completed;
  if (!selection.length && !props.result && !props.errorMessage) return null;
  return <div className={styles.AdmissionBatchReview}>
    {props.errorMessage && <p role="alert" className={styles.AdmissionBatchReview__error}>{props.errorMessage}</p>}
    {selection.length > 0 && (!props.pending || props.result?.state !== OPERATION_STATE.completed) && <AnimatedCollapse isOpen><section className={styles.AdmissionBatchReview__section} aria-label={COPY.title}>
      <h2 className={styles.AdmissionBatchReview__title}>{COPY.title}</h2>
      <p role="status">{COPY.selected}: {selection.length}. {COPY.limit}: {ADMISSION_LIMIT.batchRequestCount}.</p>
      <ol className={styles.AdmissionBatchReview__names}>{selection.map((item) => <li key={item.requestId}>{item.applicantName}</li>)}</ol>
      {!props.pending && <p>{COPY.revalidation}</p>}
      {props.pending && <p>{COPY.original}</p>}
      {!props.pending && selection.length === ADMISSION_LIMIT.batchRequestCount && <p>{COPY.limitReached}</p>}
      {waiting && <p role="status">{props.result ? COPY.started : COPY.uncertain}</p>}
      <AdmissionDecisionForm {...props} disabled={props.disabled || props.pending && !props.canRetry} locked={props.pending} allowApprove={!props.pending && props.allowApprove} allowReject={!props.pending && props.allowReject} confirmationLabel={COPY.confirmation} approveLabel={COPY.approve} rejectLabel={COPY.reject} writingLabel={COPY.writing} />
      {waiting && props.canRetry && <Button type="button" variant="secondary" disabled={props.disabled || !props.confirmed} onClick={props.onRetry}>{COPY.retry}</Button>}
      {!props.pending && <Button type="button" variant="ghost" disabled={props.busy} onClick={props.onClear}>{COPY.clear}</Button>}
    </section></AnimatedCollapse>}
    {props.result && <AdmissionBatchResults result={props.result} selection={props.manifest} dismissible={!props.pending && !props.busy} onDismiss={props.onClear} />}
  </div>;
}
