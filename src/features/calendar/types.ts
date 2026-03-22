export type CalendarEvent = {
  id: string;
  title: string;
  description: string;
  startAt: string;
  location: string;
  kind: "Office Hours" | "Workshop" | "Sprint Review";
};
