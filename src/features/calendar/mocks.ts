import type { CalendarEvent } from "./types";

export const calendarEventMocks: CalendarEvent[] = [
  {
    id: "event-office-hours",
    title: "Operator Office Hours",
    description:
      "A live Q&A to unblock members on systems, offers, and execution bottlenecks.",
    startAt: "2026-03-24 18:00 UTC",
    location: "Live room",
    kind: "Office Hours",
  },
  {
    id: "event-workshop",
    title: "Cohort Launch Workshop",
    description:
      "A guided session to align positioning, pricing, and onboarding before launch week.",
    startAt: "2026-03-27 16:00 UTC",
    location: "Main workshop space",
    kind: "Workshop",
  },
  {
    id: "event-sprint-review",
    title: "Builder Sprint Review",
    description:
      "A short review cycle to share progress and clarify the next high-leverage task.",
    startAt: "2026-03-29 14:00 UTC",
    location: "Community hub",
    kind: "Sprint Review",
  },
];
