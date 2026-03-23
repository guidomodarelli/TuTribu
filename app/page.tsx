import Link from "next/link";
import { ArrowRight, CalendarDays, GraduationCap, MessagesSquare } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { siteConfig } from "@/src/shared/config/site";

const featureCards = [
  {
    title: "Rutas de aprendizaje estructuradas",
    description:
      "Construye un plan modular con vistas de cursos, puntos de avance y espacios dedicados para cada cohorte.",
    icon: GraduationCap,
  },
  {
    title: "Conversaciones de miembros enfocadas",
    description:
      "Mantiene discusiones sobre avances, bloqueos y objetivos semanales sin acoplar aun la interfaz a un backend.",
    icon: MessagesSquare,
  },
  {
    title: "Eventos con cadencia clara",
    description:
      "Reserva espacio para sesiones en vivo, horas de consulta y seguimientos asincronos en una sola vista de calendario.",
    icon: CalendarDays,
  },
] as const;

const primaryLinkClassName =
  "inline-flex w-fit items-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90";

const secondaryLinkClassName =
  "inline-flex w-fit items-center rounded-lg border border-border/80 bg-background/80 px-4 py-3 text-sm font-medium text-foreground transition-all hover:bg-secondary";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-8 lg:px-10">
      <section className="rounded-[2rem] border border-border/80 bg-card/90 px-6 py-6 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.45)] backdrop-blur md:px-8">
        <div className="flex flex-col gap-10">
          <header className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div className="max-w-2xl space-y-5">
              <p className="font-mono text-sm uppercase tracking-[0.22em] text-muted-foreground">
                Base tecnica
              </p>
              <div className="space-y-4">
                <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance md:text-6xl">
                  {siteConfig.name} esta lista para evolucionar hacia una
                  plataforma online de comunidad enfocada.
                </h1>
                <p className="max-w-2xl text-base leading-7 text-muted-foreground md:text-lg">
                  Esta primera iteracion prioriza arquitectura, modulos tipados
                  por funcionalidad y una base de pruebas confiable antes de
                  lanzar un flujo completo de producto.
                </p>
              </div>
            </div>
            <div className="rounded-3xl border border-border/80 bg-secondary/70 p-5 md:max-w-xs">
              <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
                Incluido desde el primer dia
              </p>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-secondary-foreground">
                <li>Next.js 16.2.0 con App Router y TypeScript</li>
                <li>Jest + Testing Library para cobertura unitaria</li>
                <li>Pruebas smoke con Playwright para validar navegador</li>
                <li>Contratos de dominio mock-first para backend futuro</li>
              </ul>
            </div>
          </header>

          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <Link href="/dashboard" className={primaryLinkClassName}>
              Abrir base del panel
              <ArrowRight className="size-4" />
            </Link>
            <Link href="/courses" className={secondaryLinkClassName}>
              Revisar placeholders de funcionalidades
            </Link>
          </div>
        </div>
      </section>

      <section
        aria-labelledby="feature-foundation"
        className="mt-10 grid gap-4 md:grid-cols-3"
      >
        <h2 id="feature-foundation" className="sr-only">
          Modulos base
        </h2>
        {featureCards.map(({ title, description, icon: Icon }) => (
          <Card key={title} className="border-border/80 bg-card/85 backdrop-blur">
            <CardHeader className="space-y-4">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-accent/70 text-accent-foreground">
                <Icon className="size-5" />
              </div>
              <div className="space-y-2">
                <CardTitle>{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
              </div>
            </CardHeader>
          </Card>
        ))}
      </section>

      <section className="mt-10 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="border-border/80 bg-card/88 backdrop-blur">
          <CardHeader>
            <CardTitle>Lo que esta base ya modela</CardTitle>
            <CardDescription>
              La superficie de la app es intencionalmente liviana, pero la capa de dominio no.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm text-muted-foreground md:grid-cols-2">
            <div className="rounded-2xl bg-secondary/80 p-4">
              <p className="font-medium text-secondary-foreground">
                Modulo de cursos
              </p>
              <p className="mt-2 leading-6">
                Resumenes tipados y un contrato de repositorio para soportar
                catalogos, cohortes y metadatos de lecciones.
              </p>
            </div>
            <div className="rounded-2xl bg-secondary/80 p-4">
              <p className="font-medium text-secondary-foreground">
                Modulo de comunidad
              </p>
              <p className="mt-2 leading-6">
                Las publicaciones para miembros se representan de forma
                independiente de la interfaz, listas para una futura API o
                capa en tiempo real.
              </p>
            </div>
            <div className="rounded-2xl bg-secondary/80 p-4">
              <p className="font-medium text-secondary-foreground">
                Modulo de calendario
              </p>
              <p className="mt-2 leading-6">
                Los resumenes de eventos ya estan preparados para sesiones
                proximas, horas de consulta y lanzamientos.
              </p>
            </div>
            <div className="rounded-2xl bg-secondary/80 p-4">
              <p className="font-medium text-secondary-foreground">
                Fundamentos compartidos
              </p>
              <p className="mt-2 leading-6">
                Interfaz reutilizable, rutas consistentes y cobertura de pruebas
                sobre contratos y navegacion smoke.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.9),rgba(234,245,246,0.75))]">
          <CardHeader>
            <CardTitle>Placeholder de lista de espera</CardTitle>
            <CardDescription>
              Un formulario no funcional para reservar el espacio de marketing
              que llegara mas adelante en la hoja de ruta del producto.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" aria-label="Placeholder de lista de espera">
              <label className="block space-y-2 text-sm font-medium">
                Correo electronico
                <Input
                  type="email"
                  placeholder="community@academiaonline.dev"
                  aria-describedby="waitlist-help"
                />
              </label>
              <p id="waitlist-help" className="text-sm leading-6 text-muted-foreground">
                Este formulario se mantiene intencionalmente desconectado. La
                primera entrega trata sobre estructura y confianza, no sobre
                captacion de leads todavia.
              </p>
            </form>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
