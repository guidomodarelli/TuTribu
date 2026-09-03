import styles from "./loading.module.scss";

const PLATFORM_LOADING = {
  lineCount: 3,
  lineKeyPrefix: "platform-loading-line-",
  statusLabel: "Cargando",
  statusRole: "status",
} as const;

/**
 * Generic platform fallback: gives every page segment its own Suspense
 * boundary so client navigations resolve instantly while the page data
 * streams in. Tribe segments use the round-shaped skeleton in «[slug]».
 */
export default function PlatformLoadingPage() {
  return (
    <main
      aria-label={PLATFORM_LOADING.statusLabel}
      className={styles.PlatformLoadingPage}
      role={PLATFORM_LOADING.statusRole}
    >
      <span className={styles.PlatformLoadingPage__srOnly}>
        {PLATFORM_LOADING.statusLabel}
      </span>
      <div className={styles.PlatformLoadingPage__title} />
      {Array.from({ length: PLATFORM_LOADING.lineCount }).map((_, lineIndex) => (
        <div
          className={styles.PlatformLoadingPage__line}
          key={PLATFORM_LOADING.lineKeyPrefix + String(lineIndex)}
        />
      ))}
    </main>
  );
}
