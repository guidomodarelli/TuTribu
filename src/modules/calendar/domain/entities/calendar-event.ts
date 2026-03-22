export type CalendarEventKind = "Office Hours" | "Workshop" | "Sprint Review";

export type CalendarEvent = {
  id: string;
  title: string;
  description: string;
  startAt: string;
  location: string;
  kind: CalendarEventKind;
};
