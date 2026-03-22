import { HttpCalendarEventRepository } from "@/src/modules/calendar/infrastructure/repositories/http-calendar-event-repository";

describe("HttpCalendarEventRepository", () => {
  it("requests calendar events from backend and maps DTOs", async () => {
    const fetcher = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            id: "event-1",
            title: "Operator Office Hours",
            description: "Q&A session",
            startAt: "2026-03-24 18:00 UTC",
            location: "Live room",
            kind: "Office Hours",
          },
        ],
      }),
    });

    const repository = new HttpCalendarEventRepository(
      "https://api.academia.test",
      fetcher
    );

    const result = await repository.listCalendarEvents();

    expect(fetcher).toHaveBeenCalledWith(
      "https://api.academia.test/v1/calendar/events",
      expect.objectContaining({
        method: "GET",
      })
    );
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
