/**
 * Resolved carousel slide indices after Embla emits a `reInit` (image preload
 * decode finishing, or a relayout during navigation).
 */
export type ImageCarouselSlideIndicesOnReInit = {
  /** The slide that drives the responsive progress indicator. */
  activeSlideIndex: number;
  /** The slide that drives video iframe mounting. */
  settledSlideIndex: number;
  /** Whether a scroll window remains open after the `reInit`. */
  isScrollInProgress: boolean;
};

/**
 * Resolves the carousel slide indices when a `reInit` fires.
 *
 * In Embla 8.6.0 a `reInit` runs `reActivate`, which captures the currently
 * selected snap, destroys the engine (stopping its `requestAnimationFrame`
 * animation), and recreates it **at rest** on that snap, emitting only `reInit`
 * and never a follow-up `settle`. A `reInit` therefore ends any in-flight scroll:
 * by the time this resolution is applied the carousel is already idle, so the
 * iframe-driving settled index must finalize to the selected snap. Freezing it
 * here would strand a video on its poster (or keep a stale iframe mounted) until
 * the next scroll, because no `settle` will arrive to advance it.
 *
 * @param selectedSnapIndex - The slide Embla reports as selected after the reInit.
 * @returns The active and settled indices to apply, with the scroll window closed.
 */
export function resolveImageCarouselSlideIndicesOnReInit(
  selectedSnapIndex: number
): ImageCarouselSlideIndicesOnReInit {
  return {
    activeSlideIndex: selectedSnapIndex,
    settledSlideIndex: selectedSnapIndex,
    isScrollInProgress: false,
  };
}
