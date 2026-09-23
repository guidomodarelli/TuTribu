import { describe, expect, it } from "vitest";

import {
  HORIZONTAL_SWIPE_DIRECTION,
  resolveHorizontalSwipe,
} from "@/lib/gestures/horizontal-swipe";

describe("resolveHorizontalSwipe", () => {
  it("reads a fast leftward drag as a swipe towards the next page", () => {
    expect(resolveHorizontalSwipe({ deltaX: -90, deltaY: 10, durationMs: 250 })).toBe(
      HORIZONTAL_SWIPE_DIRECTION.next
    );
  });

  it("reads a rightward drag as a swipe towards the previous page", () => {
    expect(resolveHorizontalSwipe({ deltaX: 90, deltaY: -12, durationMs: 250 })).toBe(
      HORIZONTAL_SWIPE_DIRECTION.previous
    );
  });

  it("ignores short drags, mostly vertical drags and slow drags", () => {
    expect(resolveHorizontalSwipe({ deltaX: -30, deltaY: 0, durationMs: 200 })).toBeNull();
    expect(resolveHorizontalSwipe({ deltaX: -90, deltaY: 80, durationMs: 200 })).toBeNull();
    expect(resolveHorizontalSwipe({ deltaX: -90, deltaY: 0, durationMs: 2_000 })).toBeNull();
  });
});
