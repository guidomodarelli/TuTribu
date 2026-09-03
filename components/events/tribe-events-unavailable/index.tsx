import { Link } from "@/components/navigation/link";
import { ROUTES } from "@/src/constants/routes";
import styles from "./styles.module.scss";

type TribeEventsUnavailableProps = {
  tribeSlug: string;
};

const COPY = {
  backToTribe: "Volver a la tribu",
  description: "No pudimos cargar los eventos. Intentá de nuevo en unos minutos.",
  heading: "Eventos",
  retry: "Reintentar",
} as const;

/**
 * Safe fallback for the events route when the listing cannot be resolved.
 */
export function TribeEventsUnavailable({ tribeSlug }: TribeEventsUnavailableProps) {
  return (
    <main className={styles.TribeEventsUnavailable}>
      <h1 className={styles.TribeEventsUnavailable__heading}>{COPY.heading}</h1>
      <p className={styles.TribeEventsUnavailable__description} role="alert">
        {COPY.description}
      </p>
      <div className={styles.TribeEventsUnavailable__actions}>
        <Link
          className={styles.TribeEventsUnavailable__link}
          href={ROUTES.tribes.events(tribeSlug)}
        >
          {COPY.retry}
        </Link>
        <Link
          className={styles.TribeEventsUnavailable__link}
          href={ROUTES.tribes.bySlug(tribeSlug)}
        >
          {COPY.backToTribe}
        </Link>
      </div>
    </main>
  );
}
