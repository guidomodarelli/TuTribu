import Link from "next/link";

import { Button } from "@/components/ui/button";
import styles from "./page.module.scss";

export default function HomePage() {
  return (
    <main className={styles.HomePage}>
      <p className={styles.HomePage__eyebrow}>Bienvenido</p>
      <h1 className={styles.HomePage__title}>
        Un espacio para aprender, compartir y crecer en comunidad
      </h1>
      <p className={styles.HomePage__description}>
        Entra a tu cuenta para descubrir comunidades, conectar con otras
        personas y empezar a construir tu propio espacio.
      </p>
      <div className={styles.HomePage__actions}>
        <Button asChild>
          <Link href="/auth/signin">Iniciar sesion</Link>
        </Button>
      </div>
    </main>
  );
}
