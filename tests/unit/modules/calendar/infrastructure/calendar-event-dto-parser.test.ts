import { parseCalendarEventsResponseDto } from "@/src/modules/calendar/infrastructure/api/dto/calendar-event-dto";

describe("parseCalendarEventsResponseDto", () => {
  it("throws when payload does not include items array", () => {
    expect(() => parseCalendarEventsResponseDto({})).toThrow(
      "Invalid calendar events payload"
    );
  });

  it("throws when any item has invalid shape", () => {
    expect(() =>
      parseCalendarEventsResponseDto({
        items: [
          {
            id: "event-1",
            title: "Office Hours",
            description: "Session",
            startAt: "2026-03-24 18:00 UTC",
            location: "Live room",
            kind: "Invalid",
          },
        ],
      })
    ).toThrow("Invalid calendar event item payload");
  });
});
