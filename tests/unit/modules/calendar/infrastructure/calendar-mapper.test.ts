import { mapCalendarEventDtoToEntity } from "@/src/modules/calendar/infrastructure/api/mapper";

describe("mapCalendarEventDtoToEntity", () => {
  it("maps calendar DTO payload into domain entity", () => {
    const result = mapCalendarEventDtoToEntity({
      id: "event-1",
      title: "Operator Office Hours",
      description: "Q&A session",
      startAt: "2026-03-24 18:00 UTC",
      location: "Live room",
      kind: "Office Hours",
    });

    expect(result).toEqual({
      id: "event-1",
      title: "Operator Office Hours",
      description: "Q&A session",
      startAt: "2026-03-24 18:00 UTC",
      location: "Live room",
      kind: "Office Hours",
    });
  });
});
