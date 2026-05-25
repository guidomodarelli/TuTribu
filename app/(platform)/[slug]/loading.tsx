import styles from "./loading.module.scss";

const TRIBE_LOADING_SKELETON = {
  roundItemKeyPrefix: "tribe-loading-message",
  roundItemCount: 3,
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
      <section className={styles.TribeLoadingPage__round}>
        {Array.from({ length: TRIBE_LOADING_SKELETON.roundItemCount }).map(
          (_, roundItemIndex) => (
            <article
              className={styles.TribeLoadingPage__message}
              key={`${TRIBE_LOADING_SKELETON.roundItemKeyPrefix}${TRIBE_LOADING_SKELETON.keySeparator}${roundItemIndex}`}
            >
              <div className={styles.TribeLoadingPage__messageHeader}>
                <div className={styles.TribeLoadingPage__avatar} />
                <div className={styles.TribeLoadingPage__messageMeta}>
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
