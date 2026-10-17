import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import {
  TRIBE_EVENT_ATTENDANCE_SUMMARY_VARIANT,
  TribeEventAttendanceSummary,
} from "@/components/events/tribe-event-attendance-summary";
import type { TribeEventOccurrenceResult } from "@/src/modules/events/application/results/tribe-event-result";

type AttendanceOccurrence = Pick<TribeEventOccurrenceResult, "attendance" | "capacity">;

const GOING_PREVIEW = [
  { id: "user-ana", image: null, name: "Ana Pérez" },
  { id: "user-juan", image: null, name: "Juan Gómez" },
  { id: "user-lucia", image: null, name: "Lucía Díaz" },
  { id: "user-pedro", image: null, name: "Pedro Ruiz" },
];

function createOccurrence(goingCount: number): AttendanceOccurrence {
  return {
    attendance: {
      goingCount,
      goingPreview: GOING_PREVIEW,
      maybeCount: 0,
      viewerStatus: null,
      viewerWaitlistPosition: null,
      waitlistedCount: 0,
    },
    capacity: null,
  };
}

describe("TribeEventAttendanceSummary", () => {
  it("counts the people going beyond the preview in the avatar stack", () => {
    const { container } = render(
      <TribeEventAttendanceSummary isPast={false} occurrence={createOccurrence(12)} />
    );

    expect(screen.getByText("+8")).toBeInTheDocument();
    // The sentence names the same people, so the stack stays decorative.
    expect(container.querySelector("[aria-hidden='true']")).toContainElement(
      screen.getByText("+8")
    );
  });

  it("collapses the compact preview to three avatars and counts the rest", () => {
    render(
      <TribeEventAttendanceSummary
        isPast={false}
        occurrence={createOccurrence(GOING_PREVIEW.length)}
        variant={TRIBE_EVENT_ATTENDANCE_SUMMARY_VARIANT.compact}
      />
    );

    expect(screen.getByText("+1")).toBeInTheDocument();
  });

  it("draws no overflow chip when the preview holds everyone going", () => {
    render(
      <TribeEventAttendanceSummary
        isPast={false}
        occurrence={createOccurrence(GOING_PREVIEW.length)}
      />
    );

    expect(screen.queryByText(/^\+\d+$/)).not.toBeInTheDocument();
  });
});
