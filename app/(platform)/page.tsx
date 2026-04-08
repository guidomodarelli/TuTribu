import Link from "next/link";

import { Button } from "@/components/ui/button";
import { ROUTES } from "@/src/constants/routes";
import { createRequestModules } from "@/src/modules/setup";
import styles from "./page.module.scss";

const HOME_PAGE_COPY = {
  eyebrow: "Bienvenido",
  title: "Un espacio para aprender, compartir y crecer en comunidad",
  authenticatedDescription:
    "Explora comunidades, conecta con otras personas y sigue construyendo tu espacio dentro de la plataforma.",
  unauthenticatedDescription:
    "Entra a tu cuenta para descubrir comunidades, conectar con otras personas y empezar a construir tu propio espacio.",
  signInAction: "Iniciar sesion",
} as const;

export default async function HomePage() {
  const modules = await createRequestModules();
  const authenticatedMember = await modules.auth.useCases.getAuthenticatedMember();

  return (
    <main className={styles.HomePage}>
      <p className={styles.HomePage__eyebrow}>{HOME_PAGE_COPY.eyebrow}</p>
      <h1 className={styles.HomePage__title}>{HOME_PAGE_COPY.title}</h1>
      <p className={styles.HomePage__description}>
        {authenticatedMember
          ? HOME_PAGE_COPY.authenticatedDescription
          : HOME_PAGE_COPY.unauthenticatedDescription}
      </p>
      {!authenticatedMember ? (
        <div className={styles.HomePage__actions}>
          <Button asChild>
            <Link href={ROUTES.auth.signIn}>{HOME_PAGE_COPY.signInAction}</Link>
          </Button>
        </div>
      ) : null}
    </main>
  );
}
