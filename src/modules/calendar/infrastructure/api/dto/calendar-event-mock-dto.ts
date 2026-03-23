import type { CalendarEventDto } from "./calendar-event-dto";

export const calendarEventMockDtos: CalendarEventDto[] = [
  {
    id: "event-office-hours",
    title: "Horas de consulta para operadores",
    description:
      "Una sesion en vivo de preguntas y respuestas para destrabar a miembros en sistemas, ofertas y cuellos de botella de ejecucion.",
    startAt: "2026-03-24 18:00 UTC",
    location: "Sala en vivo",
    kind: "Office Hours",
  },
  {
    id: "event-workshop",
    title: "Taller de lanzamiento de cohorte",
    description:
      "Una sesion guiada para alinear posicionamiento, precio y onboarding antes de la semana de lanzamiento.",
    startAt: "2026-03-27 16:00 UTC",
    location: "Espacio principal de talleres",
    kind: "Workshop",
  },
  {
    id: "event-sprint-review",
    title: "Revision de sprint para builders",
    description:
      "Un ciclo corto de revision para compartir avances y clarificar la siguiente tarea de mayor impacto.",
    startAt: "2026-03-29 14:00 UTC",
    location: "Hub de comunidad",
    kind: "Sprint Review",
  },
];
