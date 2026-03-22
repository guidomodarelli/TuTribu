import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createListCalendarEventsUseCase } from "@/src/modules/calendar/infrastructure/composition/create-list-calendar-events-use-case";

export default async function CalendarPage() {
  const listCalendarEventsUseCase = createListCalendarEventsUseCase();
  const events = await listCalendarEventsUseCase.execute();

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
          Calendar
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Upcoming events already flow through a dedicated contract.
        </h1>
      </header>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {events.map((event) => (
          <Card key={event.id} className="border-border/80 bg-card/88">
            <CardHeader>
              <CardDescription>{event.kind}</CardDescription>
              <CardTitle>{event.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm leading-6 text-muted-foreground">
              <p>{event.description}</p>
              <p>Starts at: {event.startAt}</p>
              <p>Location: {event.location}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
