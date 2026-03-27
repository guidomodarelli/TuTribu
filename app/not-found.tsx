import Link from "next/link";

import { Button } from "@/components/ui/button";
import { createGetAuthenticatedMemberUseCase } from "@/src/modules/auth/infrastructure/composition/create-get-authenticated-member-use-case";
import styles from "./not-found.module.scss";

export default async function NotFoundPage() {
  const authenticatedMember =
    await createGetAuthenticatedMemberUseCase().execute();

  return (
    <main className={styles.NotFoundPage}>
      <div className={styles.NotFoundPage__backdrop} aria-hidden="true" />
      <p className={styles.NotFoundPage__eyebrow}>Error 404</p>
      <h1 className={styles.NotFoundPage__title}>
        Esta pagina no existe o ya no esta disponible
      </h1>
      <p className={styles.NotFoundPage__description}>
        Revisa la URL o vuelve a un punto conocido para seguir navegando dentro
        de AcademiaOnline.
      </p>
      <div className={styles.NotFoundPage__actions}>
        <Button asChild size="lg">
          <Link href="/">Volver al inicio</Link>
        </Button>
        {!authenticatedMember ? (
          <Button asChild size="lg" variant="outline">
            <Link href="/auth/signin">Iniciar sesion</Link>
          </Button>
        ) : null}
      </div>
    </main>
  );
}
