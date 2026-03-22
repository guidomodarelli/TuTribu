import { ListCalendarEventsUseCase } from "@/src/modules/calendar/application/use-cases/list-calendar-events-use-case";
import type { CalendarEventRepository } from "@/src/modules/calendar/domain/repositories/calendar-event-repository";

describe("ListCalendarEventsUseCase", () => {
  it("returns calendar event summaries from the repository port", async () => {
    const calendarEventRepository: CalendarEventRepository = {
      listCalendarEvents: jest.fn().mockResolvedValue([
        {
          id: "event-1",
          title: "Operator Office Hours",
          description: "Q&A session",
          startAt: "2026-03-24 18:00 UTC",
          location: "Live room",
          kind: "Office Hours",
        },
      ]),
    };

    const useCase = new ListCalendarEventsUseCase(calendarEventRepository);

    const result = await useCase.execute();

    expect(calendarEventRepository.listCalendarEvents).toHaveBeenCalledTimes(1);
    expect(result).toEqual([
      {
        id: "event-1",
        title: "Operator Office Hours",
        description: "Q&A session",
        startAt: "2026-03-24 18:00 UTC",
        location: "Live room",
        kind: "Office Hours",
      },
    ]);
  });
});
