import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { UpcomingTribeEvents } from "@/components/events/upcoming-tribe-events";

const EVENT_ID = "6f3c7a1e-2b4d-4c8e-9f10-1a2b3c4d5e6f";

describe("UpcomingTribeEvents", () => {
  it("renders nothing when the tribe has no upcoming events", () => {
    const { container } = render(
      <UpcomingTribeEvents events={[]} tribeSlug="matematica-pro" />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("lists the next occurrences with schedule, recurrence, and links", () => {
    render(
      <UpcomingTribeEvents
        events={[
          {
            attendance: {
              goingCount: 2,
              goingPreview: [],
              maybeCount: 0,
              viewerStatus: null,
              viewerWaitlistPosition: null,
              waitlistedCount: 0,
            },
            capacity: null,
            description: null,
            endsAt: "2026-05-13T19:00:00.000Z",
            eventId: EVENT_ID,
            meetingUrl: "https://meet.google.com/abc-defg-hij",
            eventType: "live",
            exception: null,
            occurrenceKey: `${EVENT_ID}@2026-05-13T18:00:00.000Z`,
            originalStartsAt: "2026-05-13T18:00:00.000Z",
            recurrenceFrequency: "weekly",
            recurrenceRule: "FREQ=WEEKLY",
            recurrenceUntil: null,
            seriesEndsAt: "2026-05-06T19:00:00.000Z",
            seriesStartsAt: "2026-05-06T18:00:00.000Z",
            startsAt: "2026-05-13T18:00:00.000Z",
            title: "Clase abierta",
          },
        ]}
        tribeSlug="matematica-pro"
      />
    );

    expect(screen.getByRole("heading", { name: "Próximos eventos" })).toBeInTheDocument();
    const eventLink = new URL(
      screen.getByRole("link", { name: "Clase abierta" }).getAttribute("href") ?? "",
      "https://dev-tutribu.app"
    );

    expect(eventLink.pathname).toBe("/matematica-pro/eventos");
    expect(eventLink.searchParams.get("month")).toBe("2026-05");
    expect(eventLink.searchParams.get("event")).toBe(`${EVENT_ID}@2026-05-13T18:00:00.000Z`);
    expect(screen.getByText(/13 may\.? · 15:00 - 16:00/)).toBeInTheDocument();
    expect(screen.getByText("Todas las semanas")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Abrir link" })).toHaveAttribute(
      "href",
      "https://meet.google.com/abc-defg-hij"
    );
    expect(screen.getByRole("link", { name: "Ver todos los eventos" })).toHaveAttribute(
      "href",
      "/matematica-pro/eventos"
    );
  });
});
