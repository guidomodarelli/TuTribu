import styles from "./loading.module.scss";

const COMMUNITY_LOADING_SKELETON = {
  feedItemKeyPrefix: "community-loading-post",
  feedItemCount: 3,
  filterKeyPrefix: "community-loading-filter",
  filterCount: 4,
  keySeparator: "-",
  statusAriaRole: "status",
  statusLabel: "Cargando seccion de tribu",
} as const;

export default function CommunityLoadingPage() {
  return (
    <main
      className={styles.CommunityLoadingPage}
      role={COMMUNITY_LOADING_SKELETON.statusAriaRole}
      aria-label={COMMUNITY_LOADING_SKELETON.statusLabel}
    >
      <span className={styles.CommunityLoadingPage__srOnly}>
        {COMMUNITY_LOADING_SKELETON.statusLabel}
      </span>
      <section className={styles.CommunityLoadingPage__composer}>
        <div className={styles.CommunityLoadingPage__avatar} />
        <div className={styles.CommunityLoadingPage__composerLine} />
      </section>
      <div className={styles.CommunityLoadingPage__filters}>
        {Array.from({ length: COMMUNITY_LOADING_SKELETON.filterCount }).map(
          (_, filterIndex) => (
            <div
              className={styles.CommunityLoadingPage__filter}
              key={`${COMMUNITY_LOADING_SKELETON.filterKeyPrefix}${COMMUNITY_LOADING_SKELETON.keySeparator}${filterIndex}`}
            />
          )
        )}
      </div>
      <section className={styles.CommunityLoadingPage__feed}>
        {Array.from({ length: COMMUNITY_LOADING_SKELETON.feedItemCount }).map(
          (_, feedItemIndex) => (
            <article
              className={styles.CommunityLoadingPage__post}
              key={`${COMMUNITY_LOADING_SKELETON.feedItemKeyPrefix}${COMMUNITY_LOADING_SKELETON.keySeparator}${feedItemIndex}`}
            >
              <div className={styles.CommunityLoadingPage__postHeader}>
                <div className={styles.CommunityLoadingPage__avatar} />
                <div className={styles.CommunityLoadingPage__postMeta}>
                  <div className={styles.CommunityLoadingPage__titleLine} />
                  <div className={styles.CommunityLoadingPage__metaLine} />
                </div>
              </div>
              <div className={styles.CommunityLoadingPage__bodyLine} />
              <div className={styles.CommunityLoadingPage__shortBodyLine} />
            </article>
          )
        )}
      </section>
    </main>
  );
}
