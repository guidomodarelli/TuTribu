import Link from "next/link";
import { redirect } from "next/navigation";

import { ROUTES } from "@/src/constants/routes";
import { createRequestModules } from "@/src/modules/setup";
import styles from "./page.module.scss";

export function AuthErrorView() {
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

export async function AuthErrorContent() {
  const modules = await createRequestModules();
  const authenticatedMember = await modules.auth.useCases.getAuthenticatedMember();

  if (authenticatedMember) {
    redirect(ROUTES.home);
  }

  return <AuthErrorView />;
}
