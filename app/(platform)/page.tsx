import Link from "next/link";

import { siteConfig } from "@/src/shared/config/site";

const primaryLinkClassName =
  "inline-flex h-9 w-fit items-center justify-center rounded-xl bg-primary px-5 text-sm font-medium whitespace-nowrap text-primary-foreground transition-all hover:bg-primary/80";

const secondaryLinkClassName =
  "inline-flex h-9 w-fit items-center justify-center rounded-xl border border-border bg-background/70 px-5 text-sm font-medium whitespace-nowrap transition-all hover:bg-muted hover:text-foreground";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-6xl flex-col px-6 py-8 lg:px-10">
      <section className="relative overflow-hidden rounded-[2rem] border border-border/80 bg-card/90 px-6 py-8 shadow-[0_24px_80px_-48px_oklch(0.18_0_0_/_0.55)] backdrop-blur md:px-8">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-16 -top-20 h-56 w-56 rounded-full bg-primary/10 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-20 right-0 h-64 w-64 rounded-full bg-chart-1/15 blur-3xl"
        />
        <div className="max-w-3xl space-y-6">
          <p className="font-mono text-sm uppercase tracking-[0.22em] text-muted-foreground">
            Acceso principal
          </p>
          <h1 className="text-4xl font-semibold tracking-tight text-balance md:text-6xl">
            {siteConfig.name} centraliza el inicio de sesion y la base tecnica de la app.
          </h1>
          <p className="text-base leading-7 text-muted-foreground md:text-lg">
            Esta version mantiene un punto de entrada simple para autenticacion y evolucion
            incremental del producto.
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
