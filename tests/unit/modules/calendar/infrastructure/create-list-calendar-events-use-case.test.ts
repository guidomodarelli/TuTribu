import { createListCalendarEventsUseCase } from "@/src/modules/calendar/infrastructure/composition/create-list-calendar-events-use-case";

describe("createListCalendarEventsUseCase", () => {
  const originalEnv = process.env.ACADEMIA_BACKEND_BASE_URL;
  const originalFetch = global.fetch;

  afterEach(() => {
    process.env.ACADEMIA_BACKEND_BASE_URL = originalEnv;
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("uses mock repository when backend base url is missing", async () => {
    delete process.env.ACADEMIA_BACKEND_BASE_URL;
    global.fetch = jest.fn() as unknown as typeof fetch;

    const useCase = createListCalendarEventsUseCase();
    const result = await useCase.execute();

    expect(global.fetch).not.toHaveBeenCalled();
    expect(result.length).toBeGreaterThan(0);
  });

  it("uses http repository when backend base url exists", async () => {
    process.env.ACADEMIA_BACKEND_BASE_URL = "https://api.academia.test";
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            id: "event-1",
            title: "Office Hours",
            description: "Session",
            startAt: "2026-03-24 18:00 UTC",
            location: "Live room",
            kind: "Office Hours",
          },
        ],
      }),
    }) as unknown as typeof fetch;

    const useCase = createListCalendarEventsUseCase();
    await useCase.execute();

    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.academia.test/v1/calendar/events",
      expect.objectContaining({ method: "GET" })
    );
  });
});
