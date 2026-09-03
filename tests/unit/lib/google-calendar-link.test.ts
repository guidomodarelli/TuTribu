import { buildGoogleCalendarEventUrl } from "@/lib/calendar/google-calendar-link";

describe("buildGoogleCalendarEventUrl", () => {
  it("builds a template link with dates, details, location, and recurrence", () => {
    const url = new URL(
      buildGoogleCalendarEventUrl({
        defaultDurationMinutes: 60,
        description: "Repaso mensual",
        endsAt: "2026-05-06T19:00:00.000Z",
        location: "https://meet.google.com/abc-defg-hij",
        recurrenceRule: "FREQ=WEEKLY",
        startsAt: "2026-05-06T18:00:00.000Z",
        title: "Clase abierta",
      })
    );

    expect(url.origin + url.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("text")).toBe("Clase abierta");
    expect(url.searchParams.get("dates")).toBe("20260506T180000Z/20260506T190000Z");
    expect(url.searchParams.get("details")).toBe("Repaso mensual");
    expect(url.searchParams.get("location")).toBe("https://meet.google.com/abc-defg-hij");
    expect(url.searchParams.get("recur")).toBe("RRULE:FREQ=WEEKLY");
  });

  it("applies the default duration and omits empty fields", () => {
    const url = new URL(
      buildGoogleCalendarEventUrl({
        defaultDurationMinutes: 90,
        description: null,
        endsAt: null,
        location: null,
        recurrenceRule: null,
        startsAt: "2026-05-06T18:00:00.000Z",
        title: "Clase abierta",
      })
    );

    expect(url.searchParams.get("dates")).toBe("20260506T180000Z/20260506T193000Z");
    expect(url.searchParams.has("details")).toBe(false);
    expect(url.searchParams.has("location")).toBe(false);
    expect(url.searchParams.has("recur")).toBe(false);
  });
});
