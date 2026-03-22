import type { CalendarEvent } from "@/src/modules/calendar/domain/entities/calendar-event";
import type { CalendarEventRepository } from "@/src/modules/calendar/domain/repositories/calendar-event-repository";

import { mapCalendarEventDtoToEntity } from "../api/mapper";
import { CALENDAR_V1_ENDPOINTS } from "../api/contracts/v1";
import { parseCalendarEventsResponseDto } from "../api/dto/calendar-event-dto";

type HttpResponse = {
  ok: boolean;
  json(): Promise<unknown>;
};

type HttpFetcher = (input: string, init?: RequestInit) => Promise<HttpResponse>;

export class HttpCalendarEventRepository implements CalendarEventRepository {
  constructor(
    private readonly backendBaseUrl: string,
    private readonly fetcher: HttpFetcher = fetch as unknown as HttpFetcher
  ) {}

  async listCalendarEvents(): Promise<CalendarEvent[]> {
    const response = await this.fetcher(
      `${this.backendBaseUrl}${CALENDAR_V1_ENDPOINTS.listEvents}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error("Failed to fetch calendar events");
    }

    const payload = await response.json();
    const parsed = parseCalendarEventsResponseDto(payload);

    return parsed.items.map(mapCalendarEventDtoToEntity);
  }
}
