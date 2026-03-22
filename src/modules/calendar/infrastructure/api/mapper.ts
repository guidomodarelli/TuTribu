import type { CalendarEvent } from "@/src/modules/calendar/domain/entities/calendar-event";

import type { CalendarEventDto } from "./dto/calendar-event-dto";

export function mapCalendarEventDtoToEntity(dto: CalendarEventDto): CalendarEvent {
  return {
    id: dto.id,
    title: dto.title,
    description: dto.description,
    startAt: dto.startAt,
    location: dto.location,
    kind: dto.kind,
  };
}
