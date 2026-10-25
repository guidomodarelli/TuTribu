/** Channel management skeleton: its real headings, the create form and the configured channel rows. @module channels-loading */
import { RouteSkeleton, SkeletonBlock, SkeletonLines } from "@/components/loaders/route-skeleton";
import styles from "./loading.module.scss";

/** Three configured channels, each with its icon, name field and save and delete actions. */
const CHANNELS_LOADING_SHAPE = { channelKeys: ["first", "second", "third"] } as const;

/** @returns The channels placeholder inside the platform layout's `main`. */
export default function ChannelsLoading() {
  return <RouteSkeleton className={styles.ChannelsLoading} label="Canales" status="Cargando los canales…">
    <div className={styles.ChannelsLoading__header}>
      <h1 className={styles.ChannelsLoading__title}>Canales</h1>
      <SkeletonLines />
    </div>
    <div className={styles.ChannelsLoading__section}>
      <div className={styles.ChannelsLoading__intro}>
        <h2 className={styles.ChannelsLoading__sectionTitle}>Nuevo canal</h2>
        <SkeletonLines />
      </div>
      <span aria-hidden="true" className={styles.ChannelsLoading__create}>
        <SkeletonBlock kind="marker" />
        <SkeletonBlock kind="control" />
        <SkeletonBlock kind="button" />
      </span>
    </div>
    <div className={styles.ChannelsLoading__section}>
      <div className={styles.ChannelsLoading__intro}>
        <h2 className={styles.ChannelsLoading__sectionTitle}>Canales configurados</h2>
        <SkeletonLines />
      </div>
      <span aria-hidden="true" className={styles.ChannelsLoading__list}>
        {CHANNELS_LOADING_SHAPE.channelKeys.map((key) => <span key={key} className={styles.ChannelsLoading__item}>
          <span className={styles.ChannelsLoading__fields}>
            <SkeletonBlock kind="marker" />
            <SkeletonBlock kind="control" />
          </span>
          <span className={styles.ChannelsLoading__actions}>
            <SkeletonBlock kind="button" />
            <SkeletonBlock kind="marker" />
          </span>
        </span>)}
      </span>
    </div>
  </RouteSkeleton>;
}
