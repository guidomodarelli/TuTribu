import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { CalendarEventKind } from "@/src/modules/calendar/domain/entities/calendar-event";
import { createListCalendarEventsUseCase } from "@/src/modules/calendar/infrastructure/composition/create-list-calendar-events-use-case";

const calendarEventKindLabelByKind: Record<CalendarEventKind, string> = {
  "Office Hours": "Horas de consulta",
  Workshop: "Taller",
  "Sprint Review": "Revision de sprint",
};

export default async function CalendarPage() {
  const listCalendarEventsUseCase = createListCalendarEventsUseCase();
  const events = await listCalendarEventsUseCase.execute();

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
          Calendario
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Los proximos eventos ya fluyen por un contrato dedicado.
        </h1>
      </header>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {events.map((event) => (
          <Card key={event.id} className="border-border/80 bg-card/88">
            <CardHeader>
              <CardDescription>{calendarEventKindLabelByKind[event.kind]}</CardDescription>
              <CardTitle>{event.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm leading-6 text-muted-foreground">
              <p>{event.description}</p>
              <p>Comienza: {event.startAt}</p>
              <p>Ubicacion: {event.location}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
