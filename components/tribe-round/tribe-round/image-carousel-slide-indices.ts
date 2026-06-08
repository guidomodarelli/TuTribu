/**
 * Inputs needed to decide the settled carousel slide index after Embla emits a
 * `reInit` (image preload decode or a relayout during navigation).
 */
export type SettledImageCarouselSlideIndexOnReInitInput = {
  /** The slide Embla currently reports as selected. */
  selectedSnapIndex: number;
  /** The settled index that currently drives video iframe mounting. */
  currentSettledSlideIndex: number;
  /**
   * Whether Embla is mid-scroll, i.e. a `select` opened a scroll window that no
   * `settle` has closed yet.
   */
  isScrollInProgress: boolean;
};

/**
 * Resolves the next settled carousel slide index when a `reInit` fires.
 *
 * The settled index drives video iframe mount/unmount, so it must stay frozen
 * while Embla is mid-scroll. Otherwise a `reInit` triggered while a scroll
 * animation is still running (image preload decode finishing, or a relayout
 * during navigation) would mount or tear down a cross-origin player
 * mid-transition, which stalls Embla's rAF animation and makes the arrow
 * controls appear stuck. From a settled (non-animated) state the index follows
 * the currently selected snap so the active video slide mounts its player.
 *
 * @param input - The selected snap, current settled index, and scroll state.
 * @returns The settled slide index the `reInit` may apply.
 */
export function resolveSettledImageCarouselSlideIndexOnReInit({
  selectedSnapIndex,
  currentSettledSlideIndex,
  isScrollInProgress,
}: SettledImageCarouselSlideIndexOnReInitInput): number {
  return isScrollInProgress ? currentSettledSlideIndex : selectedSnapIndex;
}
