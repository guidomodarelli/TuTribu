import Link from "next/link";

import { siteConfig } from "@/src/shared/config/site";

const primaryLinkClassName =
  "inline-flex w-fit items-center rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90";

const secondaryLinkClassName =
  "inline-flex w-fit items-center rounded-lg border border-border/80 bg-background/80 px-4 py-3 text-sm font-medium text-foreground transition-all hover:bg-secondary";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-8 lg:px-10">
      <section className="rounded-[2rem] border border-border/80 bg-card/90 px-6 py-6 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.45)] backdrop-blur md:px-8">
        <div className="max-w-3xl space-y-6">
          <p className="font-mono text-sm uppercase tracking-[0.22em] text-muted-foreground">
            Acceso principal
          </p>
          <h1 className="text-4xl font-semibold tracking-tight text-balance md:text-6xl">
            {siteConfig.name} centraliza el inicio de sesion y la base tecnica de la app.
          </h1>
          <p className="text-base leading-7 text-muted-foreground md:text-lg">
            Esta version mantiene un punto de entrada simple para autenticacion y
            evolucion incremental del producto.
          </p>
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <Link href="/auth/signin" className={primaryLinkClassName}>
              Iniciar sesion
            </Link>
            <Link href="/auth/error" className={secondaryLinkClassName}>
              Ver pagina de error de acceso
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
