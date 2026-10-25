/** Academy home skeleton: its header, the member's access with its steps and the offer, without reading any session. @module academy-loading */
import { RouteSkeleton, SkeletonActions, SkeletonBlock, SkeletonFacts, SkeletonLines } from "@/components/loaders/route-skeleton";
import styles from "./loading.module.scss";

/** Placeholder counts that mirror the academy home: three access steps, a short benefit list and one price fact. */
const ACADEMY_LOADING_SHAPE = { stepKeys: ["verify", "contract", "access"], benefitLineCount: 4, priceFactCount: 1, accessActionCount: 2, offerActionCount: 1 } as const;

/** @returns The academy home placeholder inside the platform layout's `main`. */
export default function AcademyLoading() {
  return <RouteSkeleton className={styles.AcademyLoading} label="Academia" status="Cargando la academia…">
    <div className={styles.AcademyLoading__header}>
      <p className={styles.AcademyLoading__eyebrow}>Academia de la tribu</p>
      <SkeletonBlock kind="title" width="medium" />
      <SkeletonLines />
    </div>
    <div className={styles.AcademyLoading__section}>
      <SkeletonBlock kind="heading" width="short" />
      <span aria-hidden="true" className={styles.AcademyLoading__status}>
        <SkeletonBlock kind="badge" />
        <SkeletonBlock kind="text" width="long" />
      </span>
      {ACADEMY_LOADING_SHAPE.stepKeys.map((key) => <span key={key} aria-hidden="true" className={styles.AcademyLoading__step}>
        <SkeletonBlock kind="marker" />
        <SkeletonLines />
      </span>)}
      <SkeletonActions align="start" count={ACADEMY_LOADING_SHAPE.accessActionCount} />
    </div>
    <div className={styles.AcademyLoading__section}>
      <SkeletonBlock kind="heading" width="short" />
      <SkeletonLines count={ACADEMY_LOADING_SHAPE.benefitLineCount} />
      <SkeletonFacts count={ACADEMY_LOADING_SHAPE.priceFactCount} />
      <SkeletonActions align="start" count={ACADEMY_LOADING_SHAPE.offerActionCount} />
    </div>
  </RouteSkeleton>;
}
