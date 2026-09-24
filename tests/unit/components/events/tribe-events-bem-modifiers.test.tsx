import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import {
  TRIBE_EVENT_ATTENDANCE_SUMMARY_VARIANT,
  TribeEventAttendanceSummary,
} from "@/components/events/tribe-event-attendance-summary";
import { TribeEventAgendaItem } from "@/components/events/tribe-event-agenda-item";
import { TribeEventsMonthGrid } from "@/components/events/tribe-events-month-grid";
import type { TribeEventOccurrenceResult } from "@/src/modules/events/application/results/tribe-event-result";

// Vitest resolves CSS Modules with the non-scoped strategy, so the rendered
// class names are the BEM names the stylesheet exposes.
const EVENT_ID = "6f3c7a1e-2b4d-4c8e-9f10-1a2b3c4d5e6f";
const STARTS_AT = "2026-05-06T18:00:00.000Z";
const ENDS_AT = "2026-05-06T19:00:00.000Z";
const AFTER_THE_EVENT = new Date("2026-05-07T12:00:00.000Z").getTime();
const ANA = { id: "user-ana", image: null, name: "Ana Pérez" };

function createOccurrence(
  overrides: Partial<TribeEventOccurrenceResult> = {}
): TribeEventOccurrenceResult {
  return {
    attendance: {
      goingCount: 1,
      goingPreview: [ANA],
      maybeCount: 0,
      viewerStatus: null,
      viewerWaitlistPosition: null,
      waitlistedCount: 0,
    },
    capacity: null,
    description: null,
    endsAt: ENDS_AT,
    eventId: EVENT_ID,
    meetingUrl: null,
    occurrenceKey: `${EVENT_ID}@${STARTS_AT}`,
    recurrenceFrequency: "weekly",
    recurrenceRule: "FREQ=WEEKLY",
    recurrenceUntil: null,
    seriesEndsAt: ENDS_AT,
    seriesStartsAt: STARTS_AT,
    eventType: "live",
    exception: null,
    originalStartsAt: STARTS_AT,
    startsAt: STARTS_AT,
    title: "Clase abierta",
    ...overrides,
  };
}

describe("events BEM modifiers keep their root block", () => {
  it("renders the compact attendance summary on its root block", () => {
    render(
      <TribeEventAttendanceSummary
        isPast={false}
        occurrence={createOccurrence()}
        variant={TRIBE_EVENT_ATTENDANCE_SUMMARY_VARIANT.compact}
      />
    );

    const summaryRoot = screen.getByText("1 va").closest("p")?.parentElement?.parentElement;

    expect(summaryRoot).toHaveClass(
      "TribeEventAttendanceSummary",
      "TribeEventAttendanceSummary--compact"
    );
  });

  it("renders the full attendance summary without the compact modifier", () => {
    render(<TribeEventAttendanceSummary isPast={false} occurrence={createOccurrence()} />);

    const summaryRoot = screen.getByText("1 va").closest("p")?.parentElement?.parentElement;

    expect(summaryRoot).toHaveClass("TribeEventAttendanceSummary");
    expect(summaryRoot).not.toHaveClass("TribeEventAttendanceSummary--compact");
  });

  it("marks a finished agenda row with the past modifier on its root block", () => {
    render(
      <ul>
        <TribeEventAgendaItem
          nowTime={AFTER_THE_EVENT}
          occurrence={createOccurrence()}
          viewerTimeZone={null}
          onSelect={vi.fn()}
        />
      </ul>
    );

    expect(screen.getByRole("listitem")).toHaveClass(
      "TribeEventAgendaItem",
      "TribeEventAgendaItem--past"
    );
  });

  it("keeps the base month grid elements under today, muted and past modifiers", () => {
    const pastOccurrence = createOccurrence();

    render(
      <TribeEventsMonthGrid
        activeDayKey={null}
        calendarDays={[
          { dateKey: "2026-04-30", dayNumber: 30, isCurrentMonth: false },
          { dateKey: "2026-05-06", dayNumber: 6, isCurrentMonth: true },
        ]}
        nowTime={AFTER_THE_EVENT}
        occurrencesByDay={{ "2026-05-06": [pastOccurrence] }}
        renderOccurrence={() => null}
        todayKey="2026-05-06"
        onSelectDay={vi.fn()}
        onSelectOccurrence={vi.fn()}
      />
    );

    const todayCell = screen.getByRole("cell", { current: "date" });

    expect(todayCell).toHaveClass(
      "TribeEventsMonthGrid__dayCell",
      "TribeEventsMonthGrid__dayCell--today"
    );
    expect(screen.getByText("30")).toHaveClass(
      "TribeEventsMonthGrid__dayNumber",
      "TribeEventsMonthGrid__dayNumber--muted"
    );
    expect(screen.getByRole("button", { name: /Clase abierta/ })).toHaveClass(
      "TribeEventsMonthGrid__eventPill",
      "TribeEventsMonthGrid__eventPill--past"
    );
    expect(
      todayCell.querySelector(".TribeEventsMonthGrid__dayDot.TribeEventsMonthGrid__dayDot--past")
    ).not.toBeNull();
  });
});
