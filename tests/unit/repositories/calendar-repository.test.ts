import { createListCalendarEventsUseCase } from "@/src/modules/calendar/infrastructure/composition/create-list-calendar-events-use-case";

describe("createListCalendarEventsUseCase", () => {
  it("returns calendar events shaped for scheduling screens", async () => {
    const useCase = createListCalendarEventsUseCase();

    await expect(useCase.execute()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: expect.any(String),
          title: expect.any(String),
          description: expect.any(String),
          location: expect.any(String),
          kind: expect.any(String),
        }),
      ])
    );
  });
});
