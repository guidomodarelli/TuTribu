/** Academy management skeleton: its real heading, the settings toggles and a filtered list. @module academy-management-loading */
import { RouteSkeleton, SkeletonBlock, SkeletonLines, SkeletonRows } from "@/components/loaders/route-skeleton";
import styles from "./loading.module.scss";

/** Placeholder counts that mirror the management page: two availability toggles and a page of rows. */
const ACADEMY_MANAGEMENT_LOADING_SHAPE = { toggleCount: 2, rowCount: 3 } as const;

/** @returns The management placeholder inside the platform layout's `main`. */
export default function AcademyManagementLoading() {
  return <RouteSkeleton className={styles.AcademyManagementLoading} label="Gestionar academia" status="Cargando la gestión de la academia…">
    <div className={styles.AcademyManagementLoading__header}>
      <SkeletonBlock kind="text" width="short" />
      <p className={styles.AcademyManagementLoading__eyebrow}>Academia de la tribu</p>
      <h1 className={styles.AcademyManagementLoading__title}>Gestionar academia</h1>
      <SkeletonLines />
    </div>
    <div className={styles.AcademyManagementLoading__section}>
      <SkeletonBlock kind="heading" width="short" />
      <SkeletonRows count={ACADEMY_MANAGEMENT_LOADING_SHAPE.toggleCount} />
    </div>
    <div className={styles.AcademyManagementLoading__section}>
      <SkeletonBlock kind="heading" width="medium" />
      <span aria-hidden="true" className={styles.AcademyManagementLoading__filters}>
        <SkeletonBlock kind="control" />
        <SkeletonBlock kind="button" />
      </span>
      <SkeletonRows count={ACADEMY_MANAGEMENT_LOADING_SHAPE.rowCount} />
    </div>
  </RouteSkeleton>;
}
