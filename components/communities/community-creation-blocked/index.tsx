import Link from "next/link";

import { Button } from "@/components/ui/button";
import { siteConfig } from "@/lib/site-config";
import styles from "./styles.module.scss";

const MAILTO_PROTOCOL = "mailto:";

type CommunityCreationBlockedProps = {
  contactEmail: string | null;
};

export function CommunityCreationBlocked({
  contactEmail,
}: CommunityCreationBlockedProps) {
  return (
    <section className={styles.CommunityCreationBlocked}>
      <header className={styles.CommunityCreationBlocked__header}>
        <p className={styles.CommunityCreationBlocked__eyebrow}>Acceso restringido</p>
        <h2 className={styles.CommunityCreationBlocked__title}>
          Todavia no tienes permiso para crear una tribu
        </h2>
      </header>
      <div className={styles.CommunityCreationBlocked__content}>
        <p className={styles.CommunityCreationBlocked__description}>
          Estamos habilitando a los primeros creadores mediante una whitelist.
          Si quieres abrir tu tribu, escribenos y revisamos tu acceso.
        </p>

        {contactEmail ? (
          <Button asChild>
            <Link href={MAILTO_PROTOCOL + contactEmail}>Escribir a {contactEmail}</Link>
          </Button>
        ) : (
          <p className={styles.CommunityCreationBlocked__note}>
            Contacta al equipo de {siteConfig.name} para pedir habilitacion.
          </p>
        )}
      </div>
    </section>
  );
}
