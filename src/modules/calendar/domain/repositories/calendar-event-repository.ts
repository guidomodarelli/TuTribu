import type { CalendarEvent } from "../entities/calendar-event";

export interface CalendarEventRepository {
  listCalendarEvents(): Promise<CalendarEvent[]>;
}
