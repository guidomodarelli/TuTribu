import { Link } from "@/components/navigation/link";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/lib/site-config";
import styles from "./styles.module.scss";

const MAILTO_PROTOCOL = "mailto:";

type TribeCreationBlockedProps = {
  contactEmail: string | null;
};

export function TribeCreationBlocked({
  contactEmail,
}: TribeCreationBlockedProps) {
  return (
    <section className={styles.TribeCreationBlocked}>
      <header className={styles.TribeCreationBlocked__header}>
        <p className={styles.TribeCreationBlocked__eyebrow}>Acceso restringido</p>
        <h2 className={styles.TribeCreationBlocked__title}>
          Todavía no tienes permiso para crear una tribu
        </h2>
      </header>
      <div className={styles.TribeCreationBlocked__content}>
        <p className={styles.TribeCreationBlocked__description}>
          Estamos habilitando a los primeros creadores mediante una whitelist.
          Si quieres abrir tu tribu, escribenos y revisamos tu acceso.
        </p>

        {contactEmail ? (
          <Button asChild>
            <Link href={MAILTO_PROTOCOL + contactEmail}>Escribir a {contactEmail}</Link>
          </Button>
        ) : (
          <p className={styles.TribeCreationBlocked__note}>
            Contacta al equipo de {siteConfig.name} para pedir habilitacion.
          </p>
        )}
      </div>
    </section>
  );
}
