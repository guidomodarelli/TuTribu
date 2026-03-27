import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import styles from "./styles.module.scss";

const MAILTO_PROTOCOL = "mailto:";

type CommunityCreationBlockedProps = {
  contactEmail: string | null;
};

export function CommunityCreationBlocked({
  contactEmail,
}: CommunityCreationBlockedProps) {
  return (
    <Card className={styles.CommunityCreationBlocked}>
      <CardHeader className={styles.CommunityCreationBlocked__header}>
        <p className={styles.CommunityCreationBlocked__eyebrow}>Acceso restringido</p>
        <h2 className={styles.CommunityCreationBlocked__title}>
          Todavia no tienes permiso para crear una comunidad
        </h2>
      </CardHeader>
      <CardContent className={styles.CommunityCreationBlocked__content}>
        <p className={styles.CommunityCreationBlocked__description}>
          Estamos habilitando a los primeros creadores mediante una whitelist.
          Si quieres abrir tu comunidad, escribenos y revisamos tu acceso.
        </p>

        {contactEmail ? (
          <Button asChild>
            <Link href={MAILTO_PROTOCOL + contactEmail}>Escribir a {contactEmail}</Link>
          </Button>
        ) : (
          <p className={styles.CommunityCreationBlocked__note}>
            Contacta al equipo de AcademiaOnline para pedir habilitacion.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
