import Link from "next/link";

import { Button } from "@/components/ui/button";
import styles from "./page.module.scss";

export default function HomePage() {
  return (
    <main className={styles.HomePage}>
      <p className={styles.HomePage__eyebrow}>Base privada</p>
      <h1 className={styles.HomePage__title}>
        AcademiaOnline centraliza el inicio de sesion y la base tecnica de la app
      </h1>
      <p className={styles.HomePage__description}>
        Usa Google con Supabase Auth para entrar al panel y validar la integracion
        SSR del proyecto.
      </p>
      <div className={styles.HomePage__actions}>
        <Button asChild>
          <Link href="/auth/signin">Iniciar sesion</Link>
        </Button>
      </div>
    </main>
  );
}
