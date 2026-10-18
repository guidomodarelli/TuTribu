/** Presents retained per-row outcomes without treating terminal conflicts as pending work. @module admission-batch-results */
import { Button } from "beez-ui";
import type { AdmissionBatchResultDto } from "@/src/modules/academy-admissions/application/results/admission-flow-result-schemas";
import type { AdmissionBatchReviewSelection } from "@/src/modules/academy-admissions/application/results/admission-review-intent";
import { ADMISSION_BATCH_REVIEW_COPY as COPY, ADMISSION_BATCH_REVIEW_RESULT_COPY } from "@/src/modules/academy-admissions/constants/admission-batch-review-ui";
import styles from "./styles.module.scss";

/** @param props - Confirmed public result and the original named manifest. @returns Readable persistent progress, conflicts and terminal outcomes. */
export function AdmissionBatchResults({ result, selection, dismissible, onDismiss }: { result: AdmissionBatchResultDto; selection: AdmissionBatchReviewSelection[]; dismissible: boolean; onDismiss: () => void }) {
  const names = new Map(selection.map((item) => [item.requestId.toLowerCase(), item.applicantName]));
  return <section className={styles.AdmissionBatchResults} aria-label={COPY.results}>
    <h2 className={styles.AdmissionBatchResults__title}>{COPY.results}</h2>
    <p role="status">{ADMISSION_BATCH_REVIEW_RESULT_COPY[result.result]}</p>
    <dl className={styles.AdmissionBatchResults__counts}><div><dt>{COPY.completed}</dt><dd>{result.completedCount}</dd></div><div><dt>{COPY.failed}</dt><dd>{result.failedCount}</dd></div><div><dt>{COPY.unresolved}</dt><dd>{result.unresolvedCount}</dd></div></dl>
    <ol className={styles.AdmissionBatchResults__list}>{result.items.map((item) => <li className={styles.AdmissionBatchResults__row} key={item.requestId}><h3 className={styles.AdmissionBatchResults__name}>{names.get(item.requestId.toLowerCase()) ?? COPY.unknownApplicant}</h3><p>{item.safeMessage}</p></li>)}</ol>
    {dismissible && <Button type="button" variant="secondary" onClick={onDismiss}>{COPY.dismiss}</Button>}
  </section>;
}
