import { ListCalendarEventsUseCase } from "@/src/modules/calendar/application/use-cases/list-calendar-events-use-case";
import { resolveBackendBaseUrl } from "@/src/modules/shared/infrastructure/backend/backend-base-url";

import { HttpCalendarEventRepository } from "../repositories/http-calendar-event-repository";
import { MockCalendarEventRepository } from "../repositories/mock-calendar-event-repository";

export function createListCalendarEventsUseCase(): ListCalendarEventsUseCase {
  const backendBaseUrl = resolveBackendBaseUrl();

  if (backendBaseUrl) {
    return new ListCalendarEventsUseCase(
      new HttpCalendarEventRepository(backendBaseUrl)
    );
  }

  return new ListCalendarEventsUseCase(new MockCalendarEventRepository());
}
