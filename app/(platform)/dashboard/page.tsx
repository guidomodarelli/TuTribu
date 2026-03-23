import { ArrowUpRight, CalendarClock, MessageSquareText, NotebookTabs } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { createListCalendarEventsUseCase } from "@/src/modules/calendar/infrastructure/composition/create-list-calendar-events-use-case";
import { createListCommunityPostsUseCase } from "@/src/modules/community/infrastructure/composition/create-list-community-posts-use-case";
import { createListCoursesUseCase } from "@/src/modules/courses/infrastructure/composition/create-list-courses-use-case";

const dashboardSections = [
  {
    title: "Impulso del plan de estudios",
    description: "Los cursos se modelan como resumenes reutilizables para vistas de catalogo y cohorte.",
    icon: NotebookTabs,
  },
  {
    title: "Pulso de conversaciones",
    description: "Las conversaciones de comunidad ya incluyen identidad de autor y metricas de interaccion.",
    icon: MessageSquareText,
  },
  {
    title: "Ritmo de eventos",
    description: "Las entradas de calendario ya estan preparadas para sesiones proximas y planificacion operativa.",
    icon: CalendarClock,
  },
] as const;

export default async function DashboardPage() {
  const listCoursesUseCase = createListCoursesUseCase();
  const listCommunityPostsUseCase = createListCommunityPostsUseCase();
  const listCalendarEventsUseCase = createListCalendarEventsUseCase();

  const [courses, posts, events] = await Promise.all([
    listCoursesUseCase.execute(),
    listCommunityPostsUseCase.execute(),
    listCalendarEventsUseCase.execute(),
  ]);

  const stats = [
    { label: "Cursos", value: courses.length.toString().padStart(2, "0") },
    { label: "Publicaciones", value: posts.length.toString().padStart(2, "0") },
    { label: "Eventos", value: events.length.toString().padStart(2, "0") },
  ];

  return (
    <section className="space-y-6">
      <header className="space-y-3">
        <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
          Placeholder del panel
        </p>
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">
            Una sala de control estable para la siguiente fase del producto.
          </h1>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            Este panel es intencionalmente liviano. Su objetivo es validar la
            estructura de rutas, los contratos de dominio y los fundamentos de
            interfaz reutilizable.
          </p>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        {stats.map((stat) => (
          <Card key={stat.label} className="border-border/80 bg-card/85">
            <CardHeader>
              <CardDescription>{stat.label}</CardDescription>
              <CardTitle className="text-4xl">{stat.value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card className="border-border/80 bg-card/88">
          <CardHeader>
            <CardTitle>Estado de funcionalidades</CardTitle>
            <CardDescription>
              Cada area ya expone un contrato de lectura que luego puede reemplazar mocks por un servicio real.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {dashboardSections.map(({ title, description, icon: Icon }, index) => (
              <div key={title}>
                <div className="flex items-start gap-3">
                  <div className="mt-1 flex size-10 items-center justify-center rounded-2xl bg-accent/60 text-accent-foreground">
                    <Icon className="size-4" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-medium">{title}</p>
                    <p className="text-sm leading-6 text-muted-foreground">
                      {description}
                    </p>
                  </div>
                </div>
                {index < dashboardSections.length - 1 ? (
                  <Separator className="my-4" />
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-border/80 bg-secondary/75">
          <CardHeader>
            <CardTitle>Siguiente paso probable</CardTitle>
            <CardDescription>
              Conectar los contratos existentes con autenticacion y persistencia.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-6 text-muted-foreground">
            <p>
              El codebase ya esta ordenado para que la interfaz no requiera una
              reescritura grande cuando se reemplacen repositorios mock por
              Supabase u otro backend.
            </p>
            <div className="rounded-2xl bg-background/80 p-4 text-foreground">
              <p className="flex items-center gap-2 font-medium">
                Direccion sugerida
                <ArrowUpRight className="size-4" />
              </p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Agrega autenticacion y persistencia detras de las firmas actuales
                de repositorio y luego evoluciona las paginas placeholder hacia
                flujos listos para miembros.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
