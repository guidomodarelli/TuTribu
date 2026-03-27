import Link from "next/link";

import { Button } from "@/components/ui/button";
import { ROUTES } from "@/src/constants/routes";
import { createGetAuthenticatedMemberUseCase } from "@/src/modules/auth/infrastructure/composition/create-get-authenticated-member-use-case";
import styles from "./not-found.module.scss";

const NOT_FOUND_UI = {
  ariaHidden: "true",
  buttonSize: "lg",
  outlineVariant: "outline",
} as const;

export default async function NotFoundPage() {
  const authenticatedMember =
    await createGetAuthenticatedMemberUseCase().execute();

  return (
    <main className={styles.NotFoundPage}>
      <div
        className={styles.NotFoundPage__backdrop}
        aria-hidden={NOT_FOUND_UI.ariaHidden}
      />
      <p className={styles.NotFoundPage__eyebrow}>Error 404</p>
      <h1 className={styles.NotFoundPage__title}>
        Esta pagina no existe o ya no esta disponible
      </h1>
      <p className={styles.NotFoundPage__description}>
        Revisa la URL o vuelve a un punto conocido para seguir navegando dentro
        de AcademiaOnline.
      </p>
      <div className={styles.NotFoundPage__actions}>
        <Button asChild size={NOT_FOUND_UI.buttonSize}>
          <Link href={ROUTES.home}>Volver al inicio</Link>
        </Button>
        {!authenticatedMember ? (
          <Button
            asChild
            size={NOT_FOUND_UI.buttonSize}
            variant={NOT_FOUND_UI.outlineVariant}
          >
            <Link href={ROUTES.auth.signIn}>Iniciar sesion</Link>
          </Button>
        ) : null}
      </div>
    </main>
  );
}
