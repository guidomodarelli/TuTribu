/** Content skeleton of an admission page; the shared admissions layout keeps the heading and section row on screen. @module admission-page-skeleton */
import styles from "./styles.module.scss";

/** Placeholder counts that mirror a summary and a short list. */
const ADMISSION_SKELETON_SHAPE = { rowCount: 3, factCount: 3 } as const;

/** @param prefix - Placeholder group. @param count - Placeholders in the group. @returns Stable keys for lists that never reorder. */
function placeholderKeys(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_placeholder, index) => `${prefix}-${index}`);
}

/**
 * @param props - The loading announcement of the page.
 * @returns One busy status with placeholders shaped like a summary and its rows; it reads no session, storage or clock.
 */
export function AdmissionPageSkeleton({ label }: { label: string }) {
  return <div className={styles.AdmissionPageSkeleton} aria-busy="true">
    <p className={styles.AdmissionPageSkeleton__status} role="status">{label}</p>
    <div className={styles.AdmissionPageSkeleton__summary} aria-hidden="true">
      {placeholderKeys("fact", ADMISSION_SKELETON_SHAPE.factCount).map((key) => <span key={key} className={styles.AdmissionPageSkeleton__fact}>
        <span className={`${styles.AdmissionPageSkeleton__block} ${styles["AdmissionPageSkeleton__block--term"]}`} />
        <span className={`${styles.AdmissionPageSkeleton__block} ${styles["AdmissionPageSkeleton__block--value"]}`} />
      </span>)}
    </div>
    <div className={styles.AdmissionPageSkeleton__rows} aria-hidden="true">
      {placeholderKeys("row", ADMISSION_SKELETON_SHAPE.rowCount).map((key) => <span key={key} className={styles.AdmissionPageSkeleton__row}>
        <span className={styles.AdmissionPageSkeleton__rowText}>
          <span className={`${styles.AdmissionPageSkeleton__block} ${styles["AdmissionPageSkeleton__block--rowTitle"]}`} />
          <span className={`${styles.AdmissionPageSkeleton__block} ${styles["AdmissionPageSkeleton__block--rowMeta"]}`} />
        </span>
        <span className={`${styles.AdmissionPageSkeleton__block} ${styles["AdmissionPageSkeleton__block--action"]}`} />
      </span>)}
    </div>
  </div>;
}
