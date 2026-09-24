import { describe, expect, it } from "vitest";

import {
  formatAttendanceCounts,
  formatAttendanceStreak,
  formatCapacityStatus,
  formatGoingNames,
  formatWaitlistPosition,
} from "@/lib/events/tribe-event-attendance-copy";

const ANA = { id: "user-ana", image: null, name: "Ana Pérez" };
const JUAN = { id: "user-juan", image: null, name: "Juan" };
const SOL = { id: "user-sol", image: null, name: "Sol" };

describe("formatGoingNames", () => {
  it("returns null when nobody is going", () => {
    expect(formatGoingNames([], 0, false)).toBeNull();
  });

  it("names up to two people by first name and counts the rest", () => {
    expect(formatGoingNames([ANA], 1, false)).toBe("Ana va");
    expect(formatGoingNames([ANA, JUAN], 2, false)).toBe("Ana y Juan van");
    expect(formatGoingNames([ANA, JUAN, SOL], 12, false)).toBe("Ana, Juan y 10 más van");
    expect(formatGoingNames([ANA], 4, false)).toBe("Ana y 3 más van");
  });

  it("uses the past tense for finished occurrences", () => {
    expect(formatGoingNames([ANA], 1, true)).toBe("Ana fue");
    expect(formatGoingNames([ANA, JUAN], 5, true)).toBe("Ana, Juan y 3 más fueron");
  });

  it("falls back to the total when there is no preview", () => {
    expect(formatGoingNames([], 7, false)).toBe("7 van");
  });
});

describe("formatAttendanceCounts", () => {
  it("summarizes going and maybe answers", () => {
    expect(formatAttendanceCounts(12, 3, false)).toBe("12 van · 3 tal vez");
    expect(formatAttendanceCounts(1, 0, false)).toBe("1 va");
    expect(formatAttendanceCounts(0, 2, false)).toBe("0 van · 2 tal vez");
    expect(formatAttendanceCounts(4, 1, true)).toBe("4 fueron · 1 tal vez");
  });

  it("returns null when nobody answered going or maybe", () => {
    expect(formatAttendanceCounts(0, 0, false)).toBeNull();
  });
});

describe("formatCapacityStatus", () => {
  it("returns null without a capacity", () => {
    expect(formatCapacityStatus(null, 10, 0)).toBeNull();
  });

  it("reports the free seats", () => {
    expect(formatCapacityStatus(10, 7, 0)).toBe("Quedan 3 lugares");
    expect(formatCapacityStatus(10, 9, 0)).toBe("Queda 1 lugar");
  });

  it("reports a full occurrence and its waitlist, also above capacity", () => {
    expect(formatCapacityStatus(10, 10, 0)).toBe("Completo");
    expect(formatCapacityStatus(10, 10, 2)).toBe("Completo · 2 en espera");
    expect(formatCapacityStatus(3, 5, 1)).toBe("Completo · 1 en espera");
  });
});

describe("formatWaitlistPosition", () => {
  it("shows the position only for waitlisted viewers", () => {
    expect(formatWaitlistPosition("waitlisted", 2)).toBe("Estás en lista de espera · posición 2");
    expect(formatWaitlistPosition("going", null)).toBeNull();
  });
});

describe("formatAttendanceStreak", () => {
  it("builds the viewer-only streak line", () => {
    expect(formatAttendanceStreak({ attendedCount: 4, occurrenceCount: 5 })).toBe(
      "Fuiste a 4 de los últimos 5 encuentros 🔥"
    );
  });
});
