import { calendarEventMocks } from "./mocks";
import type { CalendarEvent } from "./types";

export async function listCalendarEvents(): Promise<CalendarEvent[]> {
  return calendarEventMocks.map((event) => ({ ...event }));
}
