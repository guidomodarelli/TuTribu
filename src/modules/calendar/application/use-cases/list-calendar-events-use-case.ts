import type { CalendarEventRepository } from "../../domain/repositories/calendar-event-repository";
import type { CalendarEventSummaryResult } from "../results/calendar-event-summary-result";

export class ListCalendarEventsUseCase {
  constructor(private readonly calendarEventRepository: CalendarEventRepository) {}

  async execute(): Promise<CalendarEventSummaryResult[]> {
    const events = await this.calendarEventRepository.listCalendarEvents();

    return events.map((event) => ({ ...event }));
  }
}
