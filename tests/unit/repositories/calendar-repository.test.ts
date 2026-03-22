import { listCalendarEvents } from "@/src/features/calendar/repository";

describe("listCalendarEvents", () => {
  it("returns calendar events shaped for scheduling screens", async () => {
    await expect(listCalendarEvents()).resolves.toEqual(
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
