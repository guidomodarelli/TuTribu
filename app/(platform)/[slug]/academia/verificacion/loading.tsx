/** Account verification skeleton: its real heading and one block per provider with its email field. @module academy-verification-loading */
import { RouteSkeleton, SkeletonActions, SkeletonBlock, SkeletonField, SkeletonLines } from "@/components/loaders/route-skeleton";
import styles from "./loading.module.scss";

/** Two providers, the usual minimum, each with one request action. */
const ACADEMY_VERIFICATION_LOADING_SHAPE = { providerKeys: ["first", "second"], providerActionCount: 1 } as const;

/** @returns The verification placeholder inside the platform layout's `main`. */
export default function AcademyVerificationLoading() {
  return <RouteSkeleton className={styles.AcademyVerificationLoading} label="Verificación de vinculación" status="Cargando la verificación…">
    <div className={styles.AcademyVerificationLoading__header}>
      <h1 className={styles.AcademyVerificationLoading__title}>Verificación de vinculación</h1>
      <SkeletonLines />
    </div>
    {ACADEMY_VERIFICATION_LOADING_SHAPE.providerKeys.map((key) => <div key={key} className={styles.AcademyVerificationLoading__provider}>
      <SkeletonBlock kind="heading" width="short" />
      <SkeletonBlock kind="text" width="medium" />
      <SkeletonField />
      <SkeletonActions align="start" count={ACADEMY_VERIFICATION_LOADING_SHAPE.providerActionCount} />
    </div>)}
  </RouteSkeleton>;
}
