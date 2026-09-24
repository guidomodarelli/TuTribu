/**
 * Pure classification of a pointer drag into a horizontal swipe. Kept apart
 * from the DOM so thresholds are unit-testable and shared by any pager.
 */

export const HORIZONTAL_SWIPE_DIRECTION = {
  next: "next",
  previous: "previous",
} as const;

export type HorizontalSwipeDirection =
  (typeof HORIZONTAL_SWIPE_DIRECTION)[keyof typeof HORIZONTAL_SWIPE_DIRECTION];

export type HorizontalSwipeGesture = {
  deltaX: number;
  deltaY: number;
  durationMs: number;
};

/** Minimum horizontal travel, in CSS pixels, to count as a swipe. */
const SWIPE_MIN_DISTANCE_PX = 60;
/** Horizontal travel must dominate vertical travel by this ratio. */
const SWIPE_HORIZONTAL_DOMINANCE_RATIO = 1.5;
/** Slower drags read as reading/scrolling, not as a page flip. */
const SWIPE_MAX_DURATION_MS = 800;

/**
 * Decides whether a drag is a deliberate horizontal swipe. A leftward swipe
 * moves to the next page and a rightward one to the previous page, like
 * turning a calendar page.
 *
 * @param gesture - Pointer travel and duration.
 * @returns The swipe direction, or null when the drag is not a swipe.
 */
export function resolveHorizontalSwipe(
  gesture: HorizontalSwipeGesture
): HorizontalSwipeDirection | null {
  const horizontalDistance = Math.abs(gesture.deltaX);

  if (
    horizontalDistance < SWIPE_MIN_DISTANCE_PX ||
    horizontalDistance < Math.abs(gesture.deltaY) * SWIPE_HORIZONTAL_DOMINANCE_RATIO ||
    gesture.durationMs > SWIPE_MAX_DURATION_MS
  ) {
    return null;
  }

  return gesture.deltaX < 0
    ? HORIZONTAL_SWIPE_DIRECTION.next
    : HORIZONTAL_SWIPE_DIRECTION.previous;
}
