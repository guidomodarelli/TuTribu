import { describe, expect, it } from "vitest";

import {
  applyOptimisticTribeEventReaction,
  getNextTribeEventReaction,
} from "@/lib/events/tribe-event-reaction-state";

const baseline = {
  counts: { fire: 2, neutral: 0, thumbs_up: 1 },
  viewerReaction: "fire" as const,
};

describe("getNextTribeEventReaction", () => {
  it("selects a new reaction and removes the current one when tapped again", () => {
    expect(getNextTribeEventReaction(null, "fire")).toBe("fire");
    expect(getNextTribeEventReaction("fire", "thumbs_up")).toBe("thumbs_up");
    expect(getNextTribeEventReaction("fire", "fire")).toBeNull();
  });
});

describe("applyOptimisticTribeEventReaction", () => {
  it("moves the viewer vote between reactions", () => {
    expect(applyOptimisticTribeEventReaction(baseline, "thumbs_up")).toEqual({
      counts: { fire: 1, neutral: 0, thumbs_up: 2 },
      viewerReaction: "thumbs_up",
    });
  });

  it("removes the viewer vote without going below zero", () => {
    expect(
      applyOptimisticTribeEventReaction(
        { counts: { fire: 0, neutral: 0, thumbs_up: 0 }, viewerReaction: "fire" },
        null
      )
    ).toEqual({ counts: { fire: 0, neutral: 0, thumbs_up: 0 }, viewerReaction: null });
  });

  it("keeps the baseline when the intent equals it", () => {
    expect(applyOptimisticTribeEventReaction(baseline, "fire")).toBe(baseline);
  });
});
