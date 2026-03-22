import type { CalendarEvent } from "@/src/modules/calendar/domain/entities/calendar-event";
import type { CalendarEventRepository } from "@/src/modules/calendar/domain/repositories/calendar-event-repository";

import { mapCalendarEventDtoToEntity } from "../api/mapper";
import { calendarEventMockDtos } from "../api/dto/calendar-event-mock-dto";

export class MockCalendarEventRepository implements CalendarEventRepository {
  async listCalendarEvents(): Promise<CalendarEvent[]> {
    const events = calendarEventMockDtos.map(mapCalendarEventDtoToEntity);

    return events.map((event) => ({ ...event }));
  }
}
