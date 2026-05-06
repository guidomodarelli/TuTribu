import styles from "./loading.module.scss";

const TRIBE_LOADING_SKELETON = {
  feedItemKeyPrefix: "tribe-loading-post",
  feedItemCount: 3,
  filterKeyPrefix: "tribe-loading-filter",
  filterCount: 4,
  keySeparator: "-",
  statusAriaRole: "status",
  statusLabel: "Cargando seccion de tribu",
} as const;

export default function TribeLoadingPage() {
  return (
    <main
      className={styles.TribeLoadingPage}
      role={TRIBE_LOADING_SKELETON.statusAriaRole}
      aria-label={TRIBE_LOADING_SKELETON.statusLabel}
    >
      <span className={styles.TribeLoadingPage__srOnly}>
        {TRIBE_LOADING_SKELETON.statusLabel}
      </span>
      <section className={styles.TribeLoadingPage__composer}>
        <div className={styles.TribeLoadingPage__avatar} />
        <div className={styles.TribeLoadingPage__composerLine} />
      </section>
      <div className={styles.TribeLoadingPage__filters}>
        {Array.from({ length: TRIBE_LOADING_SKELETON.filterCount }).map(
          (_, filterIndex) => (
            <div
              className={styles.TribeLoadingPage__filter}
              key={`${TRIBE_LOADING_SKELETON.filterKeyPrefix}${TRIBE_LOADING_SKELETON.keySeparator}${filterIndex}`}
            />
          )
        )}
      </div>
      <section className={styles.TribeLoadingPage__feed}>
        {Array.from({ length: TRIBE_LOADING_SKELETON.feedItemCount }).map(
          (_, feedItemIndex) => (
            <article
              className={styles.TribeLoadingPage__post}
              key={`${TRIBE_LOADING_SKELETON.feedItemKeyPrefix}${TRIBE_LOADING_SKELETON.keySeparator}${feedItemIndex}`}
            >
              <div className={styles.TribeLoadingPage__postHeader}>
                <div className={styles.TribeLoadingPage__avatar} />
                <div className={styles.TribeLoadingPage__postMeta}>
                  <div className={styles.TribeLoadingPage__titleLine} />
                  <div className={styles.TribeLoadingPage__metaLine} />
                </div>
              </div>
              <div className={styles.TribeLoadingPage__bodyLine} />
              <div className={styles.TribeLoadingPage__shortBodyLine} />
            </article>
          )
        )}
      </section>
    </main>
  );
}
