import styles from "./styles.module.scss";

const COPY = {
  emptyMonth: "No hay eventos este mes.",
  emptyMonthHint: "Cuando se programe un encuentro, va a aparecer acá.",
} as const;

/**
 * Quiet message shown when the visible month has no occurrences.
 */
export function TribeEventsEmptyState() {
  return (
    <div className={styles.TribeEventsEmptyState}>
      <p className={styles.TribeEventsEmptyState__title}>{COPY.emptyMonth}</p>
      <p className={styles.TribeEventsEmptyState__hint}>{COPY.emptyMonthHint}</p>
    </div>
  );
}
