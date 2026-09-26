import { Link } from "@/components/navigation/link";
import { Button } from "beez-ui";
import { siteConfig } from "@/lib/site-config";
import styles from "./styles.module.scss";

const MAILTO_PROTOCOL = "mailto:";

type TribeCreationBlockedProps = {
  contactEmail: string | null;
};

/**
 * Replaces the create-tribe form for accounts that are not whitelisted yet.
 * It is the only content of its page, so its title is the page heading.
 * @param props - Contact email to request access, when configured.
 * @returns The blocked state with a contact action.
 */
export function TribeCreationBlocked({
  contactEmail,
}: TribeCreationBlockedProps) {
  return (
    <section className={styles.TribeCreationBlocked}>
      <header className={styles.TribeCreationBlocked__header}>
        <p className={styles.TribeCreationBlocked__eyebrow}>Acceso restringido</p>
        <h1 className={styles.TribeCreationBlocked__title}>
          Todavía no tienes permiso para crear una tribu
        </h1>
      </header>
      <div className={styles.TribeCreationBlocked__content}>
        <p className={styles.TribeCreationBlocked__description}>
          Estamos habilitando a los primeros creadores mediante una whitelist.
          Si quieres abrir tu tribu, escríbenos y revisamos tu acceso.
        </p>

        {contactEmail ? (
          <Button asChild className={styles.TribeCreationBlocked__contact}>
            <Link href={MAILTO_PROTOCOL + contactEmail}>
              <span className={styles.TribeCreationBlocked__contactLabel}>
                Escribir a {contactEmail}
              </span>
            </Link>
          </Button>
        ) : (
          <p className={styles.TribeCreationBlocked__note}>
            Contacta al equipo de {siteConfig.name} para pedir habilitación.
          </p>
        )}
      </div>
    </section>
  );
}
