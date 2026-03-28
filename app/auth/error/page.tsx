import Link from "next/link";
import { redirect } from "next/navigation";

import { ROUTES } from "@/src/constants/routes";
import { createAuthModule } from "@/src/modules/auth/setup";
import styles from "./page.module.scss";

export default async function AuthErrorPage() {
  const authenticatedMember = await createAuthModule().useCases.getAuthenticatedMember();

  if (authenticatedMember) {
    redirect(ROUTES.home);
  }

  return (
    <main className={styles.AuthErrorPage}>
      <section className={styles.AuthErrorPage__card}>
        <p className={styles.AuthErrorPage__eyebrow}>
          Error de autenticacion
        </p>
        <h1 className={styles.AuthErrorPage__title}>
          No pudimos completar el acceso con Google
        </h1>
        <p className={styles.AuthErrorPage__description}>
          Intenta de nuevo. Si el problema continua, contacta soporte.
        </p>
        <Link
          href={ROUTES.auth.signIn}
          className={styles.AuthErrorPage__link}
        >
          Volver a iniciar sesion
        </Link>
      </section>
    </main>
  );
}
