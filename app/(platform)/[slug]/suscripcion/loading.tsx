/** Subscription skeleton: the eyebrow, a title and description whose wording depends on the status, and one action. @module subscription-loading */
import { RouteSkeleton, SkeletonActions, SkeletonBlock, SkeletonLines } from "@/components/loaders/route-skeleton";
import styles from "./loading.module.scss";

/** Both subscription views end with a single action. */
const SUBSCRIPTION_LOADING_ACTION_COUNT = 1;

/** @returns The subscription placeholder inside the platform layout's `main`. */
export default function SubscriptionLoading() {
  return <RouteSkeleton className={styles.SubscriptionLoading} label="Suscripción" status="Cargando tu suscripción…">
    <p className={styles.SubscriptionLoading__eyebrow}>Suscripción</p>
    <SkeletonBlock kind="title" width="medium" />
    <SkeletonLines />
    <SkeletonBlock kind="text" width="short" />
    <SkeletonActions align="start" count={SUBSCRIPTION_LOADING_ACTION_COUNT} />
  </RouteSkeleton>;
}
