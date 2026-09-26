import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { TribeEventAgendaItem } from "@/components/events/tribe-event-agenda-item";
import { TribeEventsAgenda } from "@/components/events/tribe-events-agenda";
import { TribeEventsTypeFilter } from "@/components/events/tribe-events-type-filter";
import { groupAgendaDays } from "@/lib/events/tribe-events-calendar-grid";
import type { TribeEventOccurrenceResult } from "@/src/modules/events/application/results/tribe-event-result";

// Real timers on purpose: rows leave with an exit animation driven by
// animation frames, so the test waits for them the way a viewer would.
const EVENT_ID = "6f3c7a1e-2b4d-4c8e-9f10-1a2b3c4d5e6f";
const OTHER_EVENT_ID = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const THIRD_EVENT_ID = "9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b";
/** Clock of the rows: after May 3 and before May 6 and 13, 2026. */
const NOW_TIME = new Date("2026-05-05T12:00:00.000Z").getTime();

function createOccurrence(
  overrides: Partial<TribeEventOccurrenceResult> = {}
): TribeEventOccurrenceResult {
  const startsAt = overrides.startsAt ?? "2026-05-06T18:00:00.000Z";
  const eventId = overrides.eventId ?? EVENT_ID;

  return {
    attendance: {
      goingCount: 0,
      goingPreview: [],
      maybeCount: 0,
      viewerStatus: null,
      viewerWaitlistPosition: null,
      waitlistedCount: 0,
    },
    capacity: null,
    description: null,
    endsAt: null,
    eventId,
    eventType: "live",
    exception: null,
    meetingUrl: null,
    occurrenceKey: `${eventId}@${startsAt}`,
    originalStartsAt: startsAt,
    recurrenceFrequency: "none",
    recurrenceRule: null,
    recurrenceUntil: null,
    seriesEndsAt: startsAt,
    seriesStartsAt: startsAt,
    startsAt,
    title: "Clase abierta",
    ...overrides,
  };
}

const pastOccurrence = createOccurrence({
  eventId: OTHER_EVENT_ID,
  startsAt: "2026-05-03T18:00:00.000Z",
  title: "Ronda pasada",
});
const upcomingOccurrence = createOccurrence();
const sameDayOccurrence = createOccurrence({
  eventId: THIRD_EVENT_ID,
  startsAt: "2026-05-06T21:00:00.000Z",
  title: "Cierre del día",
});

function renderAgenda(
  occurrences: TribeEventOccurrenceResult[],
  props: Partial<React.ComponentProps<typeof TribeEventsAgenda>> = {}
) {
  return (
    <TribeEventsAgenda
      agendaDays={groupAgendaDays(occurrences)}
      arePastEventsVisible
      pastEventsCount={1}
      renderOccurrence={(occurrence) => (
        <TribeEventAgendaItem
          key={occurrence.occurrenceKey}
          nowTime={NOW_TIME}
          occurrence={occurrence}
          viewerTimeZone={null}
          onSelect={vi.fn()}
        />
      )}
      shouldCollapsePastEvents
      todayKey={null}
      onTogglePastEvents={vi.fn()}
      {...props}
    />
  );
}

describe("TribeEventsAgenda", () => {
  it("lets a folded day leave the list while the remaining days stay", async () => {
    const { rerender } = render(renderAgenda([pastOccurrence, upcomingOccurrence]));

    expect(screen.getByRole("button", { name: "Ronda pasada" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ocultar finalizados" })).toHaveAttribute(
      "aria-expanded",
      "true"
    );

    rerender(renderAgenda([upcomingOccurrence], { arePastEventsVisible: false }));

    expect(screen.getByRole("button", { name: "Ver 1 finalizado" })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Ronda pasada" })).not.toBeInTheDocument()
    );
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Clase abierta" })).toBeInTheDocument();
  });

  it("adds and removes rows inside a day that stays on screen", async () => {
    const { rerender } = render(renderAgenda([upcomingOccurrence]));

    rerender(renderAgenda([upcomingOccurrence, sameDayOccurrence]));

    const day = screen.getByRole("heading", { name: "Miércoles 6 de mayo" }).closest("section");

    expect(within(day as HTMLElement).getAllByRole("listitem")).toHaveLength(2);

    rerender(renderAgenda([upcomingOccurrence]));

    await waitFor(() =>
      expect(within(day as HTMLElement).getAllByRole("listitem")).toHaveLength(1)
    );
    expect(within(day as HTMLElement).getByRole("button", { name: "Clase abierta" })).toBeInTheDocument();
  });

  it("renders rows present on the first render fully visible", () => {
    render(renderAgenda([pastOccurrence, upcomingOccurrence]));

    for (const row of screen.getAllByRole("listitem")) {
      expect(row.getAttribute("style") ?? "").not.toMatch(/opacity:\s*0/);
    }
  });
});

describe("TribeEventsTypeFilter", () => {
  it("toggles type chips and clears them with «Todos»", async () => {
    const user = userEvent.setup();
    const onToggleType = vi.fn();
    const onClear = vi.fn();

    const { rerender } = render(
      <TribeEventsTypeFilter selectedTypes={[]} onClear={onClear} onToggleType={onToggleType} />
    );
    const filters = screen.getByRole("group", { name: "Filtrar por tipo de evento" });

    expect(within(filters).getByRole("button", { name: "Todos" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    await user.click(within(filters).getByRole("button", { name: "Social" }));

    expect(onToggleType).toHaveBeenCalledWith("social");

    rerender(
      <TribeEventsTypeFilter
        selectedTypes={["social"]}
        onClear={onClear}
        onToggleType={onToggleType}
      />
    );

    expect(within(filters).getByRole("button", { name: "Social" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(within(filters).getByRole("button", { name: "Todos" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );

    await user.click(within(filters).getByRole("button", { name: "Todos" }));

    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
